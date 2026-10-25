-- Branded restaurant setup and tenant-scoped employee/resource management.
alter table public.restaurants drop constraint restaurants_interface_style_check,drop constraint restaurants_font_family_check,drop constraint restaurants_heading_font_check;
alter table public.restaurants add constraint restaurants_interface_style_check check(interface_style in ('classic','soft','minimal','editorial','bistro','cafe','botanical','midnight','coastal','playful')),add constraint restaurants_font_family_check check(font_family in ('modern','editorial','friendly','geometric','humanist','mono','classic','rounded','luxury','condensed')),add constraint restaurants_heading_font_check check(heading_font in ('modern','editorial','friendly','geometric','humanist','mono','classic','rounded','luxury','condensed'));
alter table public.restaurants add column default_language text not null default 'en' check(default_language in ('en','de','tr'));
alter table public.menu_items add column archived boolean not null default false;
create table public.employee_profiles(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants on delete cascade,user_id uuid references auth.users on delete set null,name text not null check(length(name) between 1 and 100),email text not null check(length(email)<=254 and email like '%@%'),phone text not null default '' check(length(phone)<=40),employee_id text not null check(length(employee_id) between 1 and 40),photo_path text,role public.staff_role not null check(role<>'owner'),archived boolean not null default false,created_at timestamptz not null default now(),unique(restaurant_id,email),unique(restaurant_id,employee_id));
alter table public.employee_profiles enable row level security;
create policy employee_read on public.employee_profiles for select to authenticated using(public.has_role(restaurant_id,array['owner','admin']::public.staff_role[]) or user_id=auth.uid());
grant select on public.employee_profiles to authenticated;
insert into public.employee_profiles(restaurant_id,user_id,name,email,employee_id,role) select m.restaurant_id,m.user_id,coalesce(nullif(split_part(u.email,'@',1),''),'Employee'),lower(u.email),left(m.user_id::text,8),m.role from public.memberships m join auth.users u on u.id=m.user_id where m.role<>'owner';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employee-photos','employee-photos',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy employee_photo_read on storage.objects for select to authenticated using(bucket_id='employee-photos' and exists(select 1 from public.employee_profiles e where e.restaurant_id::text=(storage.foldername(storage.objects.name))[1] and (public.has_role(e.restaurant_id,array['owner','admin']::public.staff_role[]) or (e.user_id=auth.uid() and e.photo_path=storage.objects.name))));
create policy employee_photo_upload on storage.objects for insert to authenticated with check(bucket_id='employee-photos' and public.has_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::public.staff_role[]));
create policy employee_photo_delete on storage.objects for delete to authenticated using(bucket_id='employee-photos' and public.has_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::public.staff_role[]));
create function public.save_employee(p_restaurant uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid; eid uuid; old public.employee_profiles; requested public.staff_role; lim int; em text;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 requested:=(p_data->>'role')::public.staff_role; em:=lower(trim(p_data->>'email'));
 if requested is null or requested='owner' or (requested='admin' and not public.has_role(p_restaurant,array['owner']::public.staff_role[])) then raise exception 'Not authorized to assign this role'; end if;
 if p_id is not null then select * into old from public.employee_profiles where id=p_id and restaurant_id=p_restaurant for update; if not found then raise exception 'Employee not found'; end if;
 if old.role='admin' and not public.has_role(p_restaurant,array['owner']::public.staff_role[]) then raise exception 'Only the owner can manage administrator roles'; end if; end if;
 select id into uid from auth.users where lower(email)=em and not is_anonymous and email_confirmed_at is not null;
 if exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid and role='owner') then raise exception 'The owner account cannot be changed here'; end if;
 if exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid and role='admin') and not public.has_role(p_restaurant,array['owner']::public.staff_role[]) then raise exception 'Only the owner can manage administrator roles'; end if;
 select p.staff_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (p_id is null or old.archived) and (select count(*) from (select user_id::text k from public.memberships where restaurant_id=p_restaurant union select coalesce(user_id::text,id::text) from public.employee_profiles where restaurant_id=p_restaurant and not archived) q)>=lim then raise exception 'Staff plan limit reached'; end if;
 if nullif(p_data->>'photo_path','') is not null and (p_data->>'photo_path') not like p_restaurant::text||'/%' then raise exception 'Invalid employee photo path'; end if;
 if old.user_id is not null and old.user_id is distinct from uid then
 update public.dining_tables set assigned_waiter=null where restaurant_id=p_restaurant and assigned_waiter=old.user_id;
 delete from public.memberships where restaurant_id=p_restaurant and user_id=old.user_id and role<>'owner'; end if;
 if p_id is null then insert into public.employee_profiles(restaurant_id,name,email,phone,employee_id,photo_path,role,user_id) values(p_restaurant,trim(p_data->>'name'),em,coalesce(p_data->>'phone',''),trim(p_data->>'employee_id'),nullif(p_data->>'photo_path',''),requested,uid) returning id into eid;
 else update public.employee_profiles set name=trim(p_data->>'name'),email=em,phone=coalesce(p_data->>'phone',''),employee_id=trim(p_data->>'employee_id'),photo_path=nullif(p_data->>'photo_path',''),role=requested,user_id=uid,archived=false where id=p_id returning id into eid; end if;
 if uid is not null then insert into public.memberships values(p_restaurant,uid,requested) on conflict(restaurant_id,user_id) do update set role=excluded.role; end if;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'employee.saved',eid);return eid;
