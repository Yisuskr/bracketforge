grant usage on schema public to anon, authenticated;

grant select
on public.tournaments,
   public.participants,
   public.rounds,
   public.matches
to anon, authenticated;

grant select, insert, update
on public.profiles
to authenticated;

grant insert, update, delete
on public.tournaments,
   public.participants,
   public.rounds,
   public.matches
to authenticated;
