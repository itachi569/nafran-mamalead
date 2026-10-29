-- Local-first schema for the desktop app, executed by the main process on first launch.
--
-- This is the whole backend: one file, on this machine, owned by this user. Three consequences
-- shape everything below.
--
--   1. There is no row level security. A policy would only ever check a condition that is always
--      true for a single-user local file. The workspace column stays, because leads, lists and
--      jobs still belong to a workspace and the app already reads them that way.
--   2. List-valued columns are JSON text. lead_ids and keywords are read whole and written
--      whole, so a JSON array is the natural fit and json_each() still lets a query ask which
--      jobs cover a lead.
--   3. Timestamps are ISO 8601 text, which sorts correctly and is what the renderer's Date
--      parsing already expects.
--
-- Every statement is idempotent, so this file is safe to run on an existing database.

-- ---------------------------------------------------------------- identity and billing

create table if not exists workspaces (
  id text primary key,
  name text not null,
  owner_id text not null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'studio')),
  created_at text not null
);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at text not null,
  primary key (workspace_id, user_id)
);

create table if not exists subscriptions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('free', 'pro', 'studio')),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  seats integer not null default 3 check (seats > 0),
  renews_on text,
  created_at text not null
);

create table if not exists usage_counters (
  workspace_id text not null references workspaces(id) on delete cascade,
  period text not null,
  scrapes_used integer not null default 0 check (scrapes_used >= 0),
  scrape_limit integer not null default 2000 check (scrape_limit > 0),
  lookups_used integer not null default 0 check (lookups_used >= 0),
  lookup_limit integer not null default 2000 check (lookup_limit > 0),
  primary key (workspace_id, period)
);

-- ---------------------------------------------------------------- scraping

create table if not exists scrape_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  provider text not null default 'chromium-maps',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  keywords text not null default '[]',
  location text not null default '',
  max_results integer not null default 20 check (max_results > 0),
  detail integer not null default 1,
  found integer not null default 0 check (found >= 0),
  error text,
  started_at text not null,
  finished_at text,
  duration_ms integer
);

create index if not exists scrape_runs_workspace_idx on scrape_runs (workspace_id, started_at desc);

create table if not exists leads (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  run_id text references scrape_runs(id) on delete set null,
  name text not null,
  category text not null default '',
  address text not null default '',
  area text not null default '',
  postcode text not null default '',
  phone text not null default '',
  website text not null default '',
  rating real,
  review_count integer,
  latitude real,
  longitude real,
  place_ref text not null default '',
  maps_url text not null default '',
  query text not null default '',
  keyword text not null default '',
  provider text not null default 'chromium-maps',
  score integer not null default 0 check (score between 0 and 100),
  bookmarked integer not null default 0,
  captured_at text not null,
  -- When a finder last read this lead's own site. The Email, Phone and Decision Makers pages
  -- show only the leads a scan has covered, which is a fact about the past rather than about the
  -- pass that happens to be running, so it is stored.
  last_scanned_at text
);

-- One business per workspace: Google's place reference is the identity, and rows without one
-- fall back to the lead id so a repeat run cannot stack the same business twice.
create unique index if not exists leads_workspace_place_idx
  on leads (workspace_id, place_ref) where place_ref <> '';

create index if not exists leads_workspace_captured_idx on leads (workspace_id, captured_at desc);
create index if not exists leads_workspace_name_idx on leads (workspace_id, name);

-- One saved business can appear in multiple searches without duplicating its contact data.
create table if not exists scrape_run_leads (
  run_id text not null references scrape_runs(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  primary key (run_id, lead_id)
);
create index if not exists scrape_run_leads_lead_idx on scrape_run_leads (lead_id);
-- Preserve the run associations available in databases created by earlier versions.
insert or ignore into scrape_run_leads (run_id, lead_id)
  select l.run_id, l.id from leads l join scrape_runs r on r.id = l.run_id;

create table if not exists lead_contacts (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone', 'social')),
  value text not null,
  source text not null default 'maps',
  verified integer not null default 0,
  score integer check (score is null or (score >= 0 and score <= 100)),
  checked_at text,
  validation_status text check (validation_status is null or validation_status in ('valid', 'invalid', 'risky', 'unknown')),
  validation_provider text,
  validation_message text,
  validated_at text,
  created_at text not null,
  unique (lead_id, kind, value)
);

create index if not exists lead_contacts_lead_idx on lead_contacts (lead_id);
create index if not exists lead_contacts_workspace_idx on lead_contacts (workspace_id, kind);

create table if not exists social_profiles (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'other')),
  handle text not null default '',
  profile_url text not null default '',
  followers integer check (followers is null or followers >= 0),
  verified integer not null default 0,
  source text not null default 'website',
  discovered_at text not null,
  checked_at text,
  updated_at text not null,
  unique (lead_id, platform, profile_url)
);

