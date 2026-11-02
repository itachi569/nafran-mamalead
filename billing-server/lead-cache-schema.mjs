/** Identical cache model on SQLite and Postgres. No customer data in served rows. */
export function cacheSchema(postgres = false) {
  const prefix = postgres ? 'billing_' : ''
  const t = name => prefix+'lead_cache_'+name
  const time = postgres ? 'timestamptz' : 'text'
  const real = postgres ? 'double precision' : 'real'
  const json = postgres ? 'jsonb' : 'text'
  return [
    `create table if not exists ${t('queries')} (cache_key text primary key, keyword_norm text not null, location_norm text not null, region text not null, language text not null, place_count integer not null default 0, exhausted_at ${time}, last_scraped_at ${time}, created_at ${time} not null)`,
    `create table if not exists ${t('places')} (place_key text primary key, name text not null, category text, address text, area text, postcode text, phone_e164 text, website text, website_domain text, rating ${real}, review_count integer, latitude ${real}, longitude ${real}, place_ref text, maps_url text, place_ref_hash text, phone_hash text, domain_hash text, scraped_at ${time} not null, first_seen_at ${time} not null, confirmations integer not null default 1, quarantined integer not null default 0, updated_at ${time} not null)`,
    `create table if not exists ${t('query_places')} (cache_key text not null references ${t('queries')}(cache_key) on delete cascade, place_key text not null references ${t('places')}(place_key) on delete cascade, rank integer not null, seen_at ${time} not null, primary key(cache_key,place_key))`,
    `create table if not exists ${t('enrichment')} (place_key text primary key references ${t('places')}(place_key) on delete cascade, emails_json ${json} not null default '[]', phones_json ${json} not null default '[]', socials_json ${json} not null default '[]', emails_at ${time}, phones_at ${time}, socials_at ${time}, address text, enriched_at ${time} not null, confirmations integer not null default 1)`,
    `create table if not exists ${t('contributions')} (id text primary key, installation_id text not null, cache_key text not null, place_key text not null, created_at ${time} not null, unique(installation_id,place_key))`,
    `create table if not exists ${t('stats')} (day text not null, cache_key text not null, lookups integer not null default 0, hits integer not null default 0, partial_hits integer not null default 0, served integer not null default 0, requested integer not null default 0, contributed integer not null default 0, primary key(day,cache_key))`,
    `create table if not exists ${t('runs')} (installation_id text not null, run_id text not null, cache_key text not null, requested integer not null, started_at ${time} not null, primary key(installation_id,run_id,cache_key))`,
    `create table if not exists ${t('receipts')} (installation_id text not null, run_id text not null, reservation_id text unique, requested integer not null, accepted integer not null default 0, started_at ${time} not null, primary key(installation_id,run_id))`,
    `create table if not exists ${t('run_places')} (installation_id text not null, run_id text not null, place_key text not null, primary key(installation_id,run_id,place_key))`,
    `create table if not exists ${t('locks')} (cache_key text primary key, installation_id text not null, expires_at ${time} not null)`,
    `create table if not exists ${t('blocks')} (installation_id text primary key, blocked_until ${time} not null)`,
    `create table if not exists ${t('votes')} (place_key text not null, field text not null, value text not null, installation_id text not null, created_at ${time} not null, primary key(place_key,field,installation_id))`,
    `create table if not exists ${t('buckets')} (bucket text primary key, used integer not null, expires_at ${time} not null)`,
    `create index if not exists ${prefix}lcqp_rank on ${t('query_places')}(cache_key,rank)`,
    `create index if not exists ${prefix}lcp_scraped on ${t('places')}(scraped_at)`,
    `create index if not exists ${prefix}lcp_phone on ${t('places')}(phone_hash)`,
    `create index if not exists ${prefix}lcp_domain on ${t('places')}(domain_hash)`,
  ]
}
