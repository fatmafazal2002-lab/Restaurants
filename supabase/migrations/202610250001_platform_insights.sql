-- Platform catalogue and transparent aggregate reporting.
alter table public.plans add column monthly_price_cents integer not null default 0 check(monthly_price_cents between 0 and 100000000), add column currency text not null default 'EUR' check(currency in ('EUR','USD','GBP','TRY')), add column description text not null default '' check(length(description)<=600), add column description_tr text not null default '' check(length(description_tr)<=600), add column published boolean not null default true;
update public.plans set monthly_price_cents=case id when 'starter' then 5000 when 'growth' then 10000 when 'enterprise' then 19900 else 0 end;
create table public.plan_features(code text primary key check(code ~ '^[a-z][a-z0-9_]{2,60}$'),name text not null check(length(name) between 1 and 100),name_tr text not null check(length(name_tr) between 1 and 100),description text not null default '' check(length(description)<=500),builtin boolean not null default false);
create table public.plan_feature_links(plan_id text references public.plans on delete cascade,feature_code text references public.plan_features on delete cascade,primary key(plan_id,feature_code));
insert into public.plan_features(code,name,name_tr,builtin) values ('guest_ordering','Guest ordering','Misafir siparişleri',true),('service_requests','Floor-service requests','Servis talepleri',true),('guest_feedback','Guest feedback','Misafir değerlendirmeleri',true),('custom_branding','Brand customization','Marka özelleştirme',true);
insert into public.plan_feature_links select p.id,f.code from public.plans p cross join public.plan_features f;
create table public.platform_audit(id bigint generated always as identity primary key,actor_id uuid,event text not null,entity text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table public.plan_features enable row level security;
alter table public.plan_feature_links enable row level security;
alter table public.platform_audit enable row level security;
create policy features_read on public.plan_features for select to authenticated using(true);
create policy feature_links_read on public.plan_feature_links for select to authenticated using(true);
create policy platform_audit_read on public.platform_audit for select to authenticated using(public.is_platform_admin());
grant select on public.plan_features,public.plan_feature_links,public.platform_audit to authenticated;
create function public.get_public_plans() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'monthly_price_cents',p.monthly_price_cents,'currency',p.currency,'description',p.description,'description_tr',p.description_tr,'table_limit',p.table_limit,'staff_limit',p.staff_limit,'menu_limit',p.menu_limit,'features',(select coalesce(jsonb_agg(jsonb_build_object('code',f.code,'name',f.name,'name_tr',f.name_tr,'builtin',f.builtin) order by f.code),'[]'::jsonb) from public.plan_feature_links l join public.plan_features f on f.code=l.feature_code where l.plan_id=p.id)) order by p.monthly_price_cents,p.id),'[]'::jsonb) from public.plans p where p.published
$$;
grant execute on function public.get_public_plans() to anon,authenticated;
create function public.plan_has_feature(p_restaurant uuid,p_code text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.restaurants r join public.plan_feature_links l on l.plan_id=r.plan_id where r.id=p_restaurant and l.feature_code=p_code) $$;
-- Internal helper only: public clients do not inspect arbitrary tenant entitlements.
create function public.platform_save_feature(p_code text,p_name text,p_name_tr text,p_description text) returns void language plpgsql security definer set search_path='' as $$
declare old jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
 select to_jsonb(f) into old from public.plan_features f where code=p_code for update;
 insert into public.plan_features(code,name,name_tr,description) values(p_code,trim(p_name),trim(p_name_tr),p_description) on conflict(code) do update set name=excluded.name,name_tr=excluded.name_tr,description=excluded.description;
 insert into public.platform_audit(actor_id,event,entity,before_data,after_data) select auth.uid(),'feature.saved',p_code,old,to_jsonb(f) from public.plan_features f where code=p_code;
end $$;
create function public.platform_save_plan(p_id text,p_data jsonb,p_features text[]) returns void language plpgsql security definer set search_path='' as $$
declare old jsonb; old_links jsonb; new_data jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
 if p_id !~ '^[a-z][a-z0-9_-]{2,60}$' then raise exception 'Use a lowercase package identifier'; end if;
 if p_features is null then raise exception 'Feature selection is required'; end if;
 if exists(select 1 from unnest(p_features) f where not exists(select 1 from public.plan_features where code=f)) then raise exception 'Unknown feature'; end if;
 perform pg_advisory_xact_lock(hashtextextended('plan:'||p_id,0));
 select to_jsonb(p) into old from public.plans p where id=p_id for update;
 select coalesce(jsonb_agg(feature_code order by feature_code),'[]'::jsonb) into old_links from public.plan_feature_links where plan_id=p_id;
 insert into public.plans(id,name,table_limit,staff_limit,menu_limit,monthly_price_cents,currency,description,description_tr,published) values(p_id,trim(p_data->>'name'),(p_data->>'table_limit')::int,(p_data->>'staff_limit')::int,(p_data->>'menu_limit')::int,(p_data->>'monthly_price_cents')::int,p_data->>'currency',coalesce(p_data->>'description',''),coalesce(p_data->>'description_tr',''),coalesce((p_data->>'published')::boolean,true)) on conflict(id) do update set name=excluded.name,table_limit=excluded.table_limit,staff_limit=excluded.staff_limit,menu_limit=excluded.menu_limit,monthly_price_cents=excluded.monthly_price_cents,currency=excluded.currency,description=excluded.description,description_tr=excluded.description_tr,published=excluded.published;
 delete from public.plan_feature_links where plan_id=p_id;
 insert into public.plan_feature_links select p_id,code from public.plan_features where code=any(p_features);
 select to_jsonb(p) into new_data from public.plans p where id=p_id;
 insert into public.platform_audit(actor_id,event,entity,before_data,after_data) values(auth.uid(),'plan.saved',p_id,jsonb_build_object('plan',old,'features',old_links),jsonb_build_object('plan',new_data,'features',p_features));
