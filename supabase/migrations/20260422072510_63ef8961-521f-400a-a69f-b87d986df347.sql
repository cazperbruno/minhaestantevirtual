create table if not exists public.club_invite_links (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  token text not null unique,
  created_by uuid not null,
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_invite_links_club on public.club_invite_links(club_id);
create index if not exists idx_club_invite_links_token on public.club_invite_links(token) where revoked = false;

alter table public.club_invite_links enable row level security;

drop policy if exists "owner_select_invite_links" on public.club_invite_links;
create policy "owner_select_invite_links"
  on public.club_invite_links for select
  using (exists (select 1 from public.book_clubs c where c.id = club_id and c.owner_id = auth.uid()));

drop policy if exists "owner_insert_invite_links" on public.club_invite_links;
create policy "owner_insert_invite_links"
  on public.club_invite_links for insert
  with check (
    exists (select 1 from public.book_clubs c where c.id = club_id and c.owner_id = auth.uid())
    and created_by = auth.uid()
  );

drop policy if exists "owner_update_invite_links" on public.club_invite_links;
create policy "owner_update_invite_links"
  on public.club_invite_links for update
  using (exists (select 1 from public.book_clubs c where c.id = club_id and c.owner_id = auth.uid()));

create or replace function public.create_club_invite_link(
  _club_id uuid,
  _expires_in_days int default null,
  _max_uses int default null
)
returns table(token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_token text;
  v_expires timestamptz;
begin
  select owner_id into v_owner from public.book_clubs where id = _club_id;
  if v_owner is null then raise exception 'club_not_found'; end if;
  if v_owner <> auth.uid() then raise exception 'not_owner'; end if;

  update public.club_invite_links set revoked = true
    where club_id = _club_id and revoked = false;

  v_token := replace(replace(replace(encode(gen_random_bytes(12), 'base64'), '+', '-'), '/', '_'), '=', '');
  if _expires_in_days is not null then
    v_expires := now() + make_interval(days => _expires_in_days);
  end if;

  insert into public.club_invite_links(club_id, token, created_by, expires_at, max_uses)
  values (_club_id, v_token, auth.uid(), v_expires, _max_uses);

  return query select v_token;
end;
$$;

create or replace function public.redeem_club_invite_token(_token text)
returns table(success boolean, message text, club_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.club_invite_links%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return query select false, 'auth_required'::text, null::uuid;
    return;
  end if;

  select * into v_link from public.club_invite_links
    where token = _token and revoked = false limit 1;

  if not found then
    return query select false, 'invalid_or_revoked'::text, null::uuid;
    return;
  end if;

  if v_link.expires_at is not null and v_link.expires_at < now() then
    return query select false, 'expired'::text, v_link.club_id;
    return;
  end if;

  if v_link.max_uses is not null and v_link.uses >= v_link.max_uses then
    return query select false, 'max_uses_reached'::text, v_link.club_id;
    return;
  end if;

  if exists (select 1 from public.club_members where club_id = v_link.club_id and user_id = v_user) then
    return query select true, 'already_member'::text, v_link.club_id;
    return;
  end if;

  insert into public.club_members(club_id, user_id, role) values (v_link.club_id, v_user, 'member');
  update public.club_invite_links set uses = uses + 1 where id = v_link.id;

  return query select true, 'joined'::text, v_link.club_id;
end;
$$;

grant execute on function public.create_club_invite_link(uuid, int, int) to authenticated;
grant execute on function public.redeem_club_invite_token(text) to authenticated;