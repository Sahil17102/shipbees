CREATE SEQUENCE IF NOT EXISTS shipray_user_public_id_seq
  AS integer
  START WITH 1000
  INCREMENT BY 1
  MINVALUE 1000
  MAXVALUE 99999
  NO CYCLE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_id integer;

ALTER TABLE users
  ALTER COLUMN public_id SET DEFAULT nextval('shipray_user_public_id_seq');

UPDATE users
SET public_id = nextval('shipray_user_public_id_seq')
WHERE public_id IS NULL;

SELECT setval(
  'shipray_user_public_id_seq',
  GREATEST(COALESCE(MAX(public_id), 1000), 1000),
  COUNT(public_id) > 0
)
FROM users;

ALTER SEQUENCE shipray_user_public_id_seq OWNED BY users.public_id;

ALTER TABLE users
  ALTER COLUMN public_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_public_id_unique'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_public_id_unique UNIQUE (public_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_public_id_range'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_public_id_range CHECK (public_id BETWEEN 1000 AND 99999);
  END IF;
END
$$;