end $$;
grant execute on function public.platform_save_plan(text,jsonb,text[]), public.platform_save_feature(text,text,text,text) to authenticated;
create or replace function public.platform_update_restaurant(p_restaurant uuid,p_plan text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare old jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
 select jsonb_build_object('plan_id',plan_id,'active',active) into old from public.restaurants where id=p_restaurant for update;
 if not found then raise exception 'Restaurant not found'; end if;
 update public.restaurants set plan_id=p_plan,active=p_active where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id,details) values(p_restaurant,auth.uid(),'platform.restaurant_updated',p_restaurant,jsonb_build_object('before',old,'after',jsonb_build_object('plan_id',p_plan,'active',p_active)));
 insert into public.platform_audit(actor_id,event,entity,before_data,after_data) values(auth.uid(),'restaurant.updated',p_restaurant::text,old,jsonb_build_object('plan_id',p_plan,'active',p_active));
end $$;
create function public.platform_analytics(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz; report jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
 if p_days not in (7,30,90) then raise exception 'Choose 7, 30 or 90 days'; end if;
 start_at:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - (p_days-1)*interval '1 day';
 with cohort as (select o.*,r.currency from public.orders o join public.restaurants r on r.id=o.restaurant_id where o.created_at>=start_at and o.created_at<=now()),
 totals as (select o.id,coalesce(sum(i.quantity::bigint*i.price_cents) filter(where not i.cancelled),0) cents from cohort o left join public.order_items i on i.order_id=o.id group by o.id),
 daily as (select d::date as report_day from generate_series(start_at at time zone 'UTC',now() at time zone 'UTC',interval '1 day') d)
 select jsonb_build_object('generated_at',now(),'from',start_at,'to',now(),'days',p_days,'timezone','UTC',
 'restaurants',(select count(*) from public.restaurants),'active_restaurants',(select count(*) from public.restaurants where active),'staff_accounts',(select count(distinct user_id) from public.memberships),'menu_items',(select count(*) from public.menu_items),'tables',(select count(*) from public.dining_tables where active),
 'orders',(select count(*) from cohort),'served',(select count(*) from cohort where status='served'),'cancelled',(select count(*) from cohort where status='cancelled'),'open_orders',(select count(*) from cohort where status in ('placed','preparing','ready')),
 'avg_preparation_minutes',(select round(avg(extract(epoch from (ready_at-preparing_at))/60)::numeric,1) from cohort where preparing_at is not null and ready_at>=preparing_at),
 'average_rating',(select round(avg(rating)::numeric,2) from public.feedback where created_at>=start_at and created_at<=now()),'rating_count',(select count(*) from public.feedback where created_at>=start_at and created_at<=now()),'unresolved_requests',(select count(*) from public.service_requests where not resolved),
 'currency_totals',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select o.currency,count(*) filter(where o.status='served') served_orders,coalesce(sum(t.cents) filter(where o.status='served'),0) served_value_cents from cohort o join totals t on t.id=o.id group by o.currency order by o.currency)x),
 'catalogue_monthly_value',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select p.currency,sum(p.monthly_price_cents::bigint) catalogue_cents,count(*) restaurants from public.restaurants r join public.plans p on p.id=r.plan_id where r.active group by p.currency order by p.currency)x),
 'daily',(select jsonb_agg(jsonb_build_object('day',d.report_day,'orders',(select count(*) from cohort o where (o.created_at at time zone 'UTC')::date=d.report_day))) from daily d),
 'statuses',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select status,count(*) count from cohort group by status)x),
 'top_restaurants',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select r.id,r.name,r.currency,count(o.id) orders,coalesce(sum(t.cents) filter(where o.status='served'),0) served_value_cents from public.restaurants r join cohort o on o.restaurant_id=r.id join totals t on t.id=o.id group by r.id,r.name,r.currency order by count(o.id) desc,r.id limit 20)x),
 'plan_distribution',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select p.id,p.name,count(r.id) restaurants from public.plans p left join public.restaurants r on r.plan_id=p.id group by p.id,p.name order by p.id)x)
 ) into report;
 return report;
