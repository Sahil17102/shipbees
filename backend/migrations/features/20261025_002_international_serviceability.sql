create table if not exists shipray_international_serviceability (
  id bigserial primary key,
  country_code varchar(2) not null,
  country_name varchar(120) not null,
  region varchar(80) not null,
  courier_name varchar(120) not null default 'DilliKing',
  postal_pattern varchar(240) not null,
  postal_format varchar(120) not null,
  postal_example varchar(40) not null,
  coverage_type varchar(30) not null default 'country-wide',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipray_international_serviceability_unique unique (country_code, courier_name, postal_pattern)
);

create index if not exists shipray_international_serviceability_country_idx
  on shipray_international_serviceability (country_code, is_active);
