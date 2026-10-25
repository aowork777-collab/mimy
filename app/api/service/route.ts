import {env} from 'cloudflare:workers';
import {casts,plans,slotOptions,termsVersion} from '../../../lib/catalog';
export const dynamic='force-dynamic';
const json=(v:unknown,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){return handle(req);}
export async function POST(req:Request){return handle(req);}
async function handle(req:Request){
 const owner=req.headers.get('oai-authenticated-user-id');if(!owner)return json({error:'ログインが必要です'},401);
 const db=env.DB;if(!db)return json({error:'データベースが未接続です'},503);
 const now=Date.now();
 const q=(sql:string,...a:any[])=>db.prepare(sql).bind(...a);
 try{
 await db.batch([q("DELETE FROM slot_locks WHERE owner=? AND booking IN (SELECT id FROM bookings WHERE owner=? AND status='held' AND expires<?)",owner,owner,now),q("UPDATE bookings SET status='expired' WHERE owner=? AND status='held' AND expires<?",owner,now)]);
 if(req.method==='GET'){
 const [b,m,e,r]=await Promise.all([q('SELECT * FROM bookings WHERE owner=? ORDER BY created DESC',owner).all(),q('SELECT * FROM messages WHERE owner=? ORDER BY created',owner).all(),q('SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT 100',owner).all(),q('SELECT * FROM reports WHERE owner=? ORDER BY created DESC',owner).all()]);
 return json({bookings:b.results,messages:m.results,events:e.results,reports:r.results,slots:slotOptions(),mode:'sandbox'});
 }
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'不正なリクエストです'},403);
 if(Number(req.headers.get('content-length')||0)>10000)return json({error:'送信内容が長すぎます'},413);
 const raw=await req.text();if(raw.length>10000)return json({error:'送信内容が長すぎます'},413);const a=JSON.parse(raw);
 const event=(id:string,type:string)=>q('INSERT INTO events VALUES(?,?,?,?,?)',crypto.randomUUID(),owner,id,type,now);
 if(a.action==='reserve'){
 const plan=plans.find(p=>p.minutes===a.minutes);if(!plan||!casts.some(c=>c.id===a.cast)||!slotOptions().includes(a.slot)||!['雑談','会話練習'].includes(a.course)||a.adult!==true||a.agree!==true)return json({error:'日時・プラン・同意内容をご確認ください'},400);
 if(a.course==='会話練習'&&a.minutes<30)return json({error:'会話練習は30分以上を選択してください'},400);
 const count=await q("SELECT COUNT(*) AS n FROM bookings WHERE owner=? AND status='held'",owner).first<{n:number}>();if(count&&count.n>=3)return json({error:'未確定の予約を先に完了または取り消してください'},409);
 const id=crypto.randomUUID();await db.batch([q('INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,owner,a.cast,a.slot,a.course,plan.minutes,plan.price,'held','unpaid',now+600000,now,termsVersion),q('INSERT INTO slot_locks VALUES(?,?,?,?,?)',crypto.randomUUID(),owner,a.cast,a.slot,id),event(id,'予約枠を10分間仮押さえ')]);return json({id});
 }
 const b=await q('SELECT * FROM bookings WHERE id=? AND owner=?',a.id,owner).first<any>();if(!b)return json({error:'予約が見つかりません'},404);
 if(a.action==='pay'){
 if(b.status==='confirmed')return json({ok:true});if(b.status!=='held'||b.expires<=now)return json({error:'仮押さえの期限が切れています'},409);
 await db.batch([q("UPDATE bookings SET status='confirmed',payment='test_paid' WHERE id=? AND owner=? AND status='held'",b.id,owner),event(b.id,'テスト決済完了（実請求なし）')]);
 }else if(a.action==='cancel'){
 if(!['held','confirmed'].includes(b.status))return json({error:'この予約はキャンセルできません'},409);
 await db.batch([q("UPDATE bookings SET status='cancelled',payment=CASE WHEN payment='test_paid' THEN 'test_refunded' ELSE payment END WHERE id=? AND owner=? AND status IN ('held','confirmed')",b.id,owner),q('DELETE FROM slot_locks WHERE booking=? AND owner=?',b.id,owner),event(b.id,'予約取消・テスト返金処理')]);
 }else if(a.action==='message'){
 if(!['confirmed','completed'].includes(b.status))return json({error:'確定した予約でのみ送信できます'},409);
 if(typeof a.body!=='string'||!a.body.trim()||a.body.length>1000||!['user','cast'].includes(a.role))return json({error:'メッセージは1〜1000文字です'},400);
 await q('INSERT INTO messages VALUES(?,?,?,?,?,?)',crypto.randomUUID(),owner,b.id,a.role,a.body.trim(),now).run();
 }else if(a.action==='complete'){
 if(b.status!=='confirmed')return json({error:'確定した予約のみ終了できます'},409);
 await db.batch([q("UPDATE bookings SET status='completed' WHERE id=? AND owner=? AND status='confirmed'",b.id,owner),event(b.id,'テスト対応を終了')]);
 }else if(a.action==='report'){
 if(typeof a.body!=='string'||a.body.trim().length<3||a.body.length>1000)return json({error:'内容を3〜1000文字で入力してください'},400);
 await db.batch([q('INSERT INTO reports VALUES(?,?,?,?,?)',crypto.randomUUID(),owner,b.id,a.body.trim(),now),event(b.id,'通報を受け付け')]);
 }else return json({error:'未対応の操作です'},400);
 return json({ok:true});
 }catch(e){if(String(e).includes('UNIQUE'))return json({error:'この枠は予約済みです。別の日時を選択してください'},409);console.error('service request failed',e instanceof Error?e.message:'unknown');return json({error:'処理に失敗しました。再読み込みして状態を確認してください'},500);}
}
