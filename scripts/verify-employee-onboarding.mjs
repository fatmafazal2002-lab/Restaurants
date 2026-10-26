// Disposable live Auth/RPC fixtures exercise the server routes without exposing credentials.
import {createClient} from '@supabase/supabase-js';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import pg from 'pg';import {readFileSync} from 'node:fs';
process.loadEnvFile('.env.local');const origin=process.argv[2];if(!['http://127.0.0.1:3000','https://mise-restaurants.vercel.app'].includes(origin))throw new Error('Choose the explicit verification origin');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});const users=[];let rid;
const conn=new URL(readFileSync('supabase/.temp/pooler-url','utf8').trim());conn.password=process.env.SUPABASE_DB_PASSWORD;const db=new pg.Client({connectionString:conn.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('supabase/.temp/pgdelta/pgdelta-target-ca.crt','utf8')}});await db.connect();
const check=async result=>{const {data,error}=await result;if(error)throw error;return data};
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const account=async role=>{const email=`mise-employee-check-${role}-${randomUUID()}@example.com`,password=`Secure!${randomUUID()}7`;const data=await check(admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(data.user.id);const c=client();const login=await check(c.auth.signInWithPassword({email,password}));return {c,email,password,token:login.session.access_token,id:data.user.id}};
const request=async(path,token,body)=>{const response=await fetch(`${origin}/api/employees/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
try{
 const owner=await account('owner'),existing=await account('existing');rid=await check(owner.c.rpc('onboard_restaurant',{p_name:'Temporary employee onboarding check',p_slug:`verify-${randomUUID()}`,p_data:{name:'Temporary employee onboarding check',brand_color:'#356449',interface_style:'botanical',font_family:'geometric',default_language:'de'}}));
 const email=`mise-employee-check-new-${randomUUID()}@example.com`;const provision=await request('provision',owner.token,{restaurant_id:rid,email,role:'cook'});assert.equal(provision.status,200,JSON.stringify(provision.body));assert.equal(provision.body.existing,false);assert.ok(provision.body.password);
 const employee=client();const first=await check(employee.auth.signInWithPassword({email,password:provision.body.password}));users.push(first.user.id);
 assert.equal(await check(employee.rpc('has_role',{rid})),false);const setup=await check(employee.rpc('employee_setup',{}));assert.equal(setup.email,email);
 const bypass=await employee.rpc('finish_employee_setup',{p_user:first.user.id,p_id:setup.id});assert.ok(bypass.error);
 const forbidden=await request('provision',first.session.access_token,{restaurant_id:rid,email:'should-not-exist@example.com',role:'waiter'});assert.notEqual(forbidden.status,200);
 const reused=await request('complete',first.session.access_token,{name:'Test Chef',phone:'+49 000',password:provision.body.password});assert.notEqual(reused.status,200);assert.equal(await check(employee.rpc('has_role',{rid})),false);
 const changed=`Changed!${randomUUID()}9`;const completed=await request('complete',first.session.access_token,{name:'Test Chef',phone:'+49 000',password:changed});assert.equal(completed.status,200,JSON.stringify(completed.body));
 await check(employee.auth.signInWithPassword({email,password:changed}));assert.equal(await check(employee.rpc('has_role',{rid})),true);assert.equal(await check(employee.rpc('employee_setup',{})),null);
 const oldLogin=await client().auth.signInWithPassword({email,password:provision.body.password});assert.ok(oldLogin.error);
 const linked=await request('provision',owner.token,{restaurant_id:rid,email:existing.email,role:'waiter'});assert.equal(linked.status,200);assert.equal(linked.body.existing,true);assert.equal(linked.body.password,undefined);await check(existing.c.auth.signInWithPassword({email:existing.email,password:existing.password}));
 console.log('PASS: temporary credentials, mandatory password change, self-profile completion, permission gate, bypass denial, and existing-password preservation.');
}finally{
 if(rid){for(const table of ['order_items','feedback','orders','service_requests','audit_logs','table_sessions','menu_items','categories','dining_tables','employee_profiles','memberships'])await db.query(`delete from public.${table} where restaurant_id=$1`,[rid]);await db.query('delete from public.restaurants where id=$1',[rid]);}
 for(const id of users)await check(admin.auth.admin.deleteUser(id));await db.end();console.log('Employee verification fixtures removed.');
}
