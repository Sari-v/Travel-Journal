-- Meraki Travel — community backend (Phases C–E)
-- Run this once in your Supabase project: SQL Editor → paste → Run.
-- Curated city packs stay static (build.py); only community content lives here.
-- Design rule: likes only, no dislikes. There is deliberately no dislike table.

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────
-- profiles  (one row per auth user)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    'traveller_' || substr(new.id::text, 1, 8),
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- places  (community-added places; curated ones stay static)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.places (
  id                   uuid primary key default gen_random_uuid(),
  city_id              text not null,                 -- matches static manifest id, e.g. 'amsterdam'
  category             text not null,
  subcategory          text,
  name                 text not null,
  neighborhood         text,
  address              text,
  lat                  double precision not null,
  lng                  double precision not null,
  price                text,
  review_summary       text,
  google_review_summary text,
  local_tip            text,
  story                text,
  highlight            text,
  source               text not null default 'community' check (source in ('community')),
  author_id            uuid not null references public.profiles(id) on delete cascade,
  status               text not null default 'published' check (status in ('published','pending','hidden')),
  like_count           int not null default 0,
  created_at           timestamptz not null default now()
);
create index if not exists places_city_idx on public.places(city_id) where status = 'published';

create table if not exists public.place_photos (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references public.places(id) on delete cascade,
  url        text not null,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- itineraries  (ordered, day-by-day; stops reference any place by text ref)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.itineraries (
  id           uuid primary key default gen_random_uuid(),
  city_id      text not null,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  summary      text,
  days         int not null default 1,
  source       text not null default 'community' check (source in ('community','official')),
  is_published boolean not null default false,
  like_count   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists itineraries_city_idx on public.itineraries(city_id) where is_published;

create table if not exists public.itinerary_stops (
  id            uuid primary key default gen_random_uuid(),
  itinerary_id  uuid not null references public.itineraries(id) on delete cascade,
  day           int not null default 1,
  position      int not null default 0,
  place_ref     text not null,        -- curated id ('amsterdam/food-01') or a places.id uuid
  place_name    text not null,        -- denormalised for display
  note          text
);
create index if not exists stops_itin_idx on public.itinerary_stops(itinerary_id);

-- ─────────────────────────────────────────────────────────────
-- moments  (shared journal entries)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.moments (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  city_id     text not null,
  place_ref   text,
  place_name  text,
  body        text,
  mood        text,
  happened_at timestamptz,
  is_public   boolean not null default false,
  like_count  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.moment_photos (
  id         uuid primary key default gen_random_uuid(),
  moment_id  uuid not null references public.moments(id) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- comments + likes (no dislikes) + reports
-- ─────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('itinerary','place','moment')),
  target_id   uuid not null,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_target_idx on public.comments(target_type, target_id);

create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('itinerary','place','moment')),
  target_id   uuid not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);
create index if not exists likes_target_idx on public.likes(target_type, target_id);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('itinerary','place','moment','comment')),
  target_id   uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- like_count maintenance (keep denormalised counts correct)
-- ─────────────────────────────────────────────────────────────
create or replace function public.bump_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta int; tt text; tid uuid;
begin
  if (tg_op = 'INSERT') then delta := 1; tt := new.target_type; tid := new.target_id;
  else delta := -1; tt := old.target_type; tid := old.target_id; end if;
  if tt = 'itinerary' then update public.itineraries set like_count = greatest(0, like_count + delta) where id = tid;
  elsif tt = 'place'   then update public.places      set like_count = greatest(0, like_count + delta) where id = tid;
  elsif tt = 'moment'  then update public.moments     set like_count = greatest(0, like_count + delta) where id = tid;
  end if;
  return null;
end; $$;

drop trigger if exists likes_count_ins on public.likes;
drop trigger if exists likes_count_del on public.likes;
create trigger likes_count_ins after insert on public.likes for each row execute function public.bump_like_count();
create trigger likes_count_del after delete on public.likes for each row execute function public.bump_like_count();

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security
--   read: published/public content is world-readable
--   write: you may only touch your own rows
-- ─────────────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.places          enable row level security;
alter table public.place_photos    enable row level security;
alter table public.itineraries     enable row level security;
alter table public.itinerary_stops enable row level security;
alter table public.moments         enable row level security;
alter table public.moment_photos   enable row level security;
alter table public.comments        enable row level security;
alter table public.likes           enable row level security;
alter table public.reports         enable row level security;

-- profiles
create policy "profiles readable"        on public.profiles for select using (true);
create policy "own profile upsert"       on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update"       on public.profiles for update using (auth.uid() = id);

-- places
create policy "published places read"    on public.places for select using (status = 'published' or author_id = auth.uid());
create policy "insert own place"         on public.places for insert with check (auth.uid() = author_id);
create policy "update own place"         on public.places for update using (auth.uid() = author_id);
create policy "delete own place"         on public.places for delete using (auth.uid() = author_id);

-- place_photos
create policy "place photos read"        on public.place_photos for select using (true);
create policy "insert own place photo"   on public.place_photos for insert with check (auth.uid() = author_id);
create policy "delete own place photo"   on public.place_photos for delete using (auth.uid() = author_id);

-- itineraries
create policy "published itineraries read" on public.itineraries for select using (is_published or author_id = auth.uid());
create policy "insert own itinerary"     on public.itineraries for insert with check (auth.uid() = author_id);
create policy "update own itinerary"     on public.itineraries for update using (auth.uid() = author_id);
create policy "delete own itinerary"     on public.itineraries for delete using (auth.uid() = author_id);

-- itinerary_stops (gated through the parent itinerary)
create policy "stops read" on public.itinerary_stops for select using (
  exists (select 1 from public.itineraries i where i.id = itinerary_id and (i.is_published or i.author_id = auth.uid())));
create policy "stops write" on public.itinerary_stops for all using (
  exists (select 1 from public.itineraries i where i.id = itinerary_id and i.author_id = auth.uid()))
  with check (
  exists (select 1 from public.itineraries i where i.id = itinerary_id and i.author_id = auth.uid()));

-- moments
create policy "public moments read"      on public.moments for select using (is_public or author_id = auth.uid());
create policy "insert own moment"        on public.moments for insert with check (auth.uid() = author_id);
create policy "update own moment"        on public.moments for update using (auth.uid() = author_id);
create policy "delete own moment"        on public.moments for delete using (auth.uid() = author_id);
create policy "moment photos read"       on public.moment_photos for select using (true);
create policy "moment photos write"      on public.moment_photos for all using (
  exists (select 1 from public.moments m where m.id = moment_id and m.author_id = auth.uid()))
  with check (
  exists (select 1 from public.moments m where m.id = moment_id and m.author_id = auth.uid()));

-- comments (anyone authed may comment; edit/delete only your own)
create policy "comments read"            on public.comments for select using (true);
create policy "insert comment"           on public.comments for insert with check (auth.uid() = author_id);
create policy "delete own comment"       on public.comments for delete using (auth.uid() = author_id);

-- likes (anyone authed may like; remove only your own)
create policy "likes read"               on public.likes for select using (true);
create policy "insert own like"          on public.likes for insert with check (auth.uid() = user_id);
create policy "delete own like"          on public.likes for delete using (auth.uid() = user_id);

-- reports (insert only; readable by no one client-side)
create policy "insert own report"        on public.reports for insert with check (auth.uid() = reporter_id);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for photos (public read)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos public read" on storage.objects for select using (bucket_id = 'photos');
create policy "photos auth upload" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy "photos owner delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and owner = auth.uid());
