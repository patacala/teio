import type { EntityManager } from 'typeorm';

/**
 * A contact opted out: stop their runs in every automation that respects
 * opt-outs (booking messages and the AI automations don't). Used by the
 * opt-out button, the AI's opt-out tool and the "opt-out" tag event alike.
 * Returns how many runs were stopped.
 */
export async function stopRunsForOptOut(manager: EntityManager, organizationId: string, contactId: string): Promise<number> {
  const result: unknown = await manager.query(
    `UPDATE automation.automation_runs r
        SET status = 'cancelled', exit_reason = 'The contact opted out', finished_at = NOW(),
            locked_until = NULL, resume_at = NULL, waiting_for = NULL
       FROM automation.automation_versions v
      WHERE v.id = r.version_id
        AND r.organization_id = $1 AND r.contact_id = $2
        AND r.status IN ('waiting', 'running')
        AND COALESCE((v.settings->>'respect_opt_out')::boolean, true)
      RETURNING r.id`,
    [organizationId, contactId],
  );
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(rows) ? rows.length : 0;
}
