-- Travel Journal — security hardening (run after 0001_init.sql)
-- Addresses two leaks found in review + tightens read access to logged-in users,
-- since the app is account-required anyway.

-- ─────────────────────────────────────────────────────────────
-- 1) profiles: don't let an anonymous holder of the publishable key
--    enumerate every user's handle / name / avatar. Require login.
--    (Emails are NOT here — they live in auth.users — so none leak.)
-- ─────────────────────────────────────────────────────────────
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- 2) moment_photos: previously world-readable (using true), which leaked
--    photo URLs of PRIVATE journal moments. Gate reads through the parent
--    moment's visibility.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "moment photos read" on public.moment_photos;
create policy "moment photos read" on public.moment_photos
  for select using (
    exists (select 1 from public.moments m
            where m.id = moment_id and (m.is_public or m.author_id = auth.uid())));

-- ─────────────────────────────────────────────────────────────
-- 3) Tighten remaining community reads to logged-in users only
--    (the app gates on an account, so anonymous scraping with the public
--    key has no legitimate use). Published/public filters still apply.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "published places read" on public.places;
create policy "published places read" on public.places
  for select to authenticated using (status = 'published' or author_id = auth.uid());

drop policy if exists "place photos read" on public.place_photos;
create policy "place photos read" on public.place_photos
  for select to authenticated using (true);

drop policy if exists "published itineraries read" on public.itineraries;
create policy "published itineraries read" on public.itineraries
  for select to authenticated using (is_published or author_id = auth.uid());

drop policy if exists "public moments read" on public.moments;
create policy "public moments read" on public.moments
  for select to authenticated using (is_public or author_id = auth.uid());

drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments for select to authenticated using (true);

drop policy if exists "likes read" on public.likes;
create policy "likes read" on public.likes for select to authenticated using (true);

-- itinerary_stops + moment_photos already gate through their parent; keep as-is.
-- reports stay insert-only (no select policy = no client can read them). Good.
