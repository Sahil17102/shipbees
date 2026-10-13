ALTER TABLE b2c_orders
  ADD COLUMN IF NOT EXISTS address_line_1 varchar(255),
  ADD COLUMN IF NOT EXISTS address_line_2 varchar(255),
  ADD COLUMN IF NOT EXISTS address_landmark varchar(255),
  ADD COLUMN IF NOT EXISTS address_locality varchar(255);
