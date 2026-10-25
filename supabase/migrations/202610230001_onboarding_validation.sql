-- Keep the same tenant/owner authorization; return actionable validation errors.
create or replace function public.create_restaurant(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
  normalized_slug text := lower(trim(p_slug));
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'A registered account is required';
  end if;
  if normalized_slug is null or normalized_slug !~ '^[a-z0-9][a-z0-9-]{2,60}$' then
    raise exception using errcode = '22023',
      message = 'Enter a restaurant identifier such as greenbites, not a website address. Use 3–61 lowercase letters, numbers or hyphens, starting with a letter or number.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 2));
  if exists(select 1 from public.memberships where user_id = auth.uid() and role = 'owner') then
    raise exception 'You already own a restaurant';
  end if;
  begin
    insert into public.restaurants(name, slug)
      values(trim(p_name), normalized_slug) returning id into rid;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'This restaurant identifier is already in use. Please choose another.';
  end;
  insert into public.memberships values(rid, auth.uid(), 'owner');
  insert into public.audit_logs(restaurant_id, actor_id, event, entity_id)
    values(rid, auth.uid(), 'restaurant.created', rid);
  return rid;
end $$;
