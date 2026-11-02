import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallTranscriptEntity } from './call-transcript.entity';
import type { TranscriptSegment } from '@crm/shared';

@Injectable()
export class TranscriptService {
  private readonly logger = new Logger(TranscriptService.name);

  constructor(
    @InjectRepository(CallTranscriptEntity)
    private readonly transcriptRepo: Repository<CallTranscriptEntity>,
  ) {}

  parseTranscript(raw: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    let lastSpeaker: TranscriptSegment['speaker'] = 'system';

    for (const line of raw.split('\n')) {
      const text = line.trim();
      if (!text) continue;

      const match = /^(user|agent|assistant|ai|system)\s*:\s*(.*)$/i.exec(text);
      if (match) {
        const role = match[1].toLowerCase();
        lastSpeaker = role === 'user' ? 'user' : role === 'system' ? 'system' : 'ai';
        if (match[2]) segments.push({ speaker: lastSpeaker, content: match[2] });
        continue;
      }

      // An unprefixed line is a wrapped continuation of the previous turn, not
      // a system event — labelling it 'system' made agent replies look like
      // notes in the UI.
      const previous = segments[segments.length - 1];
      if (previous && previous.speaker === lastSpeaker) {
        previous.content = `${previous.content} ${text}`.trim();
      } else {
        segments.push({ speaker: lastSpeaker, content: text });
      }
    }

    return segments;
  }

  async parseAndStore(
    callId: string,
    orgId: string,
    rawTranscript: string,
  ): Promise<void> {
    const segments = this.parseTranscript(rawTranscript);
    if (segments.length === 0) {
      this.logger.debug(`Empty transcript for call ${callId}`);
      return;
    }

    const rows = segments.map((seg, idx) => ({
      organization_id: orgId,
      call_id: callId,
      speaker: seg.speaker,
      content: seg.content,
      timestamp_seconds: seg.timestamp_seconds ?? idx * 5,
    }));

    // Retell sends a transcript on both call_ended and call_analyzed, and each
    // one is the whole conversation so far — appending would show every line
    // twice. Replace instead: the newest payload is always the complete one.
    await this.transcriptRepo.manager.transaction(async (manager) => {
      // call_ended and call_analyzed can be in the worker at the same time;
      // without this both would delete, then both insert.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`transcript:${callId}`]);
      await manager.delete(CallTranscriptEntity, { call_id: callId, organization_id: orgId });
      await manager
        .createQueryBuilder()
        .insert()
        .into(CallTranscriptEntity)
        .values(rows)
        .execute();
    });

    this.logger.log(`Stored ${rows.length} transcript segments for call ${callId}`);
  }

  async getTranscript(callId: string, orgId: string): Promise<CallTranscriptEntity[]> {
    return this.transcriptRepo.find({
      where: { call_id: callId, organization_id: orgId },
      order: { timestamp_seconds: 'ASC' },
    });
  }
}
