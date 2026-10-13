lock table tracking_events in share row exclusive mode;

alter table tracking_events
  add column if not exists updated_at timestamp default now();

update tracking_events
set updated_at = coalesce(created_at, now())
where updated_at is null;

with ranked_events as (
  select
    id,
    row_number() over (
      partition by
        order_id,
        lower(btrim(coalesce(status_code, ''))),
        lower(btrim(coalesce(status_text, '')))
      order by created_at asc nulls last, id asc
    ) as duplicate_rank
  from tracking_events
)
delete from tracking_events event
using ranked_events ranked
where event.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists tracking_events_order_status_message_unique
  on tracking_events (
    order_id,
    lower(btrim(coalesce(status_code, ''))),
    lower(btrim(coalesce(status_text, '')))
  );