create index if not exists social_profiles_lead_idx on social_profiles (lead_id);
create index if not exists social_profiles_workspace_platform_idx on social_profiles (workspace_id, platform);

create table if not exists decision_makers (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  full_name text not null,
  title text not null default '',
  email text not null default '',
  email_evidence text not null default 'page',
  phone text not null default '',
  linkedin_url text not null default '',
  source text not null default 'website',
  created_at text not null
);

create index if not exists decision_makers_lead_idx on decision_makers (lead_id);
create index if not exists decision_makers_workspace_idx on decision_makers (workspace_id);

-- Suggestions that are not yet worth treating as fact.
--
-- A name read from a page, an email local part or a LinkedIn company page is a lead, not a
-- confirmed person: "anastasia@" implies Anastasia works there but does not prove it. These live
-- apart from decision_makers so the confirmed table stays trustworthy, and each row can be
-- confirmed into it or dismissed.
create table if not exists decision_maker_candidates (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  full_name text not null,
  title text not null default '',
  /** Why this name was suggested: email, linkedin, page. */
  source text not null,
  /** The evidence itself, shown beside the suggestion so it can be judged. */
  evidence text not null default '',
  email text not null default '',
  linkedin_url text not null default '',
  status text not null default 'suggested' check (status in ('suggested', 'dismissed')),
  created_at text not null,
  unique (lead_id, full_name, source)
);

create index if not exists decision_maker_candidates_workspace_idx
  on decision_maker_candidates (workspace_id, status, created_at desc);

-- ---------------------------------------------------------------- lists, jobs, exports
create table if not exists email_contact_archive (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  contact_id text not null,
  original_json text not null,
  archived_at text not null
);

-- Recoverable originals from the profile-only cleanup; deleting a lead deletes its archives too.
create table if not exists social_profile_repairs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  profile_id text not null,
  reason text not null,
  original_json text not null,
  repaired_at text not null
);

create table if not exists lists (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  created_at text not null
);

create index if not exists lists_workspace_idx on lists (workspace_id, created_at desc);

create table if not exists list_items (
  list_id text not null references lists(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  added_at text not null,
  primary key (list_id, lead_id)
);

create index if not exists list_items_workspace_idx on list_items (workspace_id);
create index if not exists list_items_lead_idx on list_items (lead_id);

create table if not exists enrichment_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone', 'social', 'decision-maker', 'website', 'deep')),
  lead_ids text not null default '[]',
  options text not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  found integer not null default 0,
  error text,
  created_at text not null,
  started_at text,
  finished_at text
);

create index if not exists enrichment_jobs_queue_idx on enrichment_jobs (workspace_id, status, created_at);

create table if not exists exports (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null,
  scope text not null default '',
  row_count integer not null default 0,
  columns text not null default '[]',
  file_name text not null default '',
  path text not null default '',
  created_at text not null
);

create index if not exists exports_workspace_idx on exports (workspace_id, created_at desc);

-- Website Lookup: a pasted list of domains becomes a batch of leads, each queued for a pass over
-- its own site. Kept as a record so the page can say what was imported and what it produced.
create table if not exists import_batches (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null default 'websites',
  source_count integer not null default 0,
  added integer not null default 0,
  skipped integer not null default 0,
  created_at text not null
);

create index if not exists import_batches_workspace_idx on import_batches (workspace_id, created_at desc);

-- What has been searched on a page, most recent first. The terms are kept so the search box can
-- offer them back: a search is often the same one again, and retyping it is the same work twice.
create table if not exists search_history (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  scope text not null default 'social',
  term text not null,
  results integer,
  searched_at text not null,
  unique (workspace_id, scope, term)
);

create index if not exists search_history_recent_idx on search_history (workspace_id, scope, searched_at desc);

