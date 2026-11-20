-- Schema only. No demo users, sectors, institutions, courses, countries, consultants or amounts.
CREATE TABLE app_users (
  id UUID PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(24) NOT NULL DEFAULT 'ADMIN',
  access_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE refresh_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE TABLE catalog_sections (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  record_label VARCHAR(60) NOT NULL,
  item_label VARCHAR(60) NOT NULL,
  amount_unit VARCHAR(16) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE catalog_records (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES catalog_sections(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_record_name_section UNIQUE(section_id,name)
);
CREATE INDEX idx_records_section ON catalog_records(section_id);
CREATE TABLE catalog_items (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES catalog_sections(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_item_name_section UNIQUE(section_id,name)
);
CREATE INDEX idx_items_section ON catalog_items(section_id);
CREATE TABLE catalog_amounts (
  id UUID PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES catalog_records(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  amount NUMERIC(16,2) NOT NULL CHECK(amount >= 0),
  CONSTRAINT uq_amount_record_item UNIQUE(record_id,item_id)
);
CREATE INDEX idx_amounts_item ON catalog_amounts(item_id);