end $$;
create function public.remove_employee(p_restaurant uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 select * into e from public.employee_profiles where id=p_id and restaurant_id=p_restaurant for update;if not found then raise exception 'Employee not found'; end if;
 if (e.role='admin' or exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=e.user_id and role in ('owner','admin'))) and not public.has_role(p_restaurant,array['owner']::public.staff_role[]) then raise exception 'Only the owner can manage administrator roles'; end if;
 update public.dining_tables set assigned_waiter=null where restaurant_id=p_restaurant and assigned_waiter=e.user_id;
 delete from public.memberships where restaurant_id=p_restaurant and user_id=e.user_id and role<>'owner';
 update public.employee_profiles set archived=true where id=p_id;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'employee.removed',p_id);
end $$;
create function public.claim_employee_access() returns void language plpgsql security definer set search_path='' as $$
declare em text; e public.employee_profiles;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,true) then return; end if;
 select lower(email) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 for e in select * from public.employee_profiles where email=em and user_id is null and not archived for update loop
 insert into public.memberships values(e.restaurant_id,auth.uid(),e.role) on conflict(restaurant_id,user_id) do nothing;
 update public.employee_profiles set user_id=auth.uid() where id=e.id;
 end loop;
end $$;
create function public.manage_restaurant_resource(p_restaurant uuid,p_kind text,p_id uuid,p_name text default null,p_delete boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare lim int;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 if not p_delete and p_kind='table' and exists(select 1 from public.dining_tables where id=p_id and restaurant_id=p_restaurant and not active) then
 select p.table_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (select count(*) from public.dining_tables where restaurant_id=p_restaurant and active)>=lim then raise exception 'Table plan limit reached';end if;end if;
 if not p_delete and p_kind='menu' and exists(select 1 from public.menu_items where id=p_id and restaurant_id=p_restaurant and archived) then
 select p.menu_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (select count(*) from public.menu_items where restaurant_id=p_restaurant and not archived)>=lim then raise exception 'Menu plan limit reached';end if;end if;
 if p_kind='table' then update public.dining_tables set name=coalesce(nullif(trim(p_name),''),name),active=not p_delete where id=p_id and restaurant_id=p_restaurant;
 elsif p_kind='menu' then update public.menu_items set archived=p_delete,available=not p_delete where id=p_id and restaurant_id=p_restaurant;
 elsif p_kind='category' then
 if p_delete then update public.menu_items set category_id=null where restaurant_id=p_restaurant and category_id=p_id;delete from public.categories where restaurant_id=p_restaurant and id=p_id;
 else update public.categories set name=trim(p_name) where restaurant_id=p_restaurant and id=p_id;end if;
 else raise exception 'Unknown resource type';end if;
 if not found then raise exception 'Resource not found';end if;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id,details) values(p_restaurant,auth.uid(),'resource.updated',p_id,jsonb_build_object('kind',p_kind,'removed',p_delete));
end $$;
grant execute on function public.save_employee(uuid,uuid,jsonb),public.remove_employee(uuid,uuid),public.claim_employee_access(),public.manage_restaurant_resource(uuid,text,uuid,text,boolean) to authenticated;

create or replace function public.save_restaurant(p_restaurant uuid,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if not public.plan_has_feature(p_restaurant,'custom_branding') then raise exception 'Feature is not included in this package'; end if;
 if nullif(p_data->>'logo_url','') is not null and p_data->>'logo_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP logo URL'; end if;
 if nullif(p_data->>'cover_url','') is not null and p_data->>'cover_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP cover URL'; end if;
 update public.restaurants set name=p_data->>'name',brand_color=p_data->>'brand_color',address=coalesce(p_data->>'address',''),contact=coalesce(p_data->>'contact',''),opening_hours=coalesce(p_data->>'opening_hours',''),logo_url=nullif(p_data->>'logo_url',''),
 phone=coalesce(p_data->>'phone',phone),accent_color=coalesce(p_data->>'accent_color',accent_color),theme_mode=coalesce(p_data->>'theme_mode',theme_mode),font_family=coalesce(p_data->>'font_family',font_family),interface_style=coalesce(p_data->>'interface_style',interface_style),menu_layout=coalesce(p_data->>'menu_layout',menu_layout),heading_font=coalesce(p_data->>'heading_font',heading_font),density=coalesce(p_data->>'density',density),show_avatars=coalesce((p_data->>'show_avatars')::boolean,show_avatars),welcome_title=coalesce(p_data->>'welcome_title',welcome_title),welcome_message=coalesce(p_data->>'welcome_message',welcome_message),default_language=coalesce(p_data->>'default_language',default_language),cover_url=case when p_data ? 'cover_url' then nullif(p_data->>'cover_url','') else cover_url end
 where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'restaurant.updated',p_restaurant);
