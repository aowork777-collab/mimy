import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import fs from 'node:fs';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(compile(s)).toString('base64');
const catalog=url(fs.readFileSync('lib/catalog.ts','utf8'));
globalThis.__guardJobs=[];globalThis.__guardFail=false;
const guardMock=url(`export const guardConfigured=e=>!!e.CALL_GUARD_URL;export async function guardRequest(e,a,j){if(globalThis.__guardFail)throw Error('offline');globalThis.__guardJobs.push({action:a,...j});}`);
const {handleWorkspace}=await import(url(fs.readFileSync('lib/workspace-service.ts','utf8').replace("'./catalog'",JSON.stringify(catalog)).replace("'./call-guard-client'",JSON.stringify(guardMock))));
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const db={prepare(text){return{bind(...args){return{run(){const r=sql.prepare(text).run(...args);return{meta:{changes:Number(r.changes)}}},first(){return sql.prepare(text).get(...args)||null},all(){return{results:sql.prepare(text).all(...args)}}}}}},batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={DB:db,ADMIN_EMAILS:'owner@example.test',CALL_GUARD_URL:'https://guard.test'};
 async function req(who,body,origin='https://test.local',mail){const r=new Request('https://test.local/api/workspace',{method:body?'POST':'GET',headers:{...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':mail||who+'@example.test'}:{}),origin},...(body?{body:JSON.stringify(body)}:{})});const res=await handleWorkspace(r,env);return{status:res.status,body:await res.json(),headers:res.headers};}
 return{sql,req,env};
}
test('separate accounts: approval, shifts, shared inventory and private conversation',async()=>{
 const {req,sql}=setup();
 assert.equal((await req(null)).status,401);
 assert.equal((await req('owner')).body.me.role,'admin');
 assert.equal((await req('alice')).body.me.role,'user');
 assert.equal((await req('bob')).body.me.role,'user');
 assert.equal((await req('cast')).body.me.role,'user');
 assert.equal((await req('alice',{action:'profile',name:'a',role:'admin'},'https://evil.test')).status,403);
 assert.equal((await req('alice',{action:'profile',name:'Alice',role:'admin'})).status,200);
 assert.equal((await req('alice')).body.me.role,'user');
 assert.equal((await req('cast',{action:'apply',name:'葵',bio:'話し相手です'})).status,200);
 assert.equal((await req('alice')).body.casts.length,0);
 assert.equal((await req('alice')).body.applications.length,0);
 assert.equal((await req('alice',{action:'review',target:'cast',decision:'approve'})).status,403);
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;
 assert.equal((await req('cast',{action:'shiftAdd',starts:start})).status,403);
 assert.equal((await req('owner',{action:'review',target:'cast',decision:'approve'})).status,200);
 assert.equal((await req('cast')).body.me.role,'cast');
 assert.equal((await req('cast',{action:'shiftAdd',starts:start+60000})).status,400);
 assert.equal((await req('cast',{action:'shiftAdd',starts:start})).status,200);
 assert.equal((await req('cast',{action:'shiftAdd',starts:start})).status,409);
 const shift=(await req('alice')).body.shifts[0].id;
 assert.equal((await req('alice',{action:'shiftToggle',id:shift,enabled:0})).status,403);
 const reserve={action:'reserve',shiftId:shift,minutes:30,course:'雑談',adult:true,agree:true,price:1};
 assert.equal((await req('cast',reserve)).status,403);
 const result=await Promise.all([req('alice',reserve),req('bob',reserve)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409],'only one competing customer wins');
 const winner=result[0].status===200?'alice':'bob',loser=winner==='alice'?'bob':'alice';
 const id=result.find(r=>r.status===200).body.id;
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,1);
 assert.equal((await req(winner)).body.reservations[0].price,1990);
 assert.equal((await req(loser)).body.shifts.length,0);
 assert.equal((await req(loser)).body.reservations.length,0);
 assert.equal((await req('cast')).body.reservations.length,1);
 assert.equal((await req('cast',{action:'shiftToggle',id:shift,enabled:0})).status,409);
 assert.equal((await req(loser,{action:'pay',id})).status,404);
 assert.equal((await req('cast',{action:'pay',id})).status,403);
 assert.equal((await req(winner,{action:'message',id,body:'未確定'})).status,409);
 assert.equal((await req(winner,{action:'pay',id})).status,200);
 assert.equal((await req(winner,{action:'pay',id})).status,200);
 assert.equal((await req(winner,{action:'message',id,body:'こんにちは',sender:'cast'})).status,200);
 assert.equal((await req('cast',{action:'message',id,body:'よろしくお願いします'})).status,200);
 assert.equal((await req(winner)).body.messages.length,2);
 assert.equal((await req('cast')).body.messages.length,2);
 assert.equal((await req(loser)).body.messages.length,0);
 assert.equal((await req('owner')).body.messages.length,0);
 assert.equal((await req('owner',{action:'message',id,body:'管理者の割り込み'})).status,403);
 assert.equal((await req(loser,{action:'message',id,body:'侵入'})).status,404);
 assert.equal(sql.prepare('SELECT sender FROM conversation_messages WHERE body=?').get('こんにちは').sender,winner);
 assert.equal((await req('cast',{action:'complete',id})).status,409);
 assert.equal((await req('cast',{action:'cancel',id})).status,403);
 assert.equal((await req(winner,{action:'cancel',id})).status,200);
 assert.equal((await req(winner,{action:'message',id,body:'取り消し後'})).status,409);
 assert.equal((await req(loser)).body.shifts.length,1);
 assert.equal((await req(loser, reserve)).status,200);
 sql.prepare("UPDATE reservations SET expires=0 WHERE status='held'").run();
 assert.equal((await req(winner)).body.shifts.length,1);
 assert.equal((await req(winner,reserve)).status,200);
 assert.equal((await req('owner',{action:'review',target:'cast',decision:'suspend'})).status,200);
 assert.equal((await req('cast',{action:'shiftAdd',starts:start+3600000})).status,403);
 assert.equal((await req(loser)).body.casts.length,0);
});
test('shift ownership, cancellation ownership, malformed input and no automatic admin',async()=>{
 const{req}=setup();assert.equal((await req('first')).body.me.role,'user');
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;
 for(const cast of ['c1','c2']){await req(cast,{action:'apply',name:cast,bio:'紹介'});await req('owner',{action:'review',target:cast,decision:'approve'});await req(cast,{action:'shiftAdd',starts:start});}
 const s=(await req('first')).body.shifts.find(s=>s.cast_id==='c1');
 assert.equal((await req('c2',{action:'shiftToggle',id:s.id,enabled:0})).status,404);
 assert.equal((await req('c1',{action:'shiftToggle',id:s.id,enabled:0})).status,200);
 const p={action:'reserve',shiftId:s.id,minutes:30,course:'雑談',adult:true,agree:true};
 assert.equal((await req('first',p)).status,409);
 await req('c1',{action:'shiftToggle',id:s.id,enabled:1});
 const id=(await req('first',p)).body.id;
 assert.equal((await req('c2',{action:'cancel',id})).status,404);
 assert.equal((await req('first',{action:'pay',id})).status,200);
 assert.equal((await req('first',{action:'message',id,body:'x'.repeat(1001)})).status,400);
 assert.equal((await req('first',{action:'review',target:'first',decision:'approve'})).status,403);
});
const calls=[];
globalThis.__voiceCalls=calls;
const fakeSdk=url(`export class RoomServiceClient{async createRoom(o){globalThis.__voiceCalls.push(o)}async deleteRoom(n){globalThis.__voiceCalls.push({deleted:n})}}export class AccessToken{constructor(k,s,o){this.options=o}addGrant(g){this.grant=g}async toJwt(){return JSON.stringify({options:this.options,grant:this.grant})}}export const TrackSource={MICROPHONE:2,CAMERA:1};`);
const {handleCall}=await import(url(fs.readFileSync('lib/call-service.ts','utf8').replace("'livekit-server-sdk'",JSON.stringify(fakeSdk)).replace("'./call-guard-client'",JSON.stringify(guardMock))));
test('voice: fail closed, participant authorization, time limits and camera and microphone grants without screen sharing',async()=>{
 const {sql,req,env}=setup();
 await req('alice');await req('bob');await req('cast',{action:'apply',name:'葵',bio:'紹介'});await req('owner',{action:'review',target:'cast',decision:'approve'});
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;
 await req('cast',{action:'shiftAdd',starts:start});const shift=(await req('alice')).body.shifts[0].id;
 const id=(await req('alice',{action:'reserve',shiftId:shift,minutes:30,course:'雑談',adult:true,agree:true})).body.id;
 const call=async(who,action='join',origin='https://test.local')=>{const r=await handleCall(new Request('https://test.local/api/call',{method:'POST',headers:{origin,...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'}:{})},body:JSON.stringify({id,action})}),env);return{status:r.status,body:await r.json()};};
 assert.equal((await call(null)).status,401);assert.equal((await call('alice','join','https://evil.test')).status,403);
 assert.equal((await call('alice')).status,503);assert.equal((await call('bob')).status,404);assert.equal((await call('owner')).status,404);
 Object.assign(env,{LIVEKIT_URL:'wss://test.livekit.cloud',LIVEKIT_API_KEY:'test',LIVEKIT_API_SECRET:'test',LIVEKIT_FREE_PLAN:'build'});
 assert.equal((await call('alice')).status,409);await req('alice',{action:'pay',id});assert.equal((await call('alice')).status,409);
 sql.prepare('UPDATE shifts SET starts=? WHERE id=?').run(Date.now()-60000,shift);
 for(const who of ['alice','cast']){const result=await call(who);assert.equal(result.status,200);const token=JSON.parse(result.body.token);assert.equal(token.options.identity,who);assert.ok(token.options.ttl<=60);assert.deepEqual(token.grant.canPublishSources,[2,1]);assert.equal(token.grant.canPublishData,false);assert.equal(token.grant.room,'reservation-'+id);}
 assert.equal(calls.filter(c=>c.name).at(-1).maxParticipants,2);
 assert.equal((await call('alice','check')).status,200);
 await req('owner',{action:'review',target:'cast',decision:'suspend'});assert.equal((await call('alice')).status,409);
 await req('owner',{action:'review',target:'cast',decision:'approve'});
 sql.prepare('UPDATE shifts SET starts=? WHERE id=?').run(Date.now()-31*60000,shift);assert.equal((await call('cast')).status,409);assert.equal(calls.at(-1).deleted,'reservation-'+id);
 sql.prepare('UPDATE shifts SET starts=? WHERE id=?').run(Date.now()-60000,shift);
 await req('alice',{action:'cancel',id});assert.equal((await call('alice')).status,409);
 env.LIVEKIT_FREE_PLAN='ship';assert.equal((await call('alice')).status,503);
});
test('expanded cast profiles: persist, validate and restrict editing to approved owner',async()=>{
 const {req}=setup();await req('cast',{action:'apply',name:'葵',bio:'紹介'});
 const edit={action:'castProfile',name:'葵',bio:'更新',headline:'こんにちは',photo_url:'https://example.com/photo.jpg',topics:'映画、音楽',hobbies:'読書',style:'ゆっくり'};
 assert.equal((await req('cast',edit)).status,403);
 await req('owner',{action:'review',target:'cast',decision:'approve'});
 assert.equal((await req('alice',edit)).status,403);
 assert.equal((await req('cast',{...edit,photo_url:'javascript:alert(1)'})).status,400);
 assert.equal((await req('cast',{...edit,headline:'a'.repeat(61)})).status,400);
 assert.equal((await req('cast',edit)).status,200);
 const cast=(await req('alice')).body.casts[0];for(const key of ['headline','photo_url','topics','hobbies','style'])assert.equal(cast[key],edit[key]);
 assert.equal((await req('cast',{action:'castProfile',name:'葵',bio:'再更新'})).status,200);
 assert.equal((await req('alice')).body.casts[0].topics,'映画、音楽');
 await req('owner',{action:'review',target:'cast',decision:'suspend'});
 assert.equal((await req('alice')).body.casts.length,0);assert.equal((await req('cast',edit)).status,403);
});
test('admin invites bind email, expire, revoke and accept only once',async()=>{
 const{req,sql}=setup();
 assert.equal((await req('alice',{action:'adminInviteCreate',email:'bob@example.test'})).status,403);
 const make=async(email)=>{const r=await req('owner',{action:'adminInviteCreate',email});assert.equal(r.status,200);return r.body.url.split('#')[1]};
 const token=await make('alice@example.test');
 assert.equal((await req('bob',{action:'adminInviteAccept',token})).status,409);
 assert.equal((await req('alice',{action:'adminInviteAccept',token})).status,200);
 assert.equal((await req('alice')).body.me.role,'admin');
 assert.equal((await req('alice',{action:'adminInviteAccept',token})).status,409);
 assert.equal((await req('alice',{action:'adminInviteCreate',email:'next@example.test'})).status,200);
 const expired=await make('bob@example.test');sql.prepare('UPDATE admin_invites SET expires=0 WHERE email=?').run('bob@example.test');
 assert.equal((await req('bob',{action:'adminInviteAccept',token:expired})).status,409);
 const revoked=await make('charlie@example.test');const invite=sql.prepare('SELECT id FROM admin_invites WHERE email=?').get('charlie@example.test');
 assert.equal((await req('owner',{action:'adminInviteRevoke',id:invite.id})).status,200);
 assert.equal((await req('charlie',{action:'adminInviteAccept',token:revoked})).status,409);
 assert.equal((await req('bob')).body.adminInvites.length,0);
 assert.equal(JSON.stringify((await req('owner')).body.adminInvites).includes(token),false);
});
const photoSanitizer=url(fs.readFileSync('lib/photo-sanitizer.ts','utf8'));
const {sanitizePhoto}=await import(photoSanitizer);
const {handlePhoto}=await import(url(fs.readFileSync('lib/photo-service.ts','utf8').replace("'./photo-sanitizer'",JSON.stringify(photoSanitizer))));
const photos=JSON.parse(fs.readFileSync('tests/fixtures/photos.json','utf8'));
const fixture=format=>Buffer.from(photos[format],'base64');
test('photo upload belongs to approved actor, validates format and persists through profile edits',async()=>{
 const{req,env}=setup();const files=new Map();env.BUCKET={async put(k,bytes,o){files.set(k,{body:bytes,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})},async get(k){return files.get(k)||null}};
 await req('cast',{action:'apply',name:'葵',bio:'紹介'});await req('alice');
 const png=fixture('png');
 const upload=(who,bytes=png,origin='https://test.local')=>handlePhoto(new Request('https://test.local/api/cast-photo',{method:'POST',headers:{origin,'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'},body:bytes}),env);
 assert.equal((await upload('cast')).status,403);await req('owner',{action:'review',target:'cast',decision:'approve'});
 assert.equal((await upload('alice')).status,403);assert.equal((await upload('cast',png,'https://evil.test')).status,403);
 assert.equal((await upload('cast',new TextEncoder().encode('<svg/>'))).status,400);
 assert.equal((await upload('cast',new Uint8Array(3*1024*1024+1))).status,413);
 const result=await upload('cast');assert.equal(result.status,200);const photo=(await result.json()).url;assert.ok(photo.startsWith('/api/cast-photo?id=cast&v='));
 await req('cast',{action:'castProfile',name:'葵',bio:'更新'});assert.equal((await req('alice')).body.casts[0].photo_url,photo);
 assert.equal((await handlePhoto(new Request('https://test.local'+photo),env)).status,200);
 await req('owner',{action:'review',target:'cast',decision:'suspend'});assert.equal((await handlePhoto(new Request('https://test.local'+photo),env)).status,404);
});
test('account save returns the persisted actor profile without editing another member',async()=>{
 const{req}=setup();await req('bob',{action:'profile',name:'Bob'});const r=await req('alice',{action:'profile',name:'Alice',id:'bob'});
 assert.equal(r.body.me.name,'Alice');assert.equal(r.body.me.id,'alice');assert.equal((await req('alice')).body.me.name,'Alice');assert.equal((await req('bob')).body.me.name,'Bob');
});

test('message quota is per actor across reservations, atomic under concurrency and expires',async()=>{
 const{req,sql}=setup();await req('alice');await req('bob');await req('cast',{action:'apply',name:'C',bio:'intro'});await req('owner',{action:'review',target:'cast',decision:'approve'});
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;
 for(let i=0;i<2;i++)await req('cast',{action:'shiftAdd',starts:start+i*3600000});
 const slots=(await req('alice')).body.shifts;const ids=[];
 for(const slot of slots){const id=(await req('alice',{action:'reserve',shiftId:slot.id,minutes:30,course:'雑談',adult:true,agree:true})).body.id;await req('alice',{action:'pay',id});ids.push(id);}
 const responses=await Promise.all(Array.from({length:30},(_,i)=>req('alice',{action:'message',id:ids[i%2],body:'hello '+i})));
 assert.equal(responses.filter(r=>r.status===200).length,20);assert.equal(responses.filter(r=>r.status===429).length,10);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM conversation_messages WHERE sender='alice'").get().n,20);
 const limited=responses.find(r=>r.status===429);assert.ok(limited.body.retryAfter>=1&&limited.body.retryAfter<=60);assert.equal(limited.headers.get('Retry-After'),String(limited.body.retryAfter));
 assert.equal((await req('cast',{action:'message',id:ids[0],body:'other actor unaffected'})).status,200);
 assert.equal((await req('bob',{action:'message',id:ids[0],body:'outsider'})).status,404);
 sql.prepare("UPDATE conversation_messages SET created=? WHERE sender='alice'").run(Date.now()-60001);
 assert.equal((await req('alice',{action:'message',id:ids[0],body:'window renewed'})).status,200);
 await req('alice',{action:'cancel',id:ids[0]});assert.equal((await req('alice',{action:'message',id:ids[0],body:'cancelled'})).status,409);
});

test('JPEG PNG WebP metadata and trailing content removed, output remains idempotent',()=>{
 for(const format of ['jpeg','png','webp']){
  const input=fixture(format),bytes=Buffer.concat([input,Buffer.from('TRAILING_PRIVATE_DATA')]);
  assert.ok(input.includes(Buffer.from('PRIVATE_')));
  const clean=sanitizePhoto(bytes);assert.equal(clean.type,'image/'+format);assert.ok(clean.bytes.length<input.length);
  assert.equal(Buffer.from(clean.bytes).includes(Buffer.from('PRIVATE_')),false);
  assert.equal(Buffer.from(clean.bytes).includes(Buffer.from('TRAILING_PRIVATE_DATA')),false);
  assert.deepEqual(sanitizePhoto(clean.bytes).bytes,clean.bytes);
 }
});

test('truncated/forged images and corrupt PNG chunks fail closed',()=>{
 const fake=new Uint8Array(24);fake.set([137,80,78,71,13,10,26,10]);assert.throws(()=>sanitizePhoto(fake));
 for(const format of ['jpeg','png','webp'])for(const n of [0,5,15,fixture(format).length-5])assert.throws(()=>sanitizePhoto(fixture(format).subarray(0,n)));
 const corrupt=Buffer.from(fixture('png'));corrupt[24]^=1;assert.throws(()=>sanitizePhoto(corrupt));
});

test('legacy stored photos are sanitized before serving and replaced conditionally',async()=>{
 const{req,env}=setup();await req('cast',{action:'apply',name:'C',bio:'intro'});await req('owner',{action:'review',target:'cast',decision:'approve'});
 let stored=fixture('jpeg'),metadata={},putOptions;env.BUCKET={async get(){return{etag:'old-photo',customMetadata:metadata,arrayBuffer:async()=>stored.buffer.slice(stored.byteOffset,stored.byteOffset+stored.byteLength)}},async put(k,bytes,o){putOptions=o;stored=Buffer.from(bytes);metadata=o.customMetadata}};
 const response=await handlePhoto(new Request('https://test.local/api/cast-photo?id=cast'),env);
 assert.equal(response.status,200);assert.equal(Buffer.from(await response.arrayBuffer()).includes(Buffer.from('PRIVATE_')),false);
 assert.deepEqual(putOptions.onlyIf,{etagMatches:'old-photo'});assert.equal(metadata.privacyVersion,'1');assert.equal(stored.includes(Buffer.from('PRIVATE_')),false);
});

test('transparent, progressive and animated photo containers remain supported',()=>{
 for(const format of ['png_alpha','webp_alpha','jpeg_progressive','png_animated','webp_animated']){
  const clean=sanitizePhoto(fixture(format));assert.ok(clean.bytes.length>0);assert.deepEqual(sanitizePhoto(clean.bytes).bytes,clean.bytes);
 }
});

test('moderation: admin-only blocking stops APIs, hides cast, cancels reservations and can be lifted',async()=>{
 const{req,sql,env}=setup();await req('alice');await req('bob');await req('cast',{action:'apply',name:'C',bio:'intro'});await req('owner',{action:'review',target:'cast',decision:'approve'});
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;await req('cast',{action:'shiftAdd',starts:start});const shift=(await req('alice')).body.shifts[0].id;
 const id=(await req('alice',{action:'reserve',shiftId:shift,minutes:30,course:'雑談',adult:true,agree:true})).body.id;await req('alice',{action:'pay',id});sql.prepare('UPDATE shifts SET starts=? WHERE id=?').run(Date.now()-1000,shift);
 const block={action:'memberBlock',target:'alice',blocked:true,reason:'test violation'};
 assert.equal((await req('bob',block)).status,403);assert.equal((await req('owner',{...block,target:'owner'})).status,400);
 assert.equal((await req('owner',block)).status,200);assert.equal((await req('alice')).status,403);assert.equal((await req('alice',{action:'profile',name:'bypass'})).status,403);
 assert.equal(sql.prepare('SELECT status FROM reservations WHERE id=?').get(id).status,'cancelled');assert.ok(globalThis.__guardJobs.some(j=>j.action==='close'&&j.id===id));
 assert.equal((await req('bob')).body.members.length,0);assert.ok((await req('owner')).body.members.some(m=>m.id==='alice'&&m.blocked===1));
 assert.equal((await req('owner',{...block,blocked:false,reason:''})).status,200);assert.equal((await req('alice')).status,200);
 assert.equal(sql.prepare('SELECT status FROM reservations WHERE id=?').get(id).status,'cancelled');
 await req('owner',{...block,target:'cast'});assert.equal((await req('bob')).body.casts.length,0);
 env.BUCKET={get:async()=>{throw Error('must not read')}};assert.equal((await handlePhoto(new Request('https://test.local/api/cast-photo?id=cast'),env)).status,404);
 const r=await handleCall(new Request('https://test.local/api/call',{method:'POST',headers:{origin:'https://test.local','oai-authenticated-user-id':'cast','oai-authenticated-user-email':'cast@example.test'},body:JSON.stringify({id,action:'join'})}),env);assert.equal(r.status,403);
});

test('guard registration is required before joining; unavailable scheduler fails closed',async()=>{
 const{req,sql,env}=setup();await req('cast',{action:'apply',name:'C',bio:'intro'});await req('owner',{action:'review',target:'cast',decision:'approve'});
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;await req('cast',{action:'shiftAdd',starts:start});const shift=(await req('alice')).body.shifts[0].id;const id=(await req('alice',{action:'reserve',shiftId:shift,minutes:30,course:'雑談',agree:true})).body.id;await req('alice',{action:'pay',id});sql.prepare('UPDATE shifts SET starts=? WHERE id=?').run(Date.now()-1000,shift);
 Object.assign(env,{LIVEKIT_URL:'wss://test.livekit.cloud',LIVEKIT_API_KEY:'test',LIVEKIT_API_SECRET:'test',LIVEKIT_FREE_PLAN:'build'});
 const call=()=>handleCall(new Request('https://test.local/api/call',{method:'POST',headers:{origin:'https://test.local','oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'},body:JSON.stringify({id,action:'join'})}),env);
 delete env.CALL_GUARD_URL;assert.equal((await call()).status,503);env.CALL_GUARD_URL='https://guard.test';
 globalThis.__guardFail=true;const before=calls.length;try{assert.equal((await call()).status,503);assert.equal(calls.length,before);}finally{globalThis.__guardFail=false;}
 assert.equal((await call()).status,200);assert.ok(globalThis.__guardJobs.some(j=>j.action==='schedule'&&j.id===id&&j.participants.includes('alice')));
});

test('pricing tiers: administrator-only changes, four prices and frozen reservation amounts',async()=>{
 const {req}=setup();
 await req('cast',{action:'apply',name:'料金テスト',bio:'テスト'});
 await req('owner',{action:'review',target:'cast',decision:'approve'});
 assert.equal((await req('cast',{action:'pricingTier',target:'cast',tier:'popular'})).status,403);
 assert.equal((await req('owner',{action:'pricingTier',target:'cast',tier:'premium'})).status,400);
 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;
 for(const [index,tier,minutes,price] of [[0,'new',30,1990],[1,'new',60,3980],[2,'popular',30,2990],[3,'popular',60,5980]]){
  await req('owner',{action:'pricingTier',target:'cast',tier});
  await req('cast',{action:'shiftAdd',starts:start+index*3600000});
  const shift=(await req('alice')).body.shifts.find(s=>s.starts===start+index*3600000);
  const input={action:'reserve',shiftId:shift.id,minutes,course:'雑談',agree:true};
  assert.equal((await req('alice',{...input,quotedPrice:1})).status,409);
  const result=await req('alice',{...input,quotedPrice:price});
  assert.equal(result.status,200);
  await req('owner',{action:'pricingTier',target:'cast',tier:tier==='new'?'popular':'new'});
  assert.equal((await req('alice')).body.reservations.find(r=>r.id===result.body.id).price,price);
  assert.equal((await req('alice',{action:'pay',id:result.body.id})).status,200);
 }
});

test('member details are admin-only and keep past purchases after cancellation',async()=>{
 const {req,env,sql}=setup();
 await req('alice');
 await req('cast',{action:'apply',name:'葵',bio:'紹介'});
 await req('owner',{action:'review',target:'cast',decision:'approve'});
 await req('bob');
 sql.prepare('INSERT INTO auth_identities(auth_id,member_id,created,verified_email) VALUES(?,?,?,?)')
  .run('alice-auth','alice',Date.now(),'registered@example.test');

 const start=Math.ceil((Date.now()+86400000)/3600000)*3600000;
 for(let i=0;i<4;i++)await req('cast',{action:'shiftAdd',starts:start+i*3600000});
 const {body:{shifts}}=await req('alice');
 const reserve=async(who,shift)=> (await req(who,{
  action:'reserve',shiftId:shift.id,minutes:30,course:'雑談',agree:true,
 })).body.id;
 const purchased=await reserve('alice',shifts[0]);
 assert.equal((await req('alice',{action:'pay',id:purchased})).status,200);
 assert.equal((await req('alice',{action:'cancel',id:purchased})).status,200);
 const historical=await reserve('alice',shifts[1]);
 const historicalDate=Date.now()-60_000;
 sql.prepare("UPDATE reservations SET status='cancelled' WHERE id=?").run(historical);
 sql.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?)')
  .run('past-payment','alice',historical,'テスト決済で確定（実請求なし）',historicalDate);
 const held=await reserve('alice',shifts[2]);
 const unrelated=await reserve('bob',shifts[3]);

 async function details(who,target,kind='reservations',page=0){
  const params=new URLSearchParams({memberId:target,history:kind,historyPage:String(page)});
  const response=await handleWorkspace(new Request('https://test.local/api/workspace?'+params),env,
   who?{id:who,email:who+'@example.test'}:null);
  return {status:response.status,headers:response.headers,body:await response.json()};
 }
 for(const who of ['alice','cast','bob'])assert.equal((await details(who,'alice')).status,403);
 assert.equal((await details(null,'alice')).status,401);
 assert.equal((await details('owner','missing')).status,404);
 assert.equal((await details('owner','alice','purchases',-1)).status,400);
 const result=await details('owner','alice');
 assert.equal(result.status,200);
 assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(result.body.member.email,'registered@example.test');
 assert.equal((await details('owner','bob')).body.member.email,null);
 assert.deepEqual(new Set(result.body.entries.map(r=>r.id)),new Set([purchased,historical,held]));
 assert.equal(result.body.entries.find(r=>r.id===held).status,'held');
 assert.equal(result.body.entries.some(r=>r.id===unrelated),false);
 assert.ok((await details('owner','cast')).body.entries.every(r=>r.participation==='cast'));
 const purchases=(await details('owner','alice','purchases')).body.entries;
 assert.deepEqual(purchases.map(r=>r.id),[purchased,historical]);
 assert.ok(purchases.every(r=>r.status==='cancelled'&&r.price===1990&&r.paid_at>0));
 assert.equal(purchases[1].paid_at,historicalDate);
 assert.deepEqual((await details('owner','cast','purchases')).body.entries,[]);
 assert.doesNotMatch(JSON.stringify((await req('owner')).body),/registered@example\.test/);
});

test('optional guest profiles stay private, role groups filter, and diary ownership is enforced',async()=>{
 const {req,env}=setup();
 await req('alice');await req('bob');
 await req('cast',{action:'apply',name:'葵',bio:'紹介'});
 await req('owner',{action:'review',target:'cast',decision:'approve'});
 const get=async(who,params)=>{
  const response=await handleWorkspace(new Request('https://test.local/api/workspace?'+new URLSearchParams(params)),env,{id:who,email:who+'@example.test'});
  return {status:response.status,body:await response.json()};
 };
 assert.equal((await req('alice',{action:'guestProfile'})).status,200);
 assert.equal((await req('alice',{action:'guestProfile',bio:'自己紹介',topics:'映画',style:'静かに'})).status,200);
 assert.equal((await req('alice')).body.guestProfile.bio,'自己紹介');
 assert.equal((await req('bob')).body.guestProfile,null);
 assert.equal((await req('cast',{action:'guestProfile',bio:'x'})).status,403);
 assert.equal((await req('alice',{action:'guestProfile',bio:'x'.repeat(501)})).status,400);
 for(const role of ['user','cast','admin']){
  const data=(await get('owner',{memberRole:role})).body;
  assert.ok(data.members.length>0);
  assert.ok(data.members.every(m=>role==='admin'?m.admin_protected:!m.admin_protected&&m.role===role));
  assert.equal(data.memberTotal,data.members.length);
 }
 assert.equal((await req('alice',{action:'diarySave',title:'test',body:'test'})).status,403);
 assert.equal((await req('cast',{action:'diarySave',title:'日記',body:'本文'})).status,200);
 let post=(await get('alice',{diaryCast:'cast'})).body.posts[0];
 assert.equal(post.title,'日記');
 await req('othercast',{action:'apply',name:'別キャスト',bio:'紹介'});
 await req('owner',{action:'review',target:'othercast',decision:'approve'});
 assert.equal((await req('othercast',{action:'diarySave',id:post.id,title:'改変',body:'改変'})).status,404);
 assert.equal((await req('othercast',{action:'diaryDelete',id:post.id})).status,404);
 assert.equal((await req('cast',{action:'diarySave',id:post.id,title:'更新',body:'更新本文'})).status,200);
 assert.equal((await get('alice',{diaryCast:'cast'})).body.posts[0].title,'更新');
 await req('owner',{action:'review',target:'cast',decision:'suspend'});
 assert.equal((await get('alice',{diaryCast:'cast'})).status,404);
 await req('owner',{action:'review',target:'cast',decision:'approve'});
 assert.equal((await req('cast',{action:'diaryDelete',id:post.id})).status,200);
 assert.deepEqual((await get('alice',{diaryCast:'cast'})).body.posts,[]);
});
