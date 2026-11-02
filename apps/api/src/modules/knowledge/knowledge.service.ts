import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta, type PaginatedResponse } from '@crm/shared';
import { KnowledgeEntryEntity } from './knowledge-entry.entity';
import { ProsalesClientService } from '../ai-agents/prosales-client.service';

export interface CreateKnowledgeEntryDto {
  title: string;
  content: string;
  category?: string;
  status?: 'active' | 'inactive';
}

export interface UpdateKnowledgeEntryDto {
  title?: string;
  content?: string;
  category?: string;
  status?: 'active' | 'inactive';
}

export interface KnowledgeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
}

export interface KnowledgeMetrics {
  total: number;
  active: number;
  inactive: number;
  categories_count: number;
}

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  score: number;
}

/**
 * CRM-side management layer for the agent's knowledge base. Every write here
 * mirrors into ProSales' real knowledge store (PGVector — what the agent
 * actually retrieves from at conversation time) via ProsalesClientService.
 * ProSales' knowledge endpoints are create/delete only (no update), so an
 * edit re-creates there and swaps `prosales_document_id`.
 *
 * Previously `reindex()` was a no-op stub (just logged a count) — entries
 * created through this service never reached the agent. Fixed 2026-09-28.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeEntryEntity)
    private readonly repo: Repository<KnowledgeEntryEntity>,
    private readonly prosales: ProsalesClientService,
  ) {}

  async getMetrics(orgId: string): Promise<KnowledgeMetrics> {
    const [totalRow, activeRow, categoriesRow] = await Promise.all([
      this.repo
        .createQueryBuilder('e')
        .select('COUNT(*)', 'total')
        .where('e.organization_id = :orgId', { orgId })
        .getRawOne<{ total: string }>(),
      this.repo
        .createQueryBuilder('e')
        .select('COUNT(*)', 'active')
        .where('e.organization_id = :orgId', { orgId })
        .andWhere("e.status = 'active'")
        .getRawOne<{ active: string }>(),
      this.repo
        .createQueryBuilder('e')
        .select('COUNT(DISTINCT e.category)', 'categories_count')
        .where('e.organization_id = :orgId', { orgId })
        .getRawOne<{ categories_count: string }>(),
    ]);

    const totalNum = parseInt(totalRow?.total ?? '0', 10);
    const activeNum = parseInt(activeRow?.active ?? '0', 10);
    return {
      total: totalNum,
      active: activeNum,
      inactive: totalNum - activeNum,
      categories_count: parseInt(categoriesRow?.categories_count ?? '0', 10),
    };
  }

  async search(orgId: string, q: string): Promise<KnowledgeSearchResult[]> {
    if (!q || !q.trim()) return [];

    const term = `%${q.trim()}%`;
    const entries = await this.repo
      .createQueryBuilder('e')
      .where('e.organization_id = :orgId', { orgId })
      .andWhere("e.status = 'active'")
      .andWhere('(e.title ILIKE :term OR e.content ILIKE :term)', { term })
      .select(['e.id', 'e.title', 'e.content', 'e.category'])
      .limit(20)
      .getMany();

    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      category: e.category,
      score: 1.0,
    }));
  }

  async findAll(orgId: string, query: KnowledgeListQuery = {}): Promise<PaginatedResponse<KnowledgeEntryEntity>> {
    const { page = 1, limit = 20, search, status, category } = query;
    const skip = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.organization_id = :orgId', { orgId })
      .orderBy('e.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) qb.andWhere('e.status = :status', { status });
    if (category) qb.andWhere('e.category = :category', { category });
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere('(e.title ILIKE :term OR e.content ILIKE :term)', { term });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async findById(id: string, orgId: string): Promise<KnowledgeEntryEntity> {
    const entry = await this.repo.findOne({ where: { id, organization_id: orgId } });
    if (!entry) throw new NotFoundException(`Knowledge entry ${id} not found`);
    return entry;
  }

  async create(orgId: string, dto: CreateKnowledgeEntryDto): Promise<KnowledgeEntryEntity> {
    const entry = this.repo.create({ ...dto, organization_id: orgId });
    const saved = await this.repo.save(entry);

    if (saved.status !== 'inactive') {
      await this.syncToProsales(orgId, saved);
    }
    return saved;
  }

  async update(id: string, orgId: string, dto: UpdateKnowledgeEntryDto): Promise<KnowledgeEntryEntity> {
    const entry = await this.findById(id, orgId);
    const wasActive = entry.status !== 'inactive';
    Object.assign(entry, dto);
    const saved = await this.repo.save(entry);

    // Content/category/title changed (or status flipped to active) — drop
    // the old ProSales document (no update endpoint there) and re-create.
    if (saved.status !== 'inactive') {
      await this.syncToProsales(orgId, saved);
    } else if (wasActive && saved.status === 'inactive') {
      await this.unsyncFromProsales(orgId, saved);
    }
    return saved;
  }

  async delete(id: string, orgId: string): Promise<void> {
    const entry = await this.findById(id, orgId);
    if (entry.prosales_document_id) {
      await this.unsyncFromProsales(orgId, entry);
    }
    await this.repo.delete({ id, organization_id: orgId });
  }

  async toggle(id: string, orgId: string): Promise<KnowledgeEntryEntity> {
    const entry = await this.findById(id, orgId);
    entry.status = entry.status === 'active' ? 'inactive' : 'active';
    const saved = await this.repo.save(entry);

    if (saved.status === 'active') {
      await this.syncToProsales(orgId, saved);
    } else {
      await this.unsyncFromProsales(orgId, saved);
    }
    return saved;
  }

  /** Force-resync every active entry — recovery path for entries that never
   * made it to ProSales (e.g. the integration wasn't configured yet when
   * they were created). Safe to re-run: each entry just gets a fresh
   * ProSales document. */
  async reindex(orgId: string): Promise<{
    reindexed: number;
    failed: number;
    failures: { id: string; title: string; error: string }[];
  }> {
    const entries = await this.repo.find({
      where: { organization_id: orgId, status: 'active' },
    });

    let reindexed = 0;
    const failures: { id: string; title: string; error: string }[] = [];
    for (const entry of entries) {
      try {
        await this.syncToProsales(orgId, entry);
        reindexed++;
      } catch (err) {
        const error = (err as Error).message;
        this.logger.warn(`Reindex failed for entry ${entry.id}: ${error}`);
        failures.push({ id: entry.id, title: entry.title, error });
      }
    }
    return { reindexed, failed: failures.length, failures };
  }

  private async syncToProsales(orgId: string, entry: KnowledgeEntryEntity): Promise<void> {
    // Create the new document first. Deleting first meant a failed index
    // (the long file) removed the only copy, and the next reindex 404'd
    // on that id and never retried the create.
    const previousId = entry.prosales_document_id;
    const doc = await this.prosales.createKnowledge(orgId, {
      title: entry.title,
      content: entry.content,
      category: entry.category,
    });
    const newId = (doc as { id?: string }).id;
    if (!newId) {
      throw new Error('ProSales did not return a document id');
    }
    entry.prosales_document_id = newId;
    await this.repo.save(entry);
    if (previousId && previousId !== newId) {
      try {
        await this.prosales.deleteKnowledge(orgId, previousId);
      } catch (err) {
        const message = (err as Error).message ?? '';
        // 404: the previous attempt already deleted it. The new document
        // is what the agent should use.
        if (!message.includes('404')) {
          this.logger.warn(
            `Could not delete previous ProSales document ${previousId}: ${message}`,
          );
        }
      }
    }
  }

  private async unsyncFromProsales(
    orgId: string,
    entry: KnowledgeEntryEntity,
    opts: { keepLocal?: boolean } = {},
  ): Promise<void> {
    if (!entry.prosales_document_id) return;
    await this.prosales.deleteKnowledge(orgId, entry.prosales_document_id);
    entry.prosales_document_id = null;
    if (!opts.keepLocal) await this.repo.save(entry);
  }
}