end $$;

create or replace function public.get_public_branding(p_slug text default null,p_token uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'slug',r.slug,'name',r.name,'logo_url',r.logo_url,'address',r.address,'phone',r.phone,'contact',r.contact,'opening_hours',r.opening_hours,'brand_color',r.brand_color,'accent_color',r.accent_color,'theme_mode',r.theme_mode,'font_family',r.font_family,'interface_style',r.interface_style,'menu_layout',r.menu_layout,'currency',r.currency,'heading_font',r.heading_font,'density',r.density,'show_avatars',r.show_avatars,'welcome_title',r.welcome_title,'welcome_message',r.welcome_message,'cover_url',r.cover_url,'default_language',r.default_language)
 from public.restaurants r where r.active and (
 (p_token is not null and exists(select 1 from public.dining_tables t where t.restaurant_id=r.id and t.access_token=p_token and t.active))
 or (p_token is null and p_slug is not null and r.slug=p_slug)) limit 1
$$;

create function public.onboard_restaurant(p_name text,p_slug text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 rid:=public.create_restaurant(p_name,p_slug);
 perform public.save_restaurant(rid,p_data||jsonb_build_object('name',p_name));
 return rid;
end $$;
grant execute on function public.onboard_restaurant(text,text,jsonb) to authenticated;

create or replace function public.save_menu_item(p_restaurant uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; lim int;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 if p_id is null then
 select p.menu_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (select count(*) from public.menu_items where restaurant_id=p_restaurant and not archived)>=lim then raise exception 'Menu plan limit reached'; end if;
 insert into public.menu_items(restaurant_id,name,price_cents) values(p_restaurant,p_data->>'name',(p_data->>'price_cents')::int) returning id into mid;
 else mid:=p_id; end if;
 update public.menu_items set name=p_data->>'name',description=coalesce(p_data->>'description',''),price_cents=(p_data->>'price_cents')::int,category_id=nullif(p_data->>'category_id','')::uuid,available=not archived and coalesce((p_data->>'available')::boolean,true),image_url=nullif(p_data->>'image_url',''),video_url=nullif(p_data->>'video_url',''),ingredients=array(select jsonb_array_elements_text(coalesce(p_data->'ingredients','[]'))),allergens=array(select jsonb_array_elements_text(coalesce(p_data->'allergens','[]'))) where id=mid and restaurant_id=p_restaurant;
 if not found then raise exception 'Menu item not found'; end if;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'menu.saved',mid); return mid;
end $$;

create or replace function public.create_table(p_restaurant uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid; lim int;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 select p.table_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (select count(*) from public.dining_tables where restaurant_id=p_restaurant and active)>=lim then raise exception 'Table plan limit reached'; end if;
 insert into public.dining_tables(restaurant_id,name) values(p_restaurant,p_name) returning id into tid; return tid;
end $$;
-- Keep the older role endpoint consistent with the employee directory.
create or replace function public.add_staff(p_restaurant uuid,p_email text,p_role public.staff_role)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; e public.employee_profiles; owner_access boolean;
begin
 owner_access:=public.has_role(p_restaurant,array['owner']::public.staff_role[]);
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) or p_role is null or p_role='owner' or (p_role='admin' and not owner_access) then raise exception 'Not authorized to assign this role';end if;
 select id into uid from auth.users where lower(email)=lower(trim(p_email)) and not is_anonymous and email_confirmed_at is not null;
 if uid is null then raise exception 'Ask this employee to create and confirm their account first';end if;
 if exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid and (role='owner' or (role='admin' and not owner_access))) then raise exception 'Only the owner can manage administrator roles';end if;
 select * into e from public.employee_profiles where restaurant_id=p_restaurant and email=lower(trim(p_email));
 perform public.save_employee(p_restaurant,e.id,jsonb_build_object('name',coalesce(e.name,split_part(p_email,'@',1)),'email',p_email,'role',p_role,'employee_id',coalesce(e.employee_id,uid::text),'phone',coalesce(e.phone,''),'photo_path',e.photo_path));
end $$;
