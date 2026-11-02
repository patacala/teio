-- Adds ai_insights (intent/sentiment/summary snapshot) to contacts. Written by
-- the AI agent (update_contact tool) and by voice call analysis; it is a
-- snapshot, not a log, because a contact's mood/intent can change on every
-- interaction.
ALTER TABLE clients.contacts
  ADD COLUMN IF NOT EXISTS ai_insights JSONB NOT NULL DEFAULT '{}';
