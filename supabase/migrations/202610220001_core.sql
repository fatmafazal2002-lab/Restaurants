-- All writes affecting workflow are transactional RPCs. No service key is used by clients.
create type public.staff_role as enum ('owner','admin','cook','waiter');
create type public.order_status as enum ('placed','preparing','ready','served','cancelled');
create table public.plans (id text primary key, name text not null, table_limit int not null check(table_limit>0), staff_limit int not null check(staff_limit>0), menu_limit int not null check(menu_limit>0));
insert into public.plans values ('starter','Starter',15,10,100),('growth','Growth',60,40,500);
create table public.platform_admins(user_id uuid primary key references auth.users on delete cascade);
create table public.restaurants (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100), slug text unique not null check(slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
 currency text not null default 'EUR' check(currency in ('EUR','USD','GBP')), plan_id text not null default 'starter' references public.plans,
 active boolean not null default true, brand_color text not null default '#53634b' check(brand_color ~ '^#[0-9A-Fa-f]{6}$'),
 logo_url text, address text not null default '', contact text not null default '', opening_hours text not null default '', created_at timestamptz not null default now()
);
create table public.memberships(restaurant_id uuid references public.restaurants on delete cascade, user_id uuid references auth.users on delete cascade, role public.staff_role not null, primary key(restaurant_id,user_id));
create table public.categories(id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade, name text not null check(length(name) between 1 and 80), position int not null default 0, unique(restaurant_id,id));
create table public.menu_items(
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade, category_id uuid,
 name text not null check(length(name) between 1 and 120), description text not null default '' check(length(description)<=2000),
 price_cents int not null check(price_cents between 0 and 1000000), ingredients text[] not null default '{}', allergens text[] not null default '{}',
 image_url text, video_url text, available boolean not null default true, created_at timestamptz not null default now(), unique(restaurant_id,id),
 foreign key(restaurant_id,category_id) references public.categories(restaurant_id,id)
);
create table public.dining_tables(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants on delete cascade,name text not null check(length(name) between 1 and 40),access_token uuid not null default gen_random_uuid() unique,assigned_waiter uuid,active boolean not null default true,unique(restaurant_id,id),unique(restaurant_id,name),foreign key(restaurant_id,assigned_waiter) references public.memberships(restaurant_id,user_id));
create table public.table_sessions(id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, table_id uuid not null, customer_id uuid not null references auth.users on delete cascade, expires_at timestamptz not null default now()+interval '12 hours', created_at timestamptz not null default now(), unique(restaurant_id,id), foreign key(restaurant_id,table_id) references public.dining_tables(restaurant_id,id));
create table public.orders(
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants, session_id uuid not null, customer_id uuid not null references auth.users,
 table_name text not null, status public.order_status not null default 'placed', idempotency_key uuid not null,
 created_at timestamptz not null default now(), preparing_at timestamptz, ready_at timestamptz, served_at timestamptz, updated_at timestamptz not null default now(),
 unique(customer_id,idempotency_key),unique(restaurant_id,id), foreign key(restaurant_id,session_id) references public.table_sessions(restaurant_id,id)
);
create table public.order_items(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null,order_id uuid not null,menu_item_id uuid not null,name text not null,price_cents int not null,quantity int not null check(quantity between 1 and 20),instructions text not null default '' check(length(instructions)<=500),cancelled boolean not null default false,foreign key(restaurant_id,order_id) references public.orders(restaurant_id,id),foreign key(restaurant_id,menu_item_id) references public.menu_items(restaurant_id,id));
create table public.feedback(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null,order_id uuid not null unique,customer_id uuid not null references auth.users,rating int not null check(rating between 1 and 5),comment text not null default '' check(length(comment)<=2000),created_at timestamptz not null default now(),foreign key(restaurant_id,order_id) references public.orders(restaurant_id,id));
create table public.service_requests(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null,session_id uuid not null,customer_id uuid not null references auth.users,table_name text not null,message text not null check(length(message) between 1 and 200),resolved boolean not null default false,created_at timestamptz not null default now(),foreign key(restaurant_id,session_id) references public.table_sessions(restaurant_id,id));
create table public.audit_logs(id bigint generated always as identity primary key,restaurant_id uuid not null references public.restaurants,actor_id uuid,event text not null,entity_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
create index memberships_user_idx on public.memberships(user_id);
create index sessions_customer_idx on public.table_sessions(customer_id,restaurant_id,expires_at);
create index orders_queue_idx on public.orders(restaurant_id,status,created_at);
create index orders_customer_idx on public.orders(customer_id);
create index order_items_order_idx on public.order_items(order_id);
create index requests_queue_idx on public.service_requests(restaurant_id,resolved);

create function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;
create function public.has_role(rid uuid, roles public.staff_role[] default array['owner','admin','cook','waiter']::public.staff_role[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships where restaurant_id=rid and user_id=auth.uid() and role=any(roles)) $$;
create function public.can_browse(rid uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.has_role(rid) or exists(select 1 from public.table_sessions where restaurant_id=rid and customer_id=auth.uid() and expires_at>now()) $$;
create function public.owns_order(oid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.orders where id=oid and customer_id=auth.uid()) $$;

alter table public.plans enable row level security;
alter table public.platform_admins enable row level security;
alter table public.restaurants enable row level security;
alter table public.memberships enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.dining_tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.feedback enable row level security;
alter table public.service_requests enable row level security;
alter table public.audit_logs enable row level security;
create policy plans_read on public.plans for select to authenticated using(true);
create policy platform_self on public.platform_admins for select to authenticated using(user_id=auth.uid());
create policy restaurant_read on public.restaurants for select to authenticated using(public.can_browse(id) or public.is_platform_admin());
create policy memberships_read on public.memberships for select to authenticated using(user_id=auth.uid() or public.has_role(restaurant_id,array['owner','admin']::public.staff_role[]));
create policy category_read on public.categories for select to authenticated using(public.can_browse(restaurant_id));
create policy menu_read on public.menu_items for select to authenticated using(public.can_browse(restaurant_id));
create policy tables_read on public.dining_tables for select to authenticated using(public.has_role(restaurant_id));
create policy sessions_read on public.table_sessions for select to authenticated using(customer_id=auth.uid() or public.has_role(restaurant_id));
create policy orders_read on public.orders for select to authenticated using(customer_id=auth.uid() or public.has_role(restaurant_id));
create policy items_read on public.order_items for select to authenticated using(public.owns_order(order_id) or public.has_role(restaurant_id));
create policy feedback_read on public.feedback for select to authenticated using(customer_id=auth.uid() or public.has_role(restaurant_id,array['owner','admin']::public.staff_role[]));
create policy requests_read on public.service_requests for select to authenticated using(customer_id=auth.uid() or public.has_role(restaurant_id));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_role(restaurant_id,array['owner','admin']::public.staff_role[]) or public.is_platform_admin());
-- Explicit grants: mutations are exposed only via narrowly scoped functions below.
revoke all on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to authenticated;

create function public.create_restaurant(p_name text,p_slug text) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,true) then raise exception 'A registered account is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 if exists(select 1 from public.memberships where user_id=auth.uid() and role='owner') then raise exception 'You already own a restaurant'; end if;
 insert into public.restaurants(name,slug) values(trim(p_name),lower(trim(p_slug))) returning id into rid;
 insert into public.memberships values(rid,auth.uid(),'owner');
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(rid,auth.uid(),'restaurant.created',rid);
 return rid;
end $$;

create function public.join_table(p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.dining_tables; sid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into t from public.dining_tables where access_token=p_token and active for share;
 if not found or not exists(select 1 from public.restaurants where id=t.restaurant_id and active) then raise exception 'Table link is unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||t.id::text,0));
 select id into sid from public.table_sessions where table_id=t.id and customer_id=auth.uid() and expires_at>now() order by created_at desc limit 1;
 if sid is null then insert into public.table_sessions(restaurant_id,table_id,customer_id) values(t.restaurant_id,t.id,auth.uid()) returning id into sid; end if;
 return sid;
end $$;

create function public.place_order(p_session uuid,p_key uuid,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.table_sessions; oid uuid; entry jsonb; m public.menu_items; qty int; tname text;
begin
 if auth.uid() is null or p_key is null then raise exception 'Authentication and request key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select id into oid from public.orders where customer_id=auth.uid() and idempotency_key=p_key;
 if oid is not null then return oid; end if;
 select * into s from public.table_sessions where id=p_session and customer_id=auth.uid() and expires_at>now() for share;
 if not found then raise exception 'Table session expired; scan the table link again'; end if;
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

create function public.transition_order(p_order uuid,p_expected public.order_status,p_next public.order_status) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or not public.has_role(o.restaurant_id) then raise exception 'Not authorized'; end if;
 if p_expected is null or p_next is null then raise exception 'Transition not permitted'; end if;
 if o.status<>p_expected then raise exception 'This ticket has changed; refresh the queue'; end if;
 if not ((p_expected='placed' and p_next='preparing' and public.has_role(o.restaurant_id,array['owner','admin','cook']::public.staff_role[])) or (p_expected='preparing' and p_next='ready' and public.has_role(o.restaurant_id,array['owner','admin','cook']::public.staff_role[])) or (p_expected='ready' and p_next='served' and public.has_role(o.restaurant_id,array['owner','admin','waiter']::public.staff_role[]))) then raise exception 'Transition not permitted'; end if;
 update public.orders set status=p_next,updated_at=now(),preparing_at=case when p_next='preparing' then now() else preparing_at end,ready_at=case when p_next='ready' then now() else ready_at end,served_at=case when p_next='served' then now() else served_at end where id=p_order;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id,details) values(o.restaurant_id,auth.uid(),'order.transition',p_order,jsonb_build_object('from',p_expected,'to',p_next));
end $$;

create function public.edit_order_item(p_item uuid,p_quantity int,p_instructions text,p_cancel boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; oid uuid;
begin
 select order_id into oid from public.order_items where id=p_item;
 select * into o from public.orders where id=oid for update;
 if not found or o.customer_id<>auth.uid() or auth.uid() is null then raise exception 'Not authorized'; end if;
 if o.status<>'placed' then raise exception 'Preparation has started; this ticket is locked'; end if;
 update public.order_items set quantity=p_quantity,instructions=p_instructions,cancelled=p_cancel where id=p_item;
 if not exists(select 1 from public.order_items where order_id=o.id and not cancelled) then update public.orders set status='cancelled',updated_at=now() where id=o.id; else update public.orders set updated_at=now() where id=o.id; end if;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(o.restaurant_id,auth.uid(),'item.edited',p_item);
end $$;

create function public.save_category(p_restaurant uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 insert into public.categories(restaurant_id,name) values(p_restaurant,trim(p_name)) returning id into cid; return cid;
end $$;
create function public.save_menu_item(p_restaurant uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; lim int;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 if p_id is null then
 select p.menu_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (select count(*) from public.menu_items where restaurant_id=p_restaurant)>=lim then raise exception 'Menu plan limit reached'; end if;
 insert into public.menu_items(restaurant_id,name,price_cents) values(p_restaurant,p_data->>'name',(p_data->>'price_cents')::int) returning id into mid;
 else mid:=p_id; end if;
 update public.menu_items set name=p_data->>'name',description=coalesce(p_data->>'description',''),price_cents=(p_data->>'price_cents')::int,category_id=nullif(p_data->>'category_id','')::uuid,available=coalesce((p_data->>'available')::boolean,true),image_url=nullif(p_data->>'image_url',''),video_url=nullif(p_data->>'video_url',''),ingredients=array(select jsonb_array_elements_text(coalesce(p_data->'ingredients','[]'))),allergens=array(select jsonb_array_elements_text(coalesce(p_data->'allergens','[]'))) where id=mid and restaurant_id=p_restaurant;
 if not found then raise exception 'Menu item not found'; end if;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'menu.saved',mid); return mid;
end $$;
create function public.create_table(p_restaurant uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid; lim int;
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 select p.table_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if (select count(*) from public.dining_tables where restaurant_id=p_restaurant)>=lim then raise exception 'Table plan limit reached'; end if;
 insert into public.dining_tables(restaurant_id,name) values(p_restaurant,p_name) returning id into tid; return tid;
end $$;
create function public.save_restaurant(p_restaurant uuid,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_role(p_restaurant,array['owner','admin']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 update public.restaurants set name=p_data->>'name',brand_color=p_data->>'brand_color',address=coalesce(p_data->>'address',''),contact=coalesce(p_data->>'contact',''),opening_hours=coalesce(p_data->>'opening_hours',''),logo_url=nullif(p_data->>'logo_url','') where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'restaurant.updated',p_restaurant);
end $$;
create function public.add_staff(p_restaurant uuid,p_email text,p_role public.staff_role) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; lim int;
begin
 if not public.has_role(p_restaurant,array['owner']::public.staff_role[]) or p_role='owner' then raise exception 'Only owners can assign non-owner roles'; end if;
 perform 1 from public.restaurants where id=p_restaurant for update;
 select id into uid from auth.users where lower(email)=lower(trim(p_email)) and not is_anonymous;
 if uid is null then raise exception 'Ask this employee to register first'; end if;
 if exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid and role='owner') then raise exception 'Owner role cannot be changed'; end if;
 select p.staff_limit into lim from public.plans p join public.restaurants r on r.plan_id=p.id where r.id=p_restaurant;
 if not exists(select 1 from public.memberships where restaurant_id=p_restaurant and user_id=uid) and (select count(*) from public.memberships where restaurant_id=p_restaurant)>=lim then raise exception 'Staff plan limit reached'; end if;
 insert into public.memberships values(p_restaurant,uid,p_role) on conflict(restaurant_id,user_id) do update set role=excluded.role;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id,details) values(p_restaurant,auth.uid(),'staff.assigned',uid,jsonb_build_object('role',p_role));
end $$;
create function public.submit_feedback(p_order uuid,p_rating int,p_comment text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order and customer_id=auth.uid() and status='served';
 if not found then raise exception 'Feedback requires your served order'; end if;
 insert into public.feedback(restaurant_id,order_id,customer_id,rating,comment) values(o.restaurant_id,o.id,auth.uid(),p_rating,p_comment);
end $$;
create function public.request_service(p_session uuid,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare s public.table_sessions; tname text;
begin
 select * into s from public.table_sessions where id=p_session and customer_id=auth.uid() and expires_at>now();
 if not found then raise exception 'Active table session required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s.id::text,1));
 if exists(select 1 from public.service_requests where session_id=s.id and not resolved) then raise exception 'Your waiter has already been notified'; end if;
 select name into tname from public.dining_tables where id=s.table_id;
 insert into public.service_requests(restaurant_id,session_id,customer_id,table_name,message) values(s.restaurant_id,s.id,auth.uid(),tname,p_message);
end $$;
create function public.resolve_request(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.service_requests set resolved=true where id=p_request and public.has_role(restaurant_id,array['owner','admin','waiter']::public.staff_role[]);
 if not found then raise exception 'Not authorized'; end if;
end $$;
create function public.platform_update_restaurant(p_restaurant uuid,p_plan text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
 update public.restaurants set plan_id=p_plan,active=p_active where id=p_restaurant;
 insert into public.audit_logs(restaurant_id,actor_id,event,entity_id) values(p_restaurant,auth.uid(),'platform.restaurant_updated',p_restaurant);
end $$;
-- Restrict function execution, including future functions by default.
alter default privileges in schema public revoke execute on functions from public;
revoke execute on all functions in schema public from public,anon;
grant execute on all functions in schema public to authenticated;
-- RLS is applied to Postgres Changes before delivering rows to clients.
alter publication supabase_realtime add table public.orders,public.order_items,public.service_requests,public.menu_items;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('restaurant-media','restaurant-media',true,10485760,array['image/jpeg','image/png','image/webp','video/mp4']);
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='restaurant-media' and public.has_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::public.staff_role[]));
create policy media_delete on storage.objects for delete to authenticated using(bucket_id='restaurant-media' and public.has_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::public.staff_role[]));
