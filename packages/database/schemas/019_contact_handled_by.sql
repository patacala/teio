-- Migration 019: Add handled_by column to clients.contacts
-- Tracks whether a contact is handled by AI or a human agent.

ALTER TABLE clients.contacts
  ADD COLUMN IF NOT EXISTS handled_by VARCHAR(10) NOT NULL DEFAULT 'ai'
    CHECK (handled_by IN ('ai', 'human'));
