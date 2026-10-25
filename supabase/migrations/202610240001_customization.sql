-- Additional controlled presentation settings; workflow permissions remain unchanged.
alter table public.restaurants
 add column heading_font text not null default 'editorial' check(heading_font in ('modern','editorial','friendly')),
 add column density text not null default 'comfortable' check(density in ('comfortable','compact')),
 add column show_avatars boolean not null default true,
 add column welcome_title text not null default '' check(length(welcome_title)<=120),
 add column welcome_message text not null default '' check(length(welcome_message)<=500),
 add column cover_url text check(cover_url is null or (length(cover_url)<=2048 and cover_url ~ '^https?://'));
-- Preserve the heading appearance selected before independent font controls existed.
update public.restaurants set heading_font=case when font_family='modern' then 'editorial' else font_family end;
insert into public.plans(id,name,table_limit,staff_limit,menu_limit) values('enterprise','Enterprise',200,100,2000);

create or replace function public.save_restaurant(p_restaurant uuid,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if nullif(p_data->>'logo_url','') is not null and p_data->>'logo_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP logo URL'; end if;
 if nullif(p_data->>'cover_url','') is not null and p_data->>'cover_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP cover URL'; end if;
 update public.restaurants set name=p_data->>'name',brand_color=p_data->>'brand_color',address=coalesce(p_data->>'address',''),contact=coalesce(p_data->>'contact',''),opening_hours=coalesce(p_data->>'opening_hours',''),logo_url=nullif(p_data->>'logo_url',''),
 phone=coalesce(p_data->>'phone',phone),accent_color=coalesce(p_data->>'accent_color',accent_color),theme_mode=coalesce(p_data->>'theme_mode',theme_mode),font_family=coalesce(p_data->>'font_family',font_family),interface_style=coalesce(p_data->>'interface_style',interface_style),menu_layout=coalesce(p_data->>'menu_layout',menu_layout),heading_font=coalesce(p_data->>'heading_font',heading_font),density=coalesce(p_data->>'density',density),show_avatars=coalesce((p_data->>'show_avatars')::boolean,show_avatars),welcome_title=coalesce(p_data->>'welcome_title',welcome_title),welcome_message=coalesce(p_data->>'welcome_message',welcome_message),cover_url=case when p_data ? 'cover_url' then nullif(p_data->>'cover_url','') else cover_url end
 where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'restaurant.updated',p_restaurant);
end $$;

-- Public presentation data only: no memberships, guest data, table tokens or plan details.
create or replace function public.get_public_branding(p_slug text default null,p_token uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'slug',r.slug,'name',r.name,'logo_url',r.logo_url,'address',r.address,'phone',r.phone,'contact',r.contact,'opening_hours',r.opening_hours,'brand_color',r.brand_color,'accent_color',r.accent_color,'theme_mode',r.theme_mode,'font_family',r.font_family,'interface_style',r.interface_style,'menu_layout',r.menu_layout,'currency',r.currency,'heading_font',r.heading_font,'density',r.density,'show_avatars',r.show_avatars,'welcome_title',r.welcome_title,'welcome_message',r.welcome_message,'cover_url',r.cover_url)
 from public.restaurants r where r.active and (
 (p_token is not null and exists(select 1 from public.dining_tables t where t.restaurant_id=r.id and t.access_token=p_token and t.active))
 or (p_token is null and p_slug is not null and r.slug=p_slug)) limit 1
$$;
revoke all on function public.get_public_branding(text,uuid) from public;
grant execute on function public.get_public_branding(text,uuid) to anon,authenticated;

