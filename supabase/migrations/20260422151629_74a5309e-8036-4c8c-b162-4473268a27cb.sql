-- 1) Spoiler opcional em mensagens do clube
alter table public.club_messages
  add column if not exists spoiler_page integer;

-- 2) Histórico de resgates de convite
create table if not exists public.club_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_link_id uuid not null references public.club_invite_links(id) on delete cascade,
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  user_id uuid not null,
  redeemed_at timestamptz not null default now()
);

create index if not exists idx_club_invite_redemptions_link on public.club_invite_redemptions(invite_link_id);
create index if not exists idx_club_invite_redemptions_club on public.club_invite_redemptions(club_id, redeemed_at desc);

alter table public.club_invite_redemptions enable row level security;

-- Apenas dono do clube vê o histórico
drop policy if exists "owner_select_invite_redemptions" on public.club_invite_redemptions;
create policy "owner_select_invite_redemptions"
  on public.club_invite_redemptions for select
  using (exists (
    select 1 from public.book_clubs c
    where c.id = club_invite_redemptions.club_id and c.owner_id = auth.uid()
  ));

-- Próprio usuário vê seu resgate (útil para debug do convite)
drop policy if exists "user_select_own_redemption" on public.club_invite_redemptions;
create policy "user_select_own_redemption"
  on public.club_invite_redemptions for select
  using (user_id = auth.uid());

-- 3) Atualiza a função de redeem para gravar histórico
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
  insert into public.club_invite_redemptions(invite_link_id, club_id, user_id)
    values (v_link.id, v_link.club_id, v_user);

  return query select true, 'joined'::text, v_link.club_id;
end;
$$;

grant execute on function public.redeem_club_invite_token(text) to authenticated;