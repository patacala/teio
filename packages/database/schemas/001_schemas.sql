-- =============================================================================
-- 001: Create PostgreSQL Schemas for Domain Isolation
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy text search

-- Domain schemas
CREATE SCHEMA IF NOT EXISTS core;            -- Organizations, users
CREATE SCHEMA IF NOT EXISTS clients;         -- Contacts, companies
CREATE SCHEMA IF NOT EXISTS conversations;   -- Conversations, messages
CREATE SCHEMA IF NOT EXISTS agents;          -- AI agents, human agents
CREATE SCHEMA IF NOT EXISTS scheduling;      -- Appointments, calendars
CREATE SCHEMA IF NOT EXISTS integrations;    -- Webhooks, channel configs
CREATE SCHEMA IF NOT EXISTS analytics;       -- Events, reports

-- Shared helper function: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
