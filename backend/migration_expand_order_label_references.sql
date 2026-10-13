-- Stable R2 label keys include both merchant and order UUIDs and can exceed
-- the legacy varchar(100) limit. Text preserves every existing value while
-- allowing current and future object-key formats for both order types.
SET lock_timeout = '10s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'b2c_orders'
       AND column_name = 'label'
       AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.b2c_orders
      ALTER COLUMN label TYPE text USING label::text;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'b2b_orders'
       AND column_name = 'label'
       AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.b2b_orders
      ALTER COLUMN label TYPE text USING label::text;
  END IF;
END
$$;
