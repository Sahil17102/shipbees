alter table users
  add column if not exists "oneTimePasswordHash" varchar(200),
  add column if not exists "oneTimePasswordExpiresAt" timestamptz,
  add column if not exists "oneTimePasswordUsedAt" timestamptz;

create index if not exists idx_users_one_time_password_active
  on users ("oneTimePasswordExpiresAt")
  where "oneTimePasswordHash" is not null and "oneTimePasswordUsedAt" is null;
