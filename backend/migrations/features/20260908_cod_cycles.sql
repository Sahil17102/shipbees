CREATE TABLE IF NOT EXISTS cod_remittance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  days integer NOT NULL CHECK (days BETWEEN 0 AND 365),
  fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cod_remittance_cycles(name, days, fee) VALUES ('D+1',1,0), ('D+5',5,0) ON CONFLICT (name) DO NOTHING;
CREATE TABLE IF NOT EXISTS seller_cod_cycles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES cod_remittance_cycles(id),
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cod_remittances ADD COLUMN IF NOT EXISTS cycle_name varchar(80);
ALTER TABLE cod_remittances ADD COLUMN IF NOT EXISTS cycle_days integer;
ALTER TABLE cod_remittances ADD COLUMN IF NOT EXISTS cycle_fee numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cod_remittances ADD COLUMN IF NOT EXISTS eligible_at timestamptz;
ALTER TABLE cod_remittances ADD COLUMN IF NOT EXISTS settled_amount numeric(12,2);
ALTER TABLE cod_remittances ADD COLUMN IF NOT EXISTS fee_transaction_id uuid REFERENCES wallet_transactions(id);
CREATE INDEX IF NOT EXISTS cod_remittances_user_status_due_idx ON cod_remittances(user_id,status,eligible_at);
