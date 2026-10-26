-- Password setup is enforced by database role checks, not only the browser screen.
alter table public.employee_profiles add column setup_required boolean not null default false;
create or replace function public.has_role(rid uuid,roles public.staff_role[] default array['owner','admin','cook','waiter']::public.staff_role[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.restaurant_id=rid and m.user_id=auth.uid() and m.role=any(roles)) and not exists(select 1 from public.employee_profiles e where e.restaurant_id=rid and e.user_id=auth.uid() and e.setup_required and not e.archived)
$$;
create function public.employee_setup() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'restaurant_id',e.restaurant_id,'name',e.name,'email',e.email,'phone',e.phone,'employee_id',e.employee_id,'role',e.role,'restaurant_name',r.name,'slug',r.slug,'photo_path',e.photo_path)
 from public.employee_profiles e join public.restaurants r on r.id=e.restaurant_id where e.user_id=auth.uid() and not e.archived and e.setup_required order by e.created_at limit 1
$$;
grant execute on function public.employee_setup() to authenticated;
-- Authenticated employees may update only their own personal details, never access or role.
create function public.save_my_employee_profile(p_id uuid,p_name text,p_phone text,p_photo text default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;
begin
 select * into e from public.employee_profiles where id=p_id and user_id=auth.uid() and not archived for update;
 if not found then raise exception 'Employee not found';end if;
 if p_photo is not null and p_photo is distinct from e.photo_path and p_photo not like e.restaurant_id::text||'/'||e.id::text||'/%' then raise exception 'Invalid employee photo path';end if;
 update public.employee_profiles set name=trim(p_name),phone=trim(p_phone),photo_path=p_photo where id=e.id;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(e.restaurant_id,auth.uid(),'employee.profile_updated',e.id);
end $$;
grant execute on function public.save_my_employee_profile(uuid,text,text,text) to authenticated;
create policy employee_own_photo_upload on storage.objects for insert to authenticated with check(bucket_id='employee-photos' and exists(select 1 from public.employee_profiles e where e.user_id=auth.uid() and not e.archived and (storage.foldername(storage.objects.name))[1]=e.restaurant_id::text and (storage.foldername(storage.objects.name))[2]=e.id::text));
create policy employee_own_photo_delete on storage.objects for delete to authenticated using(bucket_id='employee-photos' and exists(select 1 from public.employee_profiles e where e.user_id=auth.uid() and not e.archived and (storage.foldername(storage.objects.name))[1]=e.restaurant_id::text and (storage.foldername(storage.objects.name))[2]=e.id::text));
-- Only the server may finish the mandatory first-login step, after Auth accepts a new password.
create function public.finish_employee_setup(p_user uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.employee_profiles set setup_required=false where id=p_id and user_id=p_user and not archived;
 if not found then raise exception 'Employee not found';end if;
end $$;
revoke execute on function public.finish_employee_setup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_employee_setup(uuid,uuid) to service_role;
grant select,update on public.employee_profiles to service_role;

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
  if public.employee_setup() is not null then raise exception 'Complete employee setup first';end if;
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
