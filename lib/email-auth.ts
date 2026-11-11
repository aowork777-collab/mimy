import {createClient, type Session, type User} from '@supabase/supabase-js';
export type AuthEnv = {DB?:D1Database;SUPABASE_URL?:string;SUPABASE_PUBLISHABLE_KEY?:string;LEGACY_SITES_MIGRATION?:string};
const accessName='mimy_access',refreshName='mimy_refresh';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function authClient(env:AuthEnv){
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw Error('認証サービスが未設定です');
 return createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function cookies(req:Request){const parsed=Object.fromEntries((req.headers.get('cookie')||'').split(';').map(v=>{const i=v.indexOf('=');return i<0?['','']:[v.slice(0,i).trim(),v.slice(i+1)]}));return new URL(req.url).protocol==='https:'?{[accessName]:parsed['__Host-'+accessName],[refreshName]:parsed['__Host-'+refreshName]}:parsed;}
function setCookie(res:Response,req:Request,name:string,value:string,age:number){res.headers.append('Set-Cookie',`${new URL(req.url).protocol==='https:'?'__Host-':''}${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`);}
function sessionCookies(res:Response,req:Request,session:Session|null){
 // Keep the access cookie long enough to allow server-side refresh after JWT expiry.
 setCookie(res,req,accessName,session?.access_token||'',session?2592000:0);
 setCookie(res,req,refreshName,session?.refresh_token||'',session?2592000:0);
}
export async function authenticate(req:Request,env:AuthEnv){
 const c=cookies(req);if(!c[accessName])return null;
 const client=authClient(env);let token=c[accessName];let replacement:Session|null=null;
 let {data,error}=await client.auth.getUser(token);
 if(error&&[401,403].includes(error.status||0)&&c[refreshName]){
  const refreshed=await client.auth.refreshSession({refresh_token:c[refreshName]});
  if(refreshed.error||!refreshed.data.session)return null;
  replacement=refreshed.data.session;token=replacement.access_token;
  ({data,error}=await client.auth.getUser(token));
 }
 if(error||!data.user?.email||!data.user.email_confirmed_at)return null;
 return {user:data.user,token,replacement};
}
async function memberIdentity(req:Request,env:AuthEnv,user:User){
 if(!env.DB)throw Error('データベースが未接続です');
 const db=env.DB;
 const mapped=await db.prepare('SELECT member_id FROM auth_identities WHERE auth_id=?').bind(user.id).first<{member_id:string}>();
 if(mapped)return mapped.member_id;
 // Only the platform's trusted identity AND the verified email can authorize legacy data migration.
 const oldId=req.headers.get('oai-authenticated-user-id');
 const oldEmail=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 let member='email:'+user.id;
 if(env.LEGACY_SITES_MIGRATION==='enabled'&&oldId&&oldEmail===user.email?.trim().toLowerCase()){
  const old=await db.prepare('SELECT id FROM members WHERE id=?').bind(oldId).first();
  if(old)member=oldId;
 }
 await db.prepare('INSERT OR IGNORE INTO auth_identities(auth_id,member_id,created) VALUES(?,?,?)').bind(user.id,member,Date.now()).run();
 const result=await db.prepare('SELECT member_id FROM auth_identities WHERE auth_id=?').bind(user.id).first<{member_id:string}>();
 if(!result)throw Error('この既存アカウントは別のログインに連携済みです。運営へお問い合わせください。');
 return result.member_id;
}
export async function withEmailIdentity(req:Request,env:AuthEnv,handler:(req:Request)=>Promise<Response>,publicRead=false){
 try{
  const identity=await authenticate(req,env);
  if(!identity&&env.LEGACY_SITES_MIGRATION==='enabled'&&env.DB&&!cookies(req)[accessName]){
   const legacyId=req.headers.get('oai-authenticated-user-id');
   const legacyEmail=req.headers.get('oai-authenticated-user-email');
   if(legacyId&&legacyEmail){
    const member=await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(legacyId).first();
    if(member)return handler(req);
   }
  }
  const headers=new Headers(req.headers);headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
  if(!identity&&!publicRead)return reply({error:'メールアドレスとパスワードでログインしてください'},401);
  if(identity){headers.set('oai-authenticated-user-id',await memberIdentity(req,env,identity.user));headers.set('oai-authenticated-user-email',identity.user.email!);}
  const res=await handler(new Request(req,{headers}));
  if(identity?.replacement)sessionCookies(res,req,identity.replacement);
  return res;
 }catch{return reply({error:'認証を確認できません。しばらくしてからお試しください。'},503);}
}
export async function handleAuth(req:Request,env:AuthEnv){
 if(req.method!=='POST')return reply({error:'POSTのみ利用できます'},405);
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'送信元が不正です'},403);
 const raw=await req.text();if(raw.length>8192)return reply({error:'入力が長すぎます'},413);
 let a:Record<string,unknown>;try{a=JSON.parse(raw);if(!a||typeof a!=='object')throw Error();}catch{return reply({error:'入力を確認してください'},400);}
 try{
 const client=authClient(env);
 if(a.action!=='logout'){
  if(!env.DB)return reply({error:'データベースが未接続です'},503);
  const email=typeof a.email==='string'?a.email.trim().toLowerCase():'';
  const ip=req.headers.get('cf-connecting-ip');
  const scopes=[...(email?[{key:'email:'+String(a.action)+':'+email,max:a.action==='login'?20:5}]:[]),...(ip?[{key:'ip:'+ip,max:100}]:[])];
  const bucket=Math.floor(Date.now()/600000);
  for(const scope of scopes){
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope.key))),n=>n.toString(16).padStart(2,'0')).join('');
   const hit=await env.DB.prepare('INSERT INTO auth_rate_limits(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket,count=CASE WHEN auth_rate_limits.bucket=excluded.bucket THEN auth_rate_limits.count+1 ELSE 1 END RETURNING count').bind(digest,bucket).first<{count:number}>();
   if(!hit||hit.count>scope.max)return reply({error:'試行回数が多すぎます。10分ほど待ってから再試行してください'},429);
  }
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE bucket<?').bind(bucket-144).run();
 }
 if(a.action==='logout'){
  const identity=await authenticate(req,env);
  if(identity)await client.auth.admin.signOut(identity.token,'local');
  const legacy=env.LEGACY_SITES_MIGRATION==='enabled'&&req.headers.has('oai-authenticated-user-id');
  const res=reply({ok:true,next:legacy?'/signout-with-chatgpt?return_to=%2Flogin':'/login'});sessionCookies(res,req,null);return res;
 }
 if(a.action==='password'){
  const identity=await authenticate(req,env);if(!identity)return reply({error:'再設定メールを開くか、ログインしてください'},401);
  if(typeof a.password!=='string'||a.password.length<12||a.password.length>128)return reply({error:'パスワードは12〜128文字にしてください'},400);
  // This user-scoped request never uses a service-role key.
  const r=await fetch(env.SUPABASE_URL+'/auth/v1/user',{method:'PUT',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY!,Authorization:'Bearer '+identity.token,'Content-Type':'application/json'},body:JSON.stringify({password:a.password})});
  if(!r.ok)return reply({error:'パスワードを変更できません。再設定メールからやり直してください'},400);
  await client.auth.admin.signOut(identity.token,'global');
  const res=reply({ok:true});sessionCookies(res,req,null);return res;
 }
 if(a.action==='verify'){
  if(typeof a.token_hash!=='string'||a.token_hash.length>256||!['email','recovery'].includes(String(a.type)))return reply({error:'確認リンクが正しくありません'},400);
  const {data,error}=await client.auth.verifyOtp({token_hash:a.token_hash,type:a.type as 'email'|'recovery'});
  if(error||!data.session||!data.user?.email_confirmed_at)return reply({error:'確認リンクが無効か期限切れです。もう一度メールを送信してください'},400);
  const res=reply({ok:true,next:a.type==='recovery'?'/login?mode=password':'/'});sessionCookies(res,req,data.session);return res;
 }
 const email=typeof a.email==='string'?a.email.trim():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return reply({error:'メールアドレスを確認してください'},400);
 if(a.action==='reset'){
  const {error}=await client.auth.resetPasswordForEmail(email);
  if(error)return reply({error:'メールを送信できません。時間を置いて再試行するか、運営へお問い合わせください'},error.status===429?429:400);
  return reply({message:'登録済みのメールアドレスの場合、再設定メールが届きます。迷惑メールフォルダも確認してください。'});
 }
 if(!['login','signup'].includes(String(a.action)))return reply({error:'操作が不正です'},400);
 if(typeof a.password!=='string'||a.password.length>128||a.password.length<(a.action==='signup'?12:1))return reply({error:'パスワードを確認してください（新規登録は12〜128文字）'},400);
 if(a.action==='signup'){
  const {error}=await client.auth.signUp({email,password:a.password});
  if(error)return reply({error:'登録確認メールを送信できません。時間を置いて再試行するか、運営へお問い合わせください'},error.status===429?429:400);
  return reply({message:'確認メールをご確認ください。すでに登録済みの場合はログイン、またはパスワード再設定をご利用ください。'});
 }
 const {data,error}=await client.auth.signInWithPassword({email,password:a.password});
 if(error||!data.session||!data.user.email_confirmed_at)return reply({error:'メールアドレス・パスワード、または登録確認メールの確認状況をご確認ください'},error?.status===429?429:401);
 const res=reply({ok:true});sessionCookies(res,req,data.session);return res;
 }catch{return reply({error:'認証サービスに接続できません。しばらくしてからお試しください'},503);}
}
