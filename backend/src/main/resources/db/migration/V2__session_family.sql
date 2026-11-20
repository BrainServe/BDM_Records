-- Existing tokens keep their own family when upgrading an existing installation.
ALTER TABLE refresh_sessions ADD COLUMN family_id UUID;
UPDATE refresh_sessions SET family_id=id WHERE family_id IS NULL;
ALTER TABLE refresh_sessions ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE refresh_sessions ADD COLUMN rotated_at TIMESTAMPTZ;
CREATE INDEX idx_refresh_family ON refresh_sessions(family_id);
