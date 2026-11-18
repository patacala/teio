-- 025: Platform admin (super admin) flag on users, independent of the org role.
-- (The system communication templates that used to live here were removed with
-- the communications module; see 057_drop_communications.sql.)
ALTER TABLE core.users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
