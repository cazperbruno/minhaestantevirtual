-- RPC para entrar em clubes públicos sem precisar de invitation/request
create or replace function public.join_public_club(_club_id uuid)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_club book_clubs%rowtype;
begin
  if v_user is null then
    return query select false, 'not_authenticated'::text;
    return;
  end if;

  select * into v_club from public.book_clubs where id = _club_id;
  if not found then
    return query select false, 'club_not_found'::text;
    return;
  end if;

  if not v_club.is_public then
    return query select false, 'club_not_public'::text;
    return;
  end if;

  -- já membro?
  if exists (select 1 from public.club_members where club_id = _club_id and user_id = v_user) then
    return query select true, 'already_member'::text;
    return;
  end if;

  insert into public.club_members(club_id, user_id, role)
  values (_club_id, v_user, 'member');

  return query select true, 'joined'::text;
end;
$$;

revoke all on function public.join_public_club(uuid) from public;
grant execute on function public.join_public_club(uuid) to authenticated;