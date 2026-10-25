create table if not exists shipray_international_rate_cards (
  id bigserial primary key,
  country_code varchar(2) not null,
  country_name varchar(120) not null,
  region varchar(80) not null,
  courier_name varchar(120) not null,
  service_type varchar(80) not null default 'Express',
  currency varchar(3) not null default 'INR',
  base_weight_kg numeric(10, 2) not null default 0.50,
  base_rate numeric(12, 2) not null default 0,
  additional_rate_per_kg numeric(12, 2) not null default 0,
  fuel_surcharge_percent numeric(7, 2) not null default 0,
  handling_fee numeric(12, 2) not null default 0,
  customs_clearance_fee numeric(12, 2) not null default 0,
  insurance_percent numeric(7, 2) not null default 0,
  tax_percent numeric(7, 2) not null default 18,
  duties_mode varchar(3) not null default 'DDU',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipray_international_rate_cards_country_code_check
    check (country_code = upper(country_code) and char_length(country_code) = 2),
  constraint shipray_international_rate_cards_duties_mode_check
    check (duties_mode in ('DDU', 'DDP')),
  constraint shipray_international_rate_cards_unique
    unique (country_code, courier_name, service_type)
);

create index if not exists shipray_international_rate_cards_region_idx
  on shipray_international_rate_cards (region);

create index if not exists shipray_international_rate_cards_courier_idx
  on shipray_international_rate_cards (courier_name);
