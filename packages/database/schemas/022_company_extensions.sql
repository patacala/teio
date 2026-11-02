-- Migration 022: Add missing columns to clients.companies
-- Adds company_type, website_screenshot, logo, demo_link, company_context

ALTER TABLE clients.companies
  ADD COLUMN IF NOT EXISTS company_type       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS website_screenshot TEXT,
  ADD COLUMN IF NOT EXISTS logo               TEXT,
  ADD COLUMN IF NOT EXISTS demo_link          TEXT,
  ADD COLUMN IF NOT EXISTS company_context    TEXT;
