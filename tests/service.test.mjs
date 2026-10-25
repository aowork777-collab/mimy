import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import fs from 'node:fs';
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')))sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={
 prepare(text){
  return {bind(...args){
   const s=()=>sql.prepare(text);
   return {
    async run(){s().run(...args);return{}},
    async first(){return s().get(...args)||null},
    async all(){return{results:s().all(...args)}}
   };
  }};
 },
 async batch(stmts){sql.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}
};
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const catalog='data:text/javascript;base64,'+Buffer.from(compile(fs.readFileSync('lib/catalog.ts','utf8'))).toString('base64');
globalThis.__TEST_DB=db;
let source=fs.readFileSync('app/api/service/route.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env={DB:globalThis.__TEST_DB};").replace("'../../../lib/catalog'",JSON.stringify(catalog));
const api=await import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
async function req(body,owner='alice',origin='https://test.local'){const r=new Request('https://test.local/api/service',{method:body?'POST':'GET',headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const res=await (body?api.POST(r):api.GET(r));return{status:res.status,body:await res.json()};}
test('reservation, authorization, payment and cancellation lifecycle',async()=>{
 assert.equal((await req(null,'')).status,401);
 const state=await req();const slot=state.body.slots[0];assert.ok(slot);
 const params={action:'reserve',cast:'aoi',slot,minutes:30,course:'雑談',adult:true,agree:true,price:1};
 assert.equal((await req(params,'alice','https://evil.test')).status,403);
 assert.equal((await req({...params,adult:false})).status,400);
 const reserved=await req(params);assert.equal(reserved.status,200);const id=reserved.body.id;
 assert.equal((await req(params)).status,409);
 assert.equal((await req()).body.bookings.length,1,'failed duplicate transaction rolled back');
 assert.equal((await req()).body.bookings[0].price,3000,'client amount ignored');
 assert.equal((await req({action:'pay',id},'bob')).status,404);
 assert.equal((await req(null,'bob')).body.bookings.length,0);
 assert.equal((await req({action:'message',id,role:'user',body:'before payment'})).status,409);
 assert.equal((await req({action:'pay',id})).status,200);
 assert.equal((await req({action:'pay',id})).status,200);
 assert.equal((await req()).body.events.filter(e=>e.type.includes('決済完了')).length,1);
 assert.equal((await req({action:'message',id,role:'user',body:'よろしくお願いします'})).status,200);
 assert.equal((await req({action:'message',id,role:'cast',body:'お待ちしています'})).status,200);
 assert.equal((await req({action:'report',id,body:'接続できません'})).status,200);
 assert.equal((await req()).body.messages.length,2);
 assert.equal((await req({action:'cancel',id})).status,200);
 assert.equal((await req()).body.bookings[0].payment,'test_refunded');
 assert.equal((await req({action:'pay',id})).status,409);
 const again=await req(params);assert.equal(again.status,200);
 sql.prepare('UPDATE bookings SET expires=0 WHERE id=?').run(again.body.id);
 assert.equal((await req({action:'pay',id:again.body.id})).status,409);
 assert.equal((await req(params)).status,200,'expired lock released');
 assert.equal((await req({...params,minutes:15,course:'会話練習'})).status,400);
});
