import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const source=fs.readFileSync('lib/email-auth.ts','utf8').replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {handleAuth,withEmailIdentity}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch});
function setup(){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const env={SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'publishable-test',DB:{prepare(text){return {bind(...args){return {first:async()=>sql.prepare(text).get(...args)||null,run:async()=>sql.prepare(text).run(...args)}}}}}};
 const user={id:'user-123',email:'member@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',created_at:'2026-01-01',app_metadata:{},user_metadata:{role:'admin'}};
 const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
 const session={access_token:token,refresh_token:'refresh-secret',token_type:'bearer',expires_in:3600,user};let bad=false,used=false;
 const calls=[];
 globalThis.fetch=async(url,options={})=>{const p=new URL(url);calls.push({path:p.pathname,query:p.search,body:options.body});if(bad)return Response.json({msg:'Invalid credentials',code:'invalid_credentials'},{status:400});if(p.pathname.endsWith('/user'))return Response.json(user);if(p.pathname.endsWith('/verify')){if(used)return Response.json({msg:'expired'},{status:403});used=true;}if(p.pathname.endsWith('/signup')||p.pathname.endsWith('/recover'))return Response.json({});if(p.pathname.endsWith('/logout'))return new Response(null,{status:204});return Response.json(session)};
 const request=(a,headers={})=>new Request('https://test.chatgpt.site/api/auth',{method:'POST',headers:{origin:'https://test.chatgpt.site','Content-Type':'application/json',...headers},body:JSON.stringify(a)});
 const cookie=`__Host-mimy_access=${token}; __Host-mimy_refresh=refresh-secret`;
 return {sql,env,user,session,calls,request,cookie,setBad:()=>{bad=true}};
}
test('password login writes HttpOnly secure cookies and never returns credentials to JS',async()=>{
 const s=setup();const r=await handleAuth(s.request({action:'login',email:s.user.email,password:'long-password-123'}),s.env);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.match(r.headers.get('set-cookie'),/Secure/);
 assert.equal(s.calls[0].query,'?grant_type=password');
});
test('rejects unconfirmed email, bad credentials and cross-origin login',async()=>{
 const s=setup();delete s.user.email_confirmed_at;
 assert.equal((await handleAuth(s.request({action:'login',email:s.user.email,password:'valid'}),s.env)).status,401);
 assert.equal((await handleAuth(s.request({action:'login'},{origin:'https://evil.test'}),s.env)).status,403);
 s.setBad();assert.equal((await handleAuth(s.request({action:'login',email:s.user.email,password:'wrong'}),s.env)).status,401);
});
test('trusted platform headers alone are not a login; verified email owns stable member ID',async()=>{
 const s=setup();const handler=async r=>Response.json({id:r.headers.get('oai-authenticated-user-id'),email:r.headers.get('oai-authenticated-user-email')});
 const request=headers=>new Request('https://test.chatgpt.site/api/workspace',{headers});
 const fake={'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'owner@example.test'};
 assert.equal((await withEmailIdentity(request(fake),s.env,handler)).status,401);
 const r=await withEmailIdentity(request({...fake,cookie:s.cookie}),s.env,handler);
 assert.deepEqual(await r.json(),{id:'email:user-123',email:'member@example.test'});
 const publicResult=await withEmailIdentity(request(fake),s.env,handler,true);assert.equal((await publicResult.json()).id,null);
});
test('legacy migration requires opt-in and matching verified email; keeps blocked member intact',async()=>{
 const s=setup();s.env.LEGACY_SITES_MIGRATION='enabled';s.sql.prepare("INSERT INTO members(id,name,role,created,blocked) VALUES('old-id','old','cast',1,1)").run();
 const req=new Request('https://test.chatgpt.site/api/workspace',{headers:{cookie:s.cookie,'oai-authenticated-user-id':'old-id','oai-authenticated-user-email':s.user.email}});
 const res=await withEmailIdentity(req,s.env,async r=>Response.json({id:r.headers.get('oai-authenticated-user-id')}));
 assert.equal((await res.json()).id,'old-id');assert.equal(s.sql.prepare("SELECT blocked FROM members WHERE id='old-id'").get().blocked,1);
 assert.equal(s.sql.prepare('SELECT count(*) n FROM members').get().n,1);
});
test('email verification is single use, reset flow sets cookies, logout clears them',async()=>{
 const s=setup();let r=await handleAuth(s.request({action:'verify',token_hash:'hash',type:'recovery'}),s.env);assert.equal(r.status,200);assert.equal((await r.json()).next,'/login?mode=password');
 assert.equal((await handleAuth(s.request({action:'verify',token_hash:'hash',type:'recovery'}),s.env)).status,400);
 r=await handleAuth(s.request({action:'logout'},{cookie:s.cookie}),s.env);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('persistent email limits stop credential brute force without storing the email',async()=>{
 const s=setup();s.setBad();for(let i=0;i<20;i++)assert.equal((await handleAuth(s.request({action:'login',email:s.user.email,password:'bad'}),s.env)).status,401);
 assert.equal((await handleAuth(s.request({action:'login',email:s.user.email,password:'bad'}),s.env)).status,429);
 assert.doesNotMatch(JSON.stringify(s.sql.prepare('SELECT * FROM auth_rate_limits').all()),/member@example/);
});
test('expired access token refreshes on server and propagates replacement cookies',async()=>{
 const s=setup();const provider=globalThis.fetch;let rejected=false;
 globalThis.fetch=async(url,options)=>{if(new URL(url).pathname.endsWith('/user')&&!rejected){rejected=true;return Response.json({msg:'JWT expired'},{status:403})}return provider(url,options)};
 const r=await withEmailIdentity(new Request('https://test.chatgpt.site/api/workspace',{headers:{cookie:s.cookie}}),s.env,async()=>Response.json({ok:true}));
 assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/__Host-mimy_refresh=/);assert.ok(s.calls.some(c=>c.query==='?grant_type=refresh_token'));
});
test('password reset requires verified session and revokes refresh sessions after update',async()=>{
 const s=setup();assert.equal((await handleAuth(s.request({action:'password',password:'a-long-password'}),s.env)).status,401);
 const r=await handleAuth(s.request({action:'password',password:'a-long-password'},{cookie:s.cookie}),s.env);
 assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.ok(s.calls.some(c=>c.query==='?scope=global'));
});
