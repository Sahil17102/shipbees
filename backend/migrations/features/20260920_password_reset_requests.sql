create table if not exists password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  otp_hash varchar(200) not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  verified_at timestamptz,
  reset_token_hash varchar(128),
  reset_token_expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_requests_user_created_idx
  on password_reset_requests (user_id, created_at desc);

create index if not exists password_reset_requests_active_idx
  on password_reset_requests (user_id, used_at, expires_at);
