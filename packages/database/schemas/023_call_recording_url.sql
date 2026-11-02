-- 023: Add recording_url to voice.calls
ALTER TABLE voice.calls ADD COLUMN IF NOT EXISTS recording_url TEXT;
