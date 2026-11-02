-- =============================================================================
-- 037_funnel_semantics.sql  –  Portable funnel semantics for auto-movement
--
-- Adds the columns the funnel automation engine needs so rules can target a
-- portable `stage_type` instead of stage names (which differ per funnel and can
-- be renamed). Also records WHY/HOW a stage changed on the history so manual
-- moves can be told apart from automated ones (anti-override guard).
--
-- No visible behavior change on its own. Idempotent.
-- =============================================================================

-- ── Stage semantics ─────────────────────────────────────────────────────────
ALTER TABLE clients.funnel_stages
  ADD COLUMN IF NOT EXISTS stage_type  VARCHAR(30) NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS is_terminal BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rotting_days INTEGER;

ALTER TABLE clients.funnel_template_stages
  ADD COLUMN IF NOT EXISTS stage_type  VARCHAR(30) NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS is_terminal BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rotting_days INTEGER;

-- ── History provenance ──────────────────────────────────────────────────────
ALTER TABLE clients.contact_funnel_history
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reason TEXT;

-- ── Backfill stage_type by name (case-insensitive) ──────────────────────────
-- Shared mapping applied to both live stages and template stages. Only touches
-- rows still at the 'custom' default so re-runs never clobber curated values.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clients.funnel_stages', 'clients.funnel_template_stages']
  LOOP
    EXECUTE format($f$
      UPDATE %s SET stage_type = CASE
        WHEN lower(name) IN ('new', 'new lead')                                              THEN 'new'
        WHEN lower(name) IN ('contacted', 'initial contact', 'initial consultation')         THEN 'contacted'
        WHEN lower(name) IN ('qualified', 'diagnosis', 'interested', 'product interest')      THEN 'qualified'
        WHEN lower(name) IN ('proposal sent', 'offer sent', 'quote sent',
                             'property recommended')                                          THEN 'proposal'
        WHEN lower(name) IN ('negotiation')                                                  THEN 'negotiation'
        WHEN lower(name) IN ('appointment scheduled', 'appointment booked',
                             'visit scheduled')                                               THEN 'appointment_scheduled'
        WHEN lower(name) IN ('appointment confirmed')                                        THEN 'appointment_confirmed'
        WHEN lower(name) IN ('won', 'client won', 'property sold', 'purchase completed',
                             'service completed')                                             THEN 'won'
        WHEN lower(name) IN ('lost', 'client lost', 'lead lost', 'customer lost')             THEN 'lost'
        ELSE 'custom'
      END
      WHERE stage_type = 'custom'
    $f$, tbl);

    EXECUTE format($f$
      UPDATE %s SET is_terminal = TRUE WHERE stage_type IN ('won', 'lost')
    $f$, tbl);
  END LOOP;
END $$;
