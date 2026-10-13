create table if not exists seller_tour_progress (
  user_id uuid primary key references users(id) on delete cascade,
  version integer not null default 1,
  status varchar(16) not null default 'pending',
  completed_pages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint seller_tour_progress_status_check check (status in ('pending', 'active', 'completed', 'dismissed'))
);
