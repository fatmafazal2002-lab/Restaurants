// Explicit user-authorized reset. Retains Auth accounts, platform admins and catalogue.
import {readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';import pg from 'pg';import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');const ref=process.argv[2];if(ref!=='pjvgwmgpklsupkxhiysu'||process.argv[3]!=='--reset'||process.env.NEXT_PUBLIC_SUPABASE_URL!==`https://${ref}.supabase.co`)throw new Error('Exact project reference and --reset are required');
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!service)throw new Error('Server key missing');const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,service,{auth:{persistSession:false,autoRefreshToken:false}});
const url=new URL(readFileSync('supabase/.temp/pooler-url','utf8').trim());url.password=process.env.SUPABASE_DB_PASSWORD;const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('supabase/.temp/pgdelta/pgdelta-target-ca.crt','utf8')}});await db.connect();
const tables=['restaurants','memberships','employee_profiles','categories','menu_items','dining_tables','table_sessions','orders','order_items','feedback','service_requests','audit_logs'];
const dir=join('.backups',`restaurant-reset-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(dir,{recursive:true,mode:0o700});chmodSync('.backups',0o700);const snapshot={created_at:new Date().toISOString(),project:ref,tables:{},objects:[],platform_audit:[]};
try{
 await db.query('begin');await db.query(`lock table ${tables.map(t=>'public.'+t).join(',')} in access exclusive mode`);
 for(const table of tables)snapshot.tables[table]=(await db.query(`select * from public.${table}`)).rows;
 const ids=snapshot.tables.restaurants.map(r=>r.id);
 snapshot.platform_audit=(await db.query('select * from public.platform_audit where entity=any($1::text[])',[ids])).rows;
 snapshot.objects=(await db.query("select bucket_id,name from storage.objects where bucket_id in ('restaurant-media','employee-photos') and split_part(name,'/',1)=any($1::text[])",[ids])).rows;
 for(let i=0;i<snapshot.objects.length;i++){const object=snapshot.objects[i];const {data,error}=await admin.storage.from(object.bucket_id).download(object.name);if(error)throw error;const file=`media-${i}.bin`;writeFileSync(join(dir,file),Buffer.from(await data.arrayBuffer()),{mode:0o600});object.backup_file=file;}
 writeFileSync(join(dir,'snapshot.json'),JSON.stringify(snapshot,null,2),{mode:0o600});
 for(const table of ['order_items','feedback','orders','service_requests','audit_logs','table_sessions','menu_items','categories','dining_tables','employee_profiles','memberships','restaurants'])await db.query(`delete from public.${table}`);
 await db.query('delete from public.platform_audit where entity=any($1::text[])',[ids]);await db.query('commit');
 for(const bucket of ['restaurant-media','employee-photos']){const names=snapshot.objects.filter(o=>o.bucket_id===bucket).map(o=>o.name);for(let i=0;i<names.length;i+=100){const {error}=await admin.storage.from(bucket).remove(names.slice(i,i+100));if(error)throw error}}
 const counts={};for(const table of tables)counts[table]=Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
 console.log(JSON.stringify({reset:true,removed_restaurants:ids.length,remaining:counts,platform_admins:Number((await db.query('select count(*) n from public.platform_admins')).rows[0].n),backup:dir}));
}catch(e){await db.query('rollback').catch(()=>{});console.error('Reset failed; private recovery snapshot: '+dir);throw e}finally{await db.end()}
