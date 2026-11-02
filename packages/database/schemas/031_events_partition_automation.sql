-- =============================================================================
-- 031_events_partition_automation.sql
-- Stops analytics.events from silently dropping rows when it runs out of
-- partitions — which is what happened from 2026-06 onward, because 027 only
-- created a fixed window and was never applied.
--
-- Two layers:
--   1. A DEFAULT partition, so a missing month is never a rejected INSERT.
--   2. A pg_cron job that keeps 6 months of partitions ahead, so the default
--      stays empty in normal operation.
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Safety net. Rows for an uncovered month land here instead of erroring.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.events_default
  PARTITION OF analytics.events DEFAULT;

-- ---------------------------------------------------------------------------
-- 2. Partition maintenance
--
-- Creating a partition fails if the DEFAULT already holds rows in its range,
-- so any rows the net caught are moved across before attaching. That detach
-- takes an ACCESS EXCLUSIVE lock, but only on the months that actually
-- overflowed — the common path never touches the default at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.ensure_event_partitions(
  p_months_back  int DEFAULT 3,
  p_months_ahead int DEFAULT 6
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  m                 date;
  part_name         text;
  start_ts          timestamptz;
  end_ts            timestamptz;
  has_default_rows  boolean;
BEGIN
  FOR m IN
    SELECT generate_series(
      date_trunc('month', now()) - make_interval(months => p_months_back),
      date_trunc('month', now()) + make_interval(months => p_months_ahead),
      interval '1 month'
    )::date
  LOOP
    part_name := format('events_%s', to_char(m, 'YYYY_MM'));
    start_ts  := m::timestamptz;
    end_ts    := (m + interval '1 month')::timestamptz;

    CONTINUE WHEN to_regclass(format('analytics.%I', part_name)) IS NOT NULL;

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM analytics.events_default
                       WHERE occurred_at >= %L AND occurred_at < %L)',
      start_ts, end_ts
    ) INTO has_default_rows;

    IF has_default_rows THEN
      ALTER TABLE analytics.events DETACH PARTITION analytics.events_default;

      EXECUTE format(
        'CREATE TABLE analytics.%I PARTITION OF analytics.events
           FOR VALUES FROM (%L) TO (%L)',
        part_name, start_ts, end_ts
      );
      EXECUTE format(
        'INSERT INTO analytics.%I
           SELECT * FROM analytics.events_default
            WHERE occurred_at >= %L AND occurred_at < %L',
        part_name, start_ts, end_ts
      );
      EXECUTE format(
        'DELETE FROM analytics.events_default
          WHERE occurred_at >= %L AND occurred_at < %L',
        start_ts, end_ts
      );

      ALTER TABLE analytics.events ATTACH PARTITION analytics.events_default DEFAULT;

      RAISE NOTICE 'Created partition analytics.% and drained it from the default', part_name;
    ELSE
      EXECUTE format(
        'CREATE TABLE analytics.%I PARTITION OF analytics.events
           FOR VALUES FROM (%L) TO (%L)',
        part_name, start_ts, end_ts
      );
      RAISE NOTICE 'Created partition analytics.%', part_name;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Close the current gap immediately
-- ---------------------------------------------------------------------------
SELECT analytics.ensure_event_partitions();

-- ---------------------------------------------------------------------------
-- 4. Keep it ahead. Daily rather than monthly: the run is a no-op once the
--    window is full, and a single missed month stops being an outage.
--
--    pg_cron lives in the `postgres` database only. If CREATE EXTENSION is
--    refused, enable it from Supabase → Database → Extensions and re-run
--    this block on its own.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('ensure-event-partitions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-event-partitions');

SELECT cron.schedule(
  'ensure-event-partitions',
  '0 3 * * *',
  $cron$ SELECT analytics.ensure_event_partitions(); $cron$
);
