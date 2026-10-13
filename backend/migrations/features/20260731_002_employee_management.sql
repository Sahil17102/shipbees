CREATE TABLE IF NOT EXISTS shipray_admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(64) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipray_admin_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES shipray_admin_roles(id) ON DELETE RESTRICT,
  manager_staff_id uuid REFERENCES shipray_admin_staff(id) ON DELETE SET NULL,
  employee_code varchar(40) UNIQUE,
  name varchar(120) NOT NULL,
  phone varchar(20),
  department varchar(80) NOT NULL,
  designation varchar(100) NOT NULL,
  scope_type varchar(20) NOT NULL DEFAULT 'assigned' CHECK (scope_type IN ('assigned', 'team', 'all')),
  permission_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipray_admin_staff_role_idx ON shipray_admin_staff(role_id);
CREATE INDEX IF NOT EXISTS shipray_admin_staff_manager_idx ON shipray_admin_staff(manager_staff_id);

CREATE TABLE IF NOT EXISTS shipray_seller_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES shipray_admin_staff(id) ON DELETE RESTRICT,
  assignment_type varchar(20) NOT NULL DEFAULT 'primary' CHECK (assignment_type IN ('primary', 'support')),
  is_active boolean NOT NULL DEFAULT true,
  reason text,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS shipray_seller_assignments_seller_idx ON shipray_seller_assignments(seller_id);
CREATE INDEX IF NOT EXISTS shipray_seller_assignments_staff_idx ON shipray_seller_assignments(staff_id);
CREATE INDEX IF NOT EXISTS shipray_seller_assignments_lookup_idx ON shipray_seller_assignments(seller_id, staff_id, assignment_type);
CREATE UNIQUE INDEX IF NOT EXISTS shipray_seller_primary_assignment_unique
  ON shipray_seller_assignments(seller_id) WHERE assignment_type = 'primary' AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS shipray_seller_support_assignment_unique
  ON shipray_seller_assignments(seller_id, staff_id, assignment_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS shipray_crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_staff_id uuid REFERENCES shipray_admin_staff(id) ON DELETE SET NULL,
  category varchar(50) NOT NULL,
  title varchar(180) NOT NULL,
  description text,
  priority varchar(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status varchar(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled', 'escalated')),
  due_at timestamptz,
  completed_at timestamptz,
  outcome text,
  next_follow_up_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipray_crm_tasks_seller_idx ON shipray_crm_tasks(seller_id);
CREATE INDEX IF NOT EXISTS shipray_crm_tasks_staff_idx ON shipray_crm_tasks(assigned_staff_id);
CREATE INDEX IF NOT EXISTS shipray_crm_tasks_due_idx ON shipray_crm_tasks(status, due_at);

CREATE TABLE IF NOT EXISTS shipray_crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES shipray_admin_staff(id) ON DELETE SET NULL,
  task_id uuid REFERENCES shipray_crm_tasks(id) ON DELETE SET NULL,
  activity_type varchar(50) NOT NULL,
  summary varchar(220) NOT NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipray_crm_activities_seller_idx ON shipray_crm_activities(seller_id);
CREATE INDEX IF NOT EXISTS shipray_crm_activities_staff_idx ON shipray_crm_activities(staff_id);
CREATE INDEX IF NOT EXISTS shipray_crm_activities_occurred_idx ON shipray_crm_activities(occurred_at DESC);

INSERT INTO shipray_admin_roles (code, name, description, permissions, is_system)
VALUES
  ('relationship_manager', 'Relationship Manager', 'Owns seller relationships and follow-ups', '{"crm":"operate","sellers":"view","orders":"view","kyc":"view","wallet":"view","support":"view","ndr":"view","rto":"view"}', true),
  ('onboarding_executive', 'Onboarding Executive', 'Handles seller onboarding and KYC preparation', '{"crm":"operate","sellers":"operate","kyc":"operate","orders":"view"}', true),
  ('operations_executive', 'Operations Executive', 'Handles shipment exceptions and operations', '{"crm":"operate","sellers":"view","orders":"operate","ndr":"operate","rto":"operate","manualCouriers":"operate","support":"view"}', true),
  ('finance_executive', 'Finance Executive', 'Handles wallet and remittance operations', '{"crm":"operate","sellers":"view","orders":"view","wallet":"operate","cod":"operate","billing":"operate"}', true),
  ('support_executive', 'Support Executive', 'Handles seller support and escalations', '{"crm":"operate","sellers":"view","orders":"view","support":"operate","ndr":"view","rto":"view"}', true),
  ('team_manager', 'Team Manager', 'Manages employees, assignments and team workload', '{"crm":"manage","sellers":"manage","orders":"view","kyc":"view","wallet":"view","support":"operate","employees":"manage","assignments":"manage","reports":"view"}', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  is_system = true,
  is_active = true,
  updated_at = now();