-- The history panel's log: a search, an import, a refresh or a finished pass, newest first.
--
-- `items` holds what the entry was about — the URLs an import read, the handles it created — which
-- is what the row shows when it is opened. `hits` counts what it produced, so a search can say how
-- many leads it left on screen and an import how many profiles it attached. `run_term` is the one
-- thing worth running again: the search term behind a search entry.
create table if not exists activity_log (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  scope text not null default 'social',
  kind text not null check (kind in ('search', 'import', 'refresh', 'action')),
  title text not null default '',
  detail text not null default '',
  items text not null default '[]',
  hits integer,
  run_term text not null default '',
  created_at text not null
);

create index if not exists activity_log_recent_idx on activity_log (workspace_id, scope, created_at desc);

-- ---------------------------------------------------------------- derived columns

-- The workspace of a contact or a decision maker is decided by its lead, never by the caller,
-- so a writer cannot file a row into a workspace it does not own.
create trigger if not exists lead_contacts_workspace_ins
after insert on lead_contacts
for each row
when new.workspace_id is null or new.workspace_id <> (select workspace_id from leads where id = new.lead_id)
begin
  update lead_contacts
  set workspace_id = (select workspace_id from leads where id = new.lead_id)
  where rowid = new.rowid;
end;

create trigger if not exists lead_contacts_workspace_upd
after update of lead_id on lead_contacts
for each row
begin
  update lead_contacts
  set workspace_id = (select workspace_id from leads where id = new.lead_id)
  where rowid = new.rowid;
end;

create trigger if not exists decision_makers_workspace_ins
after insert on decision_makers
for each row
when new.workspace_id is null or new.workspace_id <> (select workspace_id from leads where id = new.lead_id)
begin
  update decision_makers
  set workspace_id = (select workspace_id from leads where id = new.lead_id)
  where rowid = new.rowid;
end;

create trigger if not exists list_items_workspace_ins
after insert on list_items
for each row
when new.workspace_id is null or new.workspace_id <> (select workspace_id from lists where id = new.list_id)
begin
  update list_items
  set workspace_id = (select workspace_id from lists where id = new.list_id)
  where rowid = new.rowid;
end;

-- social_profiles keeps updated_at honest the way the Postgres trigger did.
create trigger if not exists social_profiles_touch
after update on social_profiles
for each row
begin
  update social_profiles set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

-- ---------------------------------------------------------------- aggregate views
--
-- These replace the three Postgres views the Email Finder and Social Profiles pages read. A
-- view in SQLite is read-only, which is all the pages need: they are aggregates.

drop view if exists email_coverage;
create view email_coverage as
select
  l.workspace_id                                                     as workspace_id,
  count(distinct l.id)                                               as leads,
  count(distinct case when l.website <> '' then l.id end)            as with_website,
  count(distinct c.lead_id)                                          as leads_with_email,
  count(c.id)                                                        as emails,
  count(case when c.validation_status = 'valid' then c.id end)       as verified,
  count(distinct case when c.id is not null and (c.validation_status is null or c.validation_status in ('unknown', 'risky')) then c.lead_id end) as needs_verify,
  count(case when c.validation_status = 'risky' then c.id end)       as risky,
  count(case when c.validation_status = 'valid' then c.id end)       as valid_emails,
  count(case when c.validation_status = 'invalid' then c.id end)     as invalid_emails,
  count(case when c.validation_status = 'risky' then c.id end)       as risky_emails,
  count(case when c.validation_status = 'unknown' then c.id end)     as unknown_emails,
  count(case when c.id is not null and c.validation_status is null then c.id end) as unchecked_emails
from leads l
left join lead_contacts c on c.lead_id = l.id and c.kind = 'email'
group by l.workspace_id;

drop view if exists email_confidence;
create view email_confidence as
select
  l.workspace_id                            as workspace_id,
  min(95, (c.score / 5) * 5)                as band_from,
  count(*)                                  as count
from lead_contacts c
join leads l on l.id = c.lead_id
where c.kind = 'email' and c.score is not null
group by l.workspace_id, min(95, (c.score / 5) * 5);

drop view if exists social_coverage;
create view social_coverage as
select
  workspace_id,
  platform,
  count(*)                  as profiles,
  count(distinct lead_id)   as leads
from social_profiles
group by workspace_id, platform;

-- Per-scan Website Lookup results, isolated from the rest of the saved lead ledger.
create table if not exists website_lookup_rows (
  job_id text not null references enrichment_jobs(id) on delete cascade,
  lead_id text not null references leads(id) on delete cascade,
  position integer not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  data text not null,
  error text not null default '',
  primary key (job_id, lead_id)
);
