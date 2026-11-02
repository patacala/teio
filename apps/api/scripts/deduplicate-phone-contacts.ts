#!/usr/bin/env ts-node
/**
 * De-duplicate phone contacts before applying the unique index migration.
 * 
 * STRATEGY:
 * 1. Find all duplicate groups (same org + last 10 digits of phone)
 * 2. For each group:
 *    - Keep the OLDEST contact (earliest created_at)
 *    - Merge channel_ids, tags, custom_fields from duplicates into the keeper
 *    - Reassign all related records (conversations, calls, appointments, etc.) to the keeper
 *    - Delete the duplicate contacts
 * 
 * USAGE:
 *   # Dry-run (default): shows what would be merged without making changes
 *   pnpm ts-node apps/api/scripts/deduplicate-phone-contacts.ts
 * 
 *   # Apply changes to production
 *   pnpm ts-node apps/api/scripts/deduplicate-phone-contacts.ts --apply
 * 
 * SAFETY:
 * - Always run dry-run first to review what will be merged
 * - Creates a timestamped backup JSON file before any changes
 * - Runs in a transaction per duplicate group (rollback on error)
 */

import { DataSource } from 'typeorm';
import { writeFileSync } from 'fs';
import { getTypeOrmConfig } from '../src/infrastructure/database/typeorm.config';
import { ConfigService } from '@nestjs/config';

interface DuplicateGroup {
  organization_id: string;
  phone_key: string;
  contacts: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    channel_ids: Record<string, string>;
    tags: string[];
    custom_fields: Record<string, unknown>;
    created_at: Date;
  }>;
}

async function findDuplicates(dataSource: DataSource): Promise<DuplicateGroup[]> {
  // Find all contacts grouped by (org, last 10 digits of phone)
  const results = await dataSource.query(`
    WITH normalized_contacts AS (
      SELECT
        id,
        organization_id,
        first_name,
        last_name,
        email,
        phone,
        channel_ids,
        tags,
        custom_fields,
        created_at,
        RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) AS phone_key
      FROM clients.contacts
      WHERE phone IS NOT NULL AND phone <> ''
    )
    SELECT
      organization_id,
      phone_key,
      json_agg(
        json_build_object(
          'id', id,
          'first_name', first_name,
          'last_name', last_name,
          'email', email,
          'phone', phone,
          'channel_ids', channel_ids,
          'tags', tags,
          'custom_fields', custom_fields,
          'created_at', created_at
        )
        ORDER BY created_at ASC
      ) AS contacts
    FROM normalized_contacts
    WHERE phone_key IS NOT NULL AND phone_key <> ''
    GROUP BY organization_id, phone_key
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, organization_id, phone_key;
  `);

  return results.map((row: any) => ({
    organization_id: row.organization_id,
    phone_key: row.phone_key,
    contacts: row.contacts,
  }));
}

