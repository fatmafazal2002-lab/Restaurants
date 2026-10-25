alter table public.restaurants
  add column phone text not null default '' check(length(phone)<=40),
  add column accent_color text not null default '#b58a56' check(accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column theme_mode text not null default 'light' check(theme_mode in ('light','dark','system')),
  add column font_family text not null default 'modern' check(font_family in ('modern','editorial','friendly')),
  add column interface_style text not null default 'classic' check(interface_style in ('classic','soft','minimal')),
  add column menu_layout text not null default 'grid' check(menu_layout in ('grid','list'));

create or replace function public.save_restaurant(p_restaurant uuid,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if nullif(p_data->>'logo_url','') is not null and p_data->>'logo_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP logo URL'; end if;
 update public.restaurants set name=p_data->>'name',brand_color=p_data->>'brand_color',address=coalesce(p_data->>'address',''),contact=coalesce(p_data->>'contact',''),opening_hours=coalesce(p_data->>'opening_hours',''),logo_url=nullif(p_data->>'logo_url',''),
 phone=coalesce(p_data->>'phone',phone),accent_color=coalesce(p_data->>'accent_color',accent_color),theme_mode=coalesce(p_data->>'theme_mode',theme_mode),font_family=coalesce(p_data->>'font_family',font_family),interface_style=coalesce(p_data->>'interface_style',interface_style),menu_layout=coalesce(p_data->>'menu_layout',menu_layout)
 where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'restaurant.updated',p_restaurant);
end $$;

-- Public presentation data only: no memberships, guest data, table tokens or plan details.
create function public.get_public_branding(p_slug text default null,p_token uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'slug',r.slug,'name',r.name,'logo_url',r.logo_url,'address',r.address,'phone',r.phone,'contact',r.contact,'opening_hours',r.opening_hours,'brand_color',r.brand_color,'accent_color',r.accent_color,'theme_mode',r.theme_mode,'font_family',r.font_family,'interface_style',r.interface_style,'menu_layout',r.menu_layout,'currency',r.currency)
 from public.restaurants r where r.active and (
 (p_token is not null and exists(select 1 from public.dining_tables t where t.restaurant_id=r.id and t.access_token=p_token and t.active))
 or (p_token is null and p_slug is not null and r.slug=p_slug)) limit 1
$$;
revoke all on function public.get_public_branding(text,uuid) from public;
grant execute on function public.get_public_branding(text,uuid) to anon,authenticated;

create or replace function public.add_staff(p_restaurant uuid,p_email text,p_role public.staff_role)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; lim int; owner_access boolean;
begin
 owner_access:=public.has_role(p_restaurant,array['owner']::public.staff_role[]);
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) or p_role is null or p_role='owner' or (p_role='admin' and not owner_access) then raise exception 'Not authorized to assign this role'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 select id into uid from auth.users where lower(email)=lower(trim(p_email)) and not is_anonymous;
 if uid is null then raise exception 'Ask this employee to create and confirm their account first'; end if;
 if exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid and (role='owner' or (role='admin' and not owner_access))) then raise exception 'Only the owner can manage administrator roles'; end if;
 select p.staff_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if not exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid) and (select count(*) from public.memberships where restaurant_id=p_restaurant)>=lim then raise exception 'Staff plan limit reached'; end if;
 insert into public.memberships values(p_restaurant,uid,p_role) on conflict(restaurant_id,user_id) do update set role=excluded.role;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id,details) values(p_restaurant,auth.uid(),'staff.assigned',uid,jsonb_build_object('role',p_role));
end $$;

create function public.list_staff(p_restaurant uuid)
returns table(user_id uuid,email text,role public.staff_role)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 return query select m.user_id,u.email::text,m.role from public.memberships m join auth.users u on u.id=m.user_id where m.restaurant_id=p_restaurant order by m.role,u.email;
end $$;
revoke all on function public.list_staff(uuid) from public;
grant execute on function public.list_staff(uuid) to authenticated;
alter publication supabase_realtime add table public.restaurants;
