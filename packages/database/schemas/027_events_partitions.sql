-- =============================================================================
-- 027: Add missing event partitions (Jun 2026 → Dec 2027)
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.events_2026_06
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_07
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_08
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_09
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_10
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_11
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_12
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_01
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_02
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_03
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_04
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_05
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_06
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_07
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_08
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_09
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_10
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_11
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS analytics.events_2027_12
  PARTITION OF analytics.events
  FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');
