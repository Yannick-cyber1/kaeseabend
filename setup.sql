-- Käseabend – Datenbank einrichten
-- Diesen gesamten Text in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Man kann ihn gefahrlos mehrmals ausführen.

-- 1) Tabellen ------------------------------------------------------------

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_unique on public.players (lower(trim(name)));

create table if not exists public.cheeses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  origin text check (origin is null or char_length(origin) <= 60),
  created_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  cheese_id uuid not null references public.cheeses(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  geruch    smallint not null check (geruch    between 1 and 10),
  textur    smallint not null check (textur    between 1 and 10),
  geschmack smallint not null check (geschmack between 1 and 10),
  abgang    smallint not null check (abgang    between 1 and 10),
  updated_at timestamptz not null default now(),
  unique (cheese_id, player_id)
);

-- 2) Startpersonen ------------------------------------------------------

insert into public.players (name) values ('Yannick'), ('Ole'), ('Hannes')
on conflict do nothing;

-- 3) Zugriff für die App ------------------------------------------------
-- Jeder mit dem Link darf lesen und eintragen (gedacht für eine Freundesgruppe).

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.players, public.cheeses, public.ratings to anon, authenticated;

alter table public.players enable row level security;
alter table public.cheeses enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "alle duerfen alles" on public.players;
drop policy if exists "alle duerfen alles" on public.cheeses;
drop policy if exists "alle duerfen alles" on public.ratings;
create policy "alle duerfen alles" on public.players for all to anon, authenticated using (true) with check (true);
create policy "alle duerfen alles" on public.cheeses for all to anon, authenticated using (true) with check (true);
create policy "alle duerfen alles" on public.ratings for all to anon, authenticated using (true) with check (true);

-- 4) Live-Aktualisierung einschalten ------------------------------------

do $$
declare t text;
begin
  foreach t in array array['players', 'cheeses', 'ratings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Fertig. Unten sollte "Success. No rows returned" stehen.
