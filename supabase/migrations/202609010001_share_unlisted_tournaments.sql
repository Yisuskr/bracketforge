drop policy if exists "visible tournaments readable" on public.tournaments;
create policy "visible tournaments readable"
on public.tournaments
for select
using (visibility in ('public', 'unlisted') or owner_id = auth.uid());

drop policy if exists "participants follow tournament visibility" on public.participants;
create policy "participants follow tournament visibility"
on public.participants
for select
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and (t.visibility in ('public', 'unlisted') or t.owner_id = auth.uid())
  )
);

drop policy if exists "rounds follow tournament visibility" on public.rounds;
create policy "rounds follow tournament visibility"
on public.rounds
for select
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and (t.visibility in ('public', 'unlisted') or t.owner_id = auth.uid())
  )
);

drop policy if exists "matches follow tournament visibility" on public.matches;
create policy "matches follow tournament visibility"
on public.matches
for select
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and (t.visibility in ('public', 'unlisted') or t.owner_id = auth.uid())
  )
);

create index if not exists tournaments_shared_idx
on public.tournaments(updated_at desc)
where visibility in ('public', 'unlisted');
