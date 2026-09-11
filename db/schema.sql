CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  global_role text NOT NULL DEFAULT 'USER' CHECK (global_role IN ('USER','SUPER_ADMIN')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo_url text,
  accent text DEFAULT '#E10600',
  plan_status text NOT NULL DEFAULT 'TRIAL' CHECK (plan_status IN ('TRIAL','PAID','INACTIVE')),
  public_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','ADMIN','OPERATOR','CONTENT')),
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'BR',
  cpf_hash text,
  email text,
  phone text,
  public_slug text UNIQUE,
  photo_url text,
  helmet_url text,
  number text,
  claimed_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_drivers (
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  notes text,
  PRIMARY KEY (organization_id, driver_id)
);

CREATE TABLE IF NOT EXISTS championships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  modality text NOT NULL DEFAULT 'KART' CHECK (modality IN ('KART','AUTOMOBILISM','MOTORCYCLE','SIM_RACING')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','FINISHED','ARCHIVED')),
  team_ranking_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  points_by_position jsonb NOT NULL DEFAULT '{"1":25,"2":18,"3":15,"4":12,"5":10,"6":8,"7":6,"8":4,"9":2,"10":1}'::jsonb,
  extras jsonb NOT NULL DEFAULT '{"pole":1,"fastestLap":1}'::jsonb,
  discard_policy jsonb NOT NULL DEFAULT '{"count":0,"startsAfterRound":0}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (championship_id, version)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  round_no integer NOT NULL,
  event_date date NOT NULL,
  location_name text,
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','CLOSED','PUBLISHED','REPUBLISHED','POSTPONED','CANCELLED')),
  published_at timestamptz,
  publication_version integer NOT NULL DEFAULT 0,
  republication_reason text,
  photo_album_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, round_no)
);

CREATE TABLE IF NOT EXISTS event_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id),
  category_id uuid REFERENCES categories(id),
  kart_no text,
  guest boolean NOT NULL DEFAULT false,
  payment_status text NOT NULL DEFAULT 'PENDING',
  UNIQUE(event_id, driver_id)
);

CREATE TABLE IF NOT EXISTS results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id),
  category_id uuid REFERENCES categories(id),
  track_position integer NOT NULL,
  official_position integer NOT NULL,
  grid_position integer,
  fastest_lap boolean NOT NULL DEFAULT false,
  pole boolean NOT NULL DEFAULT false,
  base_points numeric(10,2) NOT NULL DEFAULT 0,
  bonus_points numeric(10,2) NOT NULL DEFAULT 0,
  penalty_points numeric(10,2) NOT NULL DEFAULT 0,
  total_points numeric(10,2) NOT NULL DEFAULT 0,
  discarded boolean NOT NULL DEFAULT false,
  notes text,
  UNIQUE(event_id, driver_id)
);

CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz,
  UNIQUE(organization_id, key)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id),
  delta integer NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_championship_org ON championships(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_season ON events(season_id);
CREATE INDEX IF NOT EXISTS idx_results_event ON results(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_date ON audit_logs(organization_id, created_at DESC);