async function mergeContactGroup(
  dataSource: DataSource,
  group: DuplicateGroup,
  dryRun: boolean,
): Promise<void> {
  const keeper = group.contacts[0]; // Oldest contact
  const duplicates = group.contacts.slice(1);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Organization: ${group.organization_id}`);
  console.log(`Phone key: ${group.phone_key}`);
  console.log(`Duplicates found: ${group.contacts.length}`);
  console.log(`\nKEEPER (oldest):`);
  console.log(`  ID: ${keeper.id}`);
  console.log(`  Name: ${keeper.first_name} ${keeper.last_name || ''}`);
  console.log(`  Phone: ${keeper.phone}`);
  console.log(`  Created: ${keeper.created_at}`);
  console.log(`  Channel IDs: ${JSON.stringify(keeper.channel_ids)}`);

  console.log(`\nDUPLICATES to merge:`);
  duplicates.forEach((dup, i) => {
    console.log(`  ${i + 1}. ID: ${dup.id}`);
    console.log(`     Name: ${dup.first_name} ${dup.last_name || ''}`);
    console.log(`     Phone: ${dup.phone}`);
    console.log(`     Created: ${dup.created_at} (${
      new Date(dup.created_at).getTime() - new Date(keeper.created_at).getTime()
    } ms after keeper)`);
    console.log(`     Channel IDs: ${JSON.stringify(dup.channel_ids)}`);
  });

  if (dryRun) {
    console.log(`\n[DRY-RUN] Would merge ${duplicates.length} duplicates into keeper ${keeper.id}`);
    return;
  }

  // Run the merge in a transaction
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Merge channel_ids, tags, custom_fields into keeper
    const mergedChannelIds = { ...keeper.channel_ids };
    const mergedTags = new Set(keeper.tags || []);
    const mergedCustomFields = { ...keeper.custom_fields };

    duplicates.forEach((dup) => {
      Object.assign(mergedChannelIds, dup.channel_ids);
      (dup.tags || []).forEach((tag) => mergedTags.add(tag));
      Object.assign(mergedCustomFields, dup.custom_fields);
    });

    await queryRunner.query(
      `UPDATE clients.contacts
       SET channel_ids = $1, tags = $2, custom_fields = $3
       WHERE id = $4`,
      [mergedChannelIds, Array.from(mergedTags), mergedCustomFields, keeper.id],
    );

    // 2. Reassign all related records to the keeper
    const duplicateIds = duplicates.map((d) => d.id);

    // Conversations
    await queryRunner.query(
      `UPDATE conversations.conversations
       SET contact_id = $1
       WHERE contact_id = ANY($2)`,
      [keeper.id, duplicateIds],
    );

    // Messages (if there's a direct contact_id FK)
    await queryRunner.query(
      `UPDATE conversations.messages
       SET from_contact_id = $1
       WHERE from_contact_id = ANY($2)`,
      [keeper.id, duplicateIds],
    );

    // Calls
    await queryRunner.query(
      `UPDATE voice.calls
       SET contact_id = $1
       WHERE contact_id = ANY($2)`,
      [keeper.id, duplicateIds],
    );

    // Appointments
    await queryRunner.query(
      `UPDATE scheduling.appointments
       SET contact_id = $1
       WHERE contact_id = ANY($2)`,
      [keeper.id, duplicateIds],
    );

    // Contact funnel history
    await queryRunner.query(
      `UPDATE funnels.contact_funnel_history
       SET contact_id = $1
       WHERE contact_id = ANY($2)`,
      [keeper.id, duplicateIds],
    );

    // Contact data updates
    await queryRunner.query(
      `UPDATE clients.contact_data_updates
       SET contact_id = $1
       WHERE contact_id = ANY($2)`,
      [keeper.id, duplicateIds],
    );

    // 3. Delete the duplicates
    await queryRunner.query(
      `DELETE FROM clients.contacts WHERE id = ANY($1)`,
      [duplicateIds],
    );

    await queryRunner.commitTransaction();
    console.log(`✓ Successfully merged ${duplicates.length} duplicates into keeper ${keeper.id}`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(`✗ Failed to merge group: ${error}`);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  console.log('='.repeat(80));
  console.log('Contact De-duplication Script');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no changes will be made)' : 'APPLY (will modify database)'}`);
  console.log('');

  if (dryRun) {
    console.log('ℹ️  This is a dry-run. No changes will be made.');
    console.log('   Run with --apply to execute the merge.\n');
  } else {
    console.log('⚠️  APPLY mode: Database will be modified!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Initialize DataSource
  const configService = new ConfigService({
    database: {
      url: process.env.DATABASE_URL,
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      name: process.env.DATABASE_NAME || 'crm',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
    },
  });

  const dataSourceConfig = getTypeOrmConfig(configService);
  const dataSource = new DataSource({
    ...dataSourceConfig,
    migrations: [],
    migrationsRun: false,
  } as any);

  await dataSource.initialize();
  console.log('✓ Database connection established\n');

  try {
    // 1. Find all duplicate groups
    console.log('Searching for duplicate phone contacts...\n');
    const duplicateGroups = await findDuplicates(dataSource);

    if (duplicateGroups.length === 0) {
      console.log('✓ No duplicate phone contacts found. Database is clean!\n');
      return;
    }

    console.log(`Found ${duplicateGroups.length} duplicate groups:\n`);

    // 2. Save backup before making changes
    if (!dryRun) {
      const backupFile = `contact-duplicates-backup-${Date.now()}.json`;
      writeFileSync(backupFile, JSON.stringify(duplicateGroups, null, 2));
      console.log(`✓ Backup saved to: ${backupFile}\n`);
    }

    // 3. Merge each group
    for (const group of duplicateGroups) {
      await mergeContactGroup(dataSource, group, dryRun);
    }

    console.log('\n' + '='.repeat(80));
    if (dryRun) {
      console.log(`Summary: ${duplicateGroups.length} duplicate groups found.`);
      console.log('Run with --apply to merge them.');
    } else {
      console.log(`✓ Successfully de-duplicated ${duplicateGroups.length} groups.`);
      console.log('You can now safely apply the unique index migration.');
    }
    console.log('='.repeat(80) + '\n');
  } finally {
    await dataSource.destroy();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