end $$;
grant execute on function public.platform_analytics(int) to authenticated;

create or replace function public.place_order(p_session uuid,p_key uuid,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.table_sessions; oid uuid; entry jsonb; m public.menu_items; qty int; tname text;
begin
 if auth.uid() is null or p_key is null then raise exception 'Authentication and request key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select id into oid from public.orders where customer_id=auth.uid() and idempotency_key=p_key;
 if oid is not null then return oid; end if;
 select * into s from public.table_sessions where id=p_session and customer_id=auth.uid() and expires_at>now() for share;
 if not found then raise exception 'Table session expired; scan the table link again'; end if;
 if not public.plan_has_feature(s.restaurant_id,'guest_ordering') then raise exception 'Feature is not included in this package'; end if;
 select name into tname from public.dining_tables where id=s.table_id and active for share;
 if tname is null or not exists(select 1 from public.restaurants where id=s.restaurant_id and active) then raise exception 'Ordering is paused'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Choose between 1 and 50 items'; end if;
 insert into public.orders(restaurant_id,session_id,customer_id,table_name,idempotency_key) values(s.restaurant_id,s.id,auth.uid(),tname,p_key) returning id into oid;
 for entry in select value from jsonb_array_elements(p_items) loop
  select * into m from public.menu_items where id=(entry->>'menu_item_id')::uuid and restaurant_id=s.restaurant_id and available for share;
  if not found then raise exception 'An item is no longer available'; end if;
  qty := (entry->>'quantity')::int;
  if qty is null or qty not between 1 and 20 then raise exception 'Quantity must be between 1 and 20'; end if;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,name,price_cents,quantity,instructions) values(s.restaurant_id,oid,m.id,m.name,m.price_cents,qty,coalesce(entry->>'instructions',''));
 end loop;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(s.restaurant_id,auth.uid(),'order.placed',oid);
 return oid;
end $$;

create or replace function public.request_service(p_session uuid,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare s public.table_sessions; tname text;
begin
 select * into s from public.table_sessions where id=p_session and customer_id=auth.uid() and expires_at>now();
 if not found then raise exception 'Active table session required'; end if;
 if not public.plan_has_feature(s.restaurant_id,'service_requests') then raise exception 'Feature is not included in this package'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s.id::text,1));
 if exists(select 1 from public.service_requests where session_id=s.id and not resolved) then raise exception 'Your waiter has already been notified'; end if;
 select name into tname from public.dining_tables where id=s.table_id;
 insert into public.service_requests(restaurant_id,session_id,customer_id,table_name,message) values(s.restaurant_id,s.id,auth.uid(),tname,p_message);
end $$;

create or replace function public.submit_feedback(p_order uuid,p_rating int,p_comment text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order and customer_id=auth.uid() and status='served';
 if not found then raise exception 'Feedback requires your served order'; end if;
 if not public.plan_has_feature(o.restaurant_id,'guest_feedback') then raise exception 'Feature is not included in this package'; end if;
 insert into public.feedback(restaurant_id,order_id,customer_id,rating,comment) values(o.restaurant_id,o.id,auth.uid(),p_rating,p_comment);
end $$;

create or replace function public.save_restaurant(p_restaurant uuid,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if not public.plan_has_feature(p_restaurant,'custom_branding') then raise exception 'Feature is not included in this package'; end if;
 if nullif(p_data->>'logo_url','') is not null and p_data->>'logo_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP logo URL'; end if;
 if nullif(p_data->>'cover_url','') is not null and p_data->>'cover_url' !~ '^https?://' then raise exception 'Use an HTTPS or HTTP cover URL'; end if;
 update public.restaurants set name=p_data->>'name',brand_color=p_data->>'brand_color',address=coalesce(p_data->>'address',''),contact=coalesce(p_data->>'contact',''),opening_hours=coalesce(p_data->>'opening_hours',''),logo_url=nullif(p_data->>'logo_url',''),
 phone=coalesce(p_data->>'phone',phone),accent_color=coalesce(p_data->>'accent_color',accent_color),theme_mode=coalesce(p_data->>'theme_mode',theme_mode),font_family=coalesce(p_data->>'font_family',font_family),interface_style=coalesce(p_data->>'interface_style',interface_style),menu_layout=coalesce(p_data->>'menu_layout',menu_layout),heading_font=coalesce(p_data->>'heading_font',heading_font),density=coalesce(p_data->>'density',density),show_avatars=coalesce((p_data->>'show_avatars')::boolean,show_avatars),welcome_title=coalesce(p_data->>'welcome_title',welcome_title),welcome_message=coalesce(p_data->>'welcome_message',welcome_message),cover_url=case when p_data ? 'cover_url' then nullif(p_data->>'cover_url','') else cover_url end
 where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'restaurant.updated',p_restaurant);
end $$;
