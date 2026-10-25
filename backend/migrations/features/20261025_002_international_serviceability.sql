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

create table if not exists shipray_international_postal_codes (
  id bigserial primary key,
  country_code varchar(2) not null,
  postal_code varchar(24) not null,
  place_name varchar(180) not null default '',
  admin_name varchar(180) not null default '',
  latitude numeric(10,7),
  longitude numeric(10,7),
  source varchar(40) not null default 'GeoNames',
  synced_at timestamptz not null default now(),
  constraint shipray_international_postal_codes_unique unique (country_code, postal_code)
);

create index if not exists shipray_intl_postal_country_code_idx
  on shipray_international_postal_codes (country_code, postal_code);

create index if not exists shipray_intl_postal_place_idx
  on shipray_international_postal_codes (lower(place_name));
