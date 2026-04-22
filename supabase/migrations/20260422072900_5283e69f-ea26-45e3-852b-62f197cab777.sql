create or replace function public.notify_owner_on_invite_redeem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club_name text;
  v_user_name text;
begin
  -- só notifica se uses incrementou (resgate via redeem_club_invite_token)
  if NEW.uses <= OLD.uses then
    return NEW;
  end if;

  select owner_id, name into v_owner, v_club_name
    from public.book_clubs where id = NEW.club_id;

  if v_owner is null then return NEW; end if;

  select coalesce(display_name, username, 'Um leitor') into v_user_name
    from public.profiles where id = auth.uid();

  insert into public.notifications(user_id, kind, title, body, link)
  values (
    v_owner,
    'club_invite_redeemed',
    'Novo membro no clube',
    coalesce(v_user_name, 'Um leitor') || ' entrou em "' || coalesce(v_club_name, 'seu clube') || '" pelo link de convite.',
    '/clubes/' || NEW.club_id::text
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_owner_invite_redeem on public.club_invite_links;
create trigger trg_notify_owner_invite_redeem
  after update of uses on public.club_invite_links
  for each row
  execute function public.notify_owner_on_invite_redeem();