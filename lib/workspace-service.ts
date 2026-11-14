import type {MemberIdentity} from './email-auth';
import {guardRequest,guardConfigured} from './call-guard-client';
import {plans,priceFor} from './catalog';
import {checkoutWindowMinutes,expireStripeCheckout,PaymentFailure,startStripeCheckout,stripeTestEnabled,stripeTestReady,type StripeEnv} from './stripe-payment';
type Environment=StripeEnv&{CALL_GUARD_URL?:string;CALL_GUARD_SECRET?:string;DB?:D1Database;ADMIN_EMAILS?:string;LIVEKIT_URL?:string;LIVEKIT_API_KEY?:string;LIVEKIT_API_SECRET?:string;LIVEKIT_FREE_PLAN?:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
class Failure extends Error{constructor(public status:number,message:string){super(message);}}
const requireThat=(ok:unknown,status:number,message:string)=>{if(!ok)throw new Failure(status,message);};
const text=(s:unknown,max:number)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max;
const testPaymentEvent='テスト決済で確定（実請求なし）';
const historyPageSize=20;

async function memberHistory(db:D1Database,params:URLSearchParams,now:number){
 const memberId=params.get('memberId');
 const history=params.get('history') ?? 'reservations';
 const page=Number(params.get('historyPage') ?? '0');
 requireThat(text(memberId,200)&&Number.isSafeInteger(page)&&page>=0&&page<=100000,400,'アカウントと履歴のページを確認してください');
 requireThat(history==='reservations'||history==='purchases',400,'履歴の種類が不正です');
 const member=await db.prepare(
  `SELECT m.id,m.name,i.verified_email AS email
   FROM members m LEFT JOIN auth_identities i ON i.member_id=m.id
   WHERE m.id=?`,
 ).bind(memberId).first();
 requireThat(member,404,'アカウントがありません');

 const offset=page*historyPageSize;
 const query=history==='purchases'
  ? db.prepare(`
    WITH purchases AS (
     SELECT r.id,r.course,r.minutes,r.price,r.status,p.name AS cast_name,r.payment_provider,
      COALESCE(r.stripe_paid_at,r.test_paid_at,(
       SELECT MIN(a.created) FROM audit_events a
       WHERE a.target=r.id AND a.actor=r.customer AND a.action=?
      )) AS paid_at
     FROM reservations r JOIN cast_profiles p ON p.id=r.cast_id
     WHERE r.customer=?
    )
    SELECT * FROM purchases
    WHERE paid_at IS NOT NULL OR (payment_provider='demo' AND status IN ('confirmed','completed'))
    ORDER BY paid_at DESC,id DESC LIMIT ? OFFSET ?
   `).bind(testPaymentEvent,memberId,historyPageSize+1,offset)
  : db.prepare(`
    SELECT r.id,r.created,s.starts,p.name AS cast_name,m.name AS customer_name,
     r.course,r.minutes,r.price,CASE
      WHEN r.status='held' AND r.stripe_session_id IS NULL AND r.expires<=? THEN 'expired' ELSE r.status END AS status,
     CASE WHEN r.customer=? THEN 'customer' ELSE 'cast' END AS participation
    FROM reservations r
    JOIN shifts s ON s.id=r.shift_id
    JOIN cast_profiles p ON p.id=r.cast_id
    JOIN members m ON m.id=r.customer
    WHERE r.customer=? OR r.cast_id=?
    ORDER BY r.created DESC,r.id DESC LIMIT ? OFFSET ?
   `).bind(now,memberId,memberId,memberId,historyPageSize+1,offset);
 const {results}=await query.all();
 return json({member,entries:results.slice(0,historyPageSize),hasNext:results.length>historyPageSize});
}
export async function handleWorkspace(req:Request,env:Environment,identity:MemberIdentity|null={
 id:req.headers.get('oai-authenticated-user-id')||'',
 email:req.headers.get('oai-authenticated-user-email')||'',
}){
 try{
 const id=identity?.id,email=identity?.email;
 requireThat(id&&email,401,'ログインが必要です');const actor=id!;
 if(req.method==='POST')requireThat(req.headers.get('origin')===new URL(req.url).origin,403,'送信元が不正です');
 requireThat(env.DB,503,'データベースが未接続です');const db=env.DB!;const now=Date.now();
 const stripeEnabled=stripeTestEnabled(env);
 const minStart=now+(stripeEnabled?checkoutWindowMinutes+10:15)*60000;
 const q=(s:string,...v:(string|number|null)[])=>db.prepare(s).bind(...v);
 const rows=async(s:string,...v:(string|number|null)[])=>(await q(s,...v).all()).results;
 await q("INSERT OR IGNORE INTO members(id,name,role,created) VALUES(?,?,'user',?)",actor,'ゲスト',now).run();
 const me=await q('SELECT * FROM members WHERE id=?',actor).first<{id:string;name:string;role:string;blocked:number}>();
 const invitedAdmin=await q('SELECT id FROM admin_invites WHERE accepted_by=? AND email=? AND revoked=0',actor,email!.trim().toLowerCase()).first();
 const admin=!!invitedAdmin||(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(email!.trim().toLowerCase());
 const role=admin?'admin':me!.role;
 requireThat(!me!.blocked,403,'このアカウントは運営により利用停止されています。');
 if(admin)await q('UPDATE members SET admin_protected=1 WHERE id=? AND admin_protected=0',actor).run();
 const params=new URL(req.url).searchParams;
 if(req.method==='GET'&&params.has('memberId')){
  requireThat(admin,403,'管理者のみアカウントの詳細を確認できます');
  return await memberHistory(db,params,now);
 }
 if(req.method==='GET'&&params.has('fans')){
  requireThat(role==='cast',403,'キャストのみ確認できます');
  const page=Number(params.get('page')||0);
  requireThat(Number.isSafeInteger(page)&&page>=0&&page<=100000,400,'ページが不正です');
  const fans=await rows('SELECT m.name FROM cast_favorites f JOIN members m ON m.id=f.member_id WHERE f.cast_id=? AND m.blocked=0 ORDER BY f.created DESC,f.member_id LIMIT 51 OFFSET ?',actor,page*50);
  const count=await q('SELECT COUNT(*) n FROM cast_favorites f JOIN members m ON m.id=f.member_id WHERE f.cast_id=? AND m.blocked=0',actor).first<{n:number}>();
  return json({names:fans.slice(0,50).map(f=>f.name),count:count!.n,hasNext:fans.length>50});
 }
 if(req.method==='GET'&&params.has('diaryCast')){
  const castId=params.get('diaryCast')||'';
  const page=Number(params.get('page')||0);
  requireThat(Number.isSafeInteger(page)&&page>=0&&page<=100000,400,'ページが不正です');
  const visible=await q("SELECT p.id FROM cast_profiles p JOIN members m ON m.id=p.id WHERE p.id=? AND p.status='approved' AND m.blocked=0",castId).first();
  requireThat(visible,404,'キャストが見つかりません');
  const favorite=await q('SELECT 1 FROM cast_favorites WHERE member_id=? AND cast_id=?',actor,castId).first();
  const allowed=actor===castId||!!favorite;
  const posts=await rows("SELECT id,title,body,created,updated,visibility,photo_id FROM cast_posts WHERE cast_id=? AND (visibility='public' OR ?=1) ORDER BY created DESC,id DESC LIMIT 11 OFFSET ?",castId,allowed?1:0,page*10);
  return json({posts:posts.slice(0,10),hasNext:posts.length>10,exclusiveLocked:!allowed});
 }
 const audit=(target:string,action:string)=>q('INSERT INTO audit_events VALUES(?,?,?,?,?)',crypto.randomUUID(),actor,target,action,now);
 // Expiry is checked on every request; the partial unique index releases the slot atomically.
 await q("UPDATE reservations SET status='expired' WHERE status='held' AND stripe_session_id IS NULL AND expires<=?",now).run();
 const profile=await q('SELECT * FROM cast_profiles WHERE id=?',actor).first();
 if(req.method==='GET'){
 const memberPage=Math.max(0,Math.min(100000,Number(params.get('membersPage'))||0)),search='%'+(params.get('memberSearch')||'').slice(0,100)+'%';
 const memberRole=params.get('memberRole')||'all';
 requireThat(['all','user','cast','admin'].includes(memberRole),400,'役割の指定が不正です');
 const roleFilter=memberRole==='all'?'1=1':memberRole==='admin'?'admin_protected=1':"admin_protected=0 AND role='"+memberRole+"'";
 const memberFilter="(name LIKE ? OR id LIKE ?) AND ("+roleFilter+")";
 const reservations=await rows(`SELECT r.id,r.customer,r.cast_id,r.shift_id,r.minutes,r.price,r.course,r.status,r.expires,r.created,r.test_paid_at,r.payment_provider,(r.stripe_session_id IS NOT NULL) AS stripe_checkout_started,s.starts,p.name AS cast_name,m.name AS customer_name FROM reservations r JOIN shifts s ON s.id=r.shift_id JOIN cast_profiles p ON p.id=r.cast_id JOIN members m ON m.id=r.customer WHERE ${admin?'1=1':'(r.customer=? OR r.cast_id=?)'} ORDER BY s.starts DESC`,...(admin?[]:[actor,actor]));
 return json({guestProfile:await q('SELECT bio,topics,style FROM guest_profiles WHERE id=?',actor).first(),members:admin?await rows('SELECT id,name,role,blocked,block_reason,admin_protected,created FROM members WHERE '+memberFilter+' ORDER BY created DESC,id LIMIT 50 OFFSET ?',search,search,Math.floor(memberPage)*50):[],memberTotal:admin?(await q('SELECT COUNT(*) n FROM members WHERE '+memberFilter,search,search).first<{n:number}>())!.n:0,adminInvites:admin?await rows('SELECT id,email,created,expires,accepted_by,accepted_at,revoked FROM admin_invites ORDER BY created DESC LIMIT 100'):[],me:{id:actor,name:me!.name,role},profile,casts:await rows("SELECT p.id,p.name,p.bio,p.headline,p.photo_url,p.topics,p.hobbies,p.style,p.pricing_tier,EXISTS(SELECT 1 FROM cast_favorites f WHERE f.member_id=? AND f.cast_id=p.id) AS is_favorite FROM cast_profiles p WHERE p.status='approved' AND p.id NOT IN (SELECT id FROM members WHERE blocked=1) ORDER BY is_favorite DESC,p.name,p.id",actor),shifts:await rows("SELECT s.* FROM shifts s JOIN cast_profiles p ON p.id=s.cast_id WHERE s.enabled=1 AND p.status='approved' AND s.cast_id NOT IN (SELECT id FROM members WHERE blocked=1) AND s.starts>? AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.shift_id=s.id AND r.status IN ('held','confirmed','completed')) ORDER BY s.starts",minStart),ownShifts:role==='cast'?await rows('SELECT s.*,r.status AS reservation_status FROM shifts s LEFT JOIN reservations r ON r.shift_id=s.id AND r.status IN (\'held\',\'confirmed\',\'completed\') WHERE s.cast_id=? AND s.starts>? ORDER BY s.starts',actor,now-86400000):[],reservations,messages:await rows("SELECT cm.*,m.name AS sender_name FROM conversation_messages cm JOIN reservations r ON r.id=cm.reservation JOIN members m ON m.id=cm.sender WHERE r.customer=? OR r.cast_id=? ORDER BY cm.created,cm.id",actor,actor),applications:admin?await rows('SELECT * FROM cast_profiles ORDER BY status,name'):[],events:admin?await rows('SELECT * FROM audit_events ORDER BY created DESC LIMIT 100'):[],reports:admin?await rows('SELECT p.* FROM reports p JOIN reservations r ON r.id=p.booking ORDER BY p.created DESC'):[],voiceConfigured:guardConfigured(env)&&!!(env.LIVEKIT_URL?.match(/^wss:\/\/[a-z0-9-]+\.livekit\.cloud$/i)&&env.LIVEKIT_API_KEY&&env.LIVEKIT_API_SECRET&&env.LIVEKIT_FREE_PLAN==='build'),paymentMode:stripeEnabled?'stripe_test':'test',stripeReady:stripeTestReady(env)});
 }
 const raw=await req.text();requireThat(raw.length<=10000,413,'送信内容が長すぎます');let a:any;try{a=JSON.parse(raw);}catch{throw new Failure(400,'JSON形式が不正です');}requireThat(a&&typeof a==='object',400,'入力が不正です');

 if(a.action==='favorite'){
  requireThat(text(a.castId,200)&&typeof a.enabled==='boolean'&&a.castId!==actor,400,'キャストの指定を確認してください');
  if(a.enabled){
   await q("INSERT OR IGNORE INTO cast_favorites(member_id,cast_id,created) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM cast_profiles p JOIN members m ON m.id=p.id WHERE p.id=? AND p.status='approved' AND m.blocked=0)",actor,a.castId,now,a.castId).run();
   const favorite=await q('SELECT 1 FROM cast_favorites WHERE member_id=? AND cast_id=?',actor,a.castId).first();
   requireThat(favorite,404,'このキャストは現在登録できません');
  }else{
   await q('DELETE FROM cast_favorites WHERE member_id=? AND cast_id=?',actor,a.castId).run();
  }
  return json({ok:true});
 }
 if(a.action==='guestProfile'){
  requireThat(role==='user',403,'ゲストのみ設定できます');
  const values=['bio','topics','style'].map((key,index)=>{
   const value=a[key]??'';
   requireThat(typeof value==='string'&&value.trim().length<=[500,100,100][index],400,'プロフィールの文字数を確認してください');
   return value.trim();
  });
  await q('INSERT INTO guest_profiles(id,bio,topics,style) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET bio=excluded.bio,topics=excluded.topics,style=excluded.style',actor,...values).run();
  return json({ok:true});
 }
 if(a.action==='diarySave'||a.action==='diaryDelete'){
  requireThat(role==='cast'&&profile?.status==='approved',403,'承認済みキャストのみ投稿できます');
  if(a.action==='diaryDelete'){
   requireThat(text(a.id,100),400,'投稿を指定してください');
   const result=await q('DELETE FROM cast_posts WHERE id=? AND cast_id=?',a.id,actor).run();
   requireThat(result.meta.changes===1,404,'投稿が見つかりません');
  }else{
   requireThat(text(a.title,80)&&text(a.body,2000),400,'タイトルは80文字、本文は2000文字以内で入力してください');
   const existing=a.id?await q('SELECT visibility,photo_id FROM cast_posts WHERE id=? AND cast_id=?',String(a.id),actor).first<{visibility:string;photo_id:string|null}>():null;
   const visibility=a.visibility??existing?.visibility??'public';
   const photoId=a.photoId===undefined?existing?.photo_id??null:a.photoId||null;
   requireThat(['public','fans'].includes(visibility),400,'公開範囲を確認してください');
   if(photoId){
    requireThat(text(photoId,100),400,'写真を確認してください');
    requireThat(await q('SELECT id FROM diary_photos WHERE id=? AND owner=?',photoId,actor).first(),400,'自分がアップロードした写真を選んでください');
    requireThat(!(await q('SELECT id FROM cast_posts WHERE photo_id=? AND id<>?',photoId,a.id||'').first()),409,'この写真は別の投稿に使用されています。写真を再度選択してください');
   }
   if(a.id){
    requireThat(text(a.id,100),400,'投稿を指定してください');
    const result=await q('UPDATE cast_posts SET title=?,body=?,updated=?,visibility=?,photo_id=? WHERE id=? AND cast_id=?',a.title.trim(),a.body.trim(),now,visibility,photoId,a.id,actor).run();
    requireThat(result.meta.changes===1,404,'投稿が見つかりません');
   }else{
    const result=await q(
     'INSERT INTO cast_posts(id,cast_id,title,body,created,updated,visibility,photo_id) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM cast_posts WHERE cast_id=? AND created>?)<5',
     crypto.randomUUID(),actor,a.title.trim(),a.body.trim(),now,now,visibility,photoId,actor,now-60000,
    ).run();
    requireThat(result.meta.changes===1,429,'投稿が続いています。少し待ってから投稿してください');
   }
  }
  return json({ok:true});
 }
 if(a.action==='memberBlock'){
 requireThat(admin,403,'管理者のみ操作できます');requireThat(typeof a.target==='string'&&typeof a.blocked==='boolean'&&typeof a.reason==='string'&&a.reason.trim().length<=200,400,'対象と理由を確認してください');
 requireThat(a.target!==actor,400,'自分自身は停止できません');
 const target=await q('SELECT * FROM members WHERE id=?',a.target).first<{id:string;admin_protected:number}>();requireThat(target,404,'アカウントがありません');
 requireThat(!target!.admin_protected&&!(await q('SELECT id FROM admin_invites WHERE accepted_by=? AND revoked=0',a.target).first()),403,'管理者の停止には対応していません');
 requireThat(!a.blocked||a.reason.trim().length>0,400,'停止理由を入力してください');
 const live=await rows("SELECT r.id,r.customer,r.cast_id,r.minutes,s.starts FROM reservations r JOIN shifts s ON s.id=r.shift_id WHERE (r.customer=? OR r.cast_id=?) AND r.status='confirmed' AND s.starts<=? AND s.starts+r.minutes*60000>?",a.target,a.target,now,now);
 await db.batch([q('UPDATE members SET blocked=?,block_reason=? WHERE id=?',a.blocked?1:0,a.blocked?a.reason.trim():'',a.target),...(a.blocked?[q("UPDATE reservations SET status='cancelled' WHERE (customer=? OR cast_id=?) AND status IN ('held','confirmed') AND (status<>'held' OR stripe_session_id IS NULL)",a.target,a.target)]:[]),audit(a.target,a.blocked?'アカウント利用停止: '+a.reason.trim():'アカウント利用停止を解除')]);
 let pending=0;if(a.blocked)for(const room of live){try{await guardRequest(env,'close',{id:String(room.id),endsAt:Number(room.starts)+Number(room.minutes)*60000,participants:[String(room.customer),String(room.cast_id)]});}catch{pending++;}}
 return json({ok:true,warning:pending?'アカウントは停止しましたが、進行中の通話終了サーバーへの連絡に失敗しました。通話の停止状況を確認してください。':undefined});
 }
 if(a.action==='adminInviteCreate'){
 requireThat(admin,403,'管理者のみ招待できます');requireThat(typeof a.email==='string'&&a.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim()),400,'メールアドレスを確認してください');
 const target=a.email.trim().toLowerCase();requireThat(target!==email!.trim().toLowerCase(),400,'自分以外のメールアドレスを指定してください');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 const inviteId=crypto.randomUUID(),expires=now+24*3600000;
 await db.batch([q('INSERT INTO admin_invites(id,hash,email,creator,created,expires,revoked) VALUES(?,?,?,?,?,?,0)',inviteId,hash,target,actor,now,expires),audit(inviteId,'管理者招待を発行')]);return json({url:new URL('/admin-invite',req.url).origin+'/admin-invite#'+token,expires});
 }
 if(a.action==='adminInviteRevoke'){
 requireThat(admin,403,'管理者のみ操作できます');requireThat(typeof a.id==='string',400,'招待を指定してください');
 const result=await q('UPDATE admin_invites SET revoked=1 WHERE id=? AND accepted_by IS NULL AND revoked=0',a.id).run();requireThat(result.meta.changes===1,409,'使用済みまたは無効な招待です');await audit(a.id,'管理者招待を取り消し').run();return json({ok:true});
 }
 if(a.action==='adminInviteAccept'){
 requireThat(typeof a.token==='string'&&/^[a-f0-9]{64}$/.test(a.token),400,'招待URLが不正です');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.token))),b=>b.toString(16).padStart(2,'0')).join('');
 const result=await q('UPDATE admin_invites SET accepted_by=?,accepted_at=? WHERE hash=? AND email=? AND expires>? AND accepted_by IS NULL AND revoked=0',actor,now,hash,email!.trim().toLowerCase(),now).run();requireThat(result.meta.changes===1,409,'招待が期限切れ・使用済み・取消済み、またはログインしたメールアドレスが招待先と一致しません');await audit(actor,'管理者招待を承諾').run();return json({ok:true});
 }
 if(a.action==='profile'){
 requireThat(text(a.name,40),400,'表示名は1〜40文字です');await q('UPDATE members SET name=? WHERE id=?',a.name.trim(),actor).run();return json({ok:true,me:{id:actor,name:a.name.trim(),role}});
 }
 if(a.action==='apply'){
 requireThat(role==='user',403,'利用者アカウントから申請してください');requireThat(text(a.name,40)&&text(a.bio,500),400,'名前と紹介文を入力してください');requireThat(!profile||profile.status==='rejected',409,'すでに申請済みです');
 await db.batch([q("INSERT INTO cast_profiles(id,name,bio,status) VALUES(?,?,?,'pending') ON CONFLICT(id) DO UPDATE SET name=excluded.name,bio=excluded.bio,status='pending' WHERE cast_profiles.status='rejected'",actor,a.name.trim(),a.bio.trim()),audit(actor,'キャスト申請')]);return json({ok:true});
 }
 if(a.action==='pricingTier'){
 requireThat(admin,403,'管理者のみ料金区分を設定できます');
 requireThat(['new','popular'].includes(a.tier)&&typeof a.target==='string',400,'料金区分を確認してください');
 const result=await q('UPDATE cast_profiles SET pricing_tier=? WHERE id=?',a.tier,a.target).run();
 requireThat(result.meta.changes===1,404,'キャストが見つかりません');
 await audit(a.target,'料金区分変更: '+a.tier).run();return json({ok:true});
 }
 if(a.action==='review'){
 requireThat(admin,403,'管理者のみ操作できます');requireThat(['approve','reject','suspend'].includes(a.decision)&&typeof a.target==='string',400,'申請の指定が不正です');const target=await q('SELECT * FROM cast_profiles WHERE id=?',a.target).first();requireThat(target,404,'申請がありません');
 const status=a.decision==='approve'?'approved':a.decision==='reject'?'rejected':'suspended';
 await db.batch([q('UPDATE cast_profiles SET status=? WHERE id=?',status,a.target),q('UPDATE members SET role=? WHERE id=?',status==='approved'?'cast':'user',a.target),...(status!=='approved'?[q('UPDATE shifts SET enabled=0 WHERE cast_id=?',a.target)]:[]),audit(a.target,'キャスト審査: '+status)]);return json({ok:true});
 }
 if(a.action==='castProfile'){
 requireThat(role==='cast'&&profile?.status==='approved',403,'承認されたキャストのみ操作できます');requireThat(text(a.name,40)&&text(a.bio,500),400,'プロフィールの内容が不正です');const fields=['headline','photo_url','topics','hobbies','style'];const limits=[60,1000,100,200,100];
 const values=fields.map((key,i)=>{const value=a[key]===undefined?String(profile?.[key]||''):a[key];requireThat(typeof value==='string'&&value.trim().length<=limits[i],400,'プロフィール項目の長さが不正です');return value.trim();});
 if(values[1]&&values[1]!==profile?.photo_url){let valid=false;try{const u=new URL(values[1]);valid=u.protocol==='https:'&&!u.username&&!u.password&&!!u.hostname;}catch{}requireThat(valid,400,'写真はHTTPSのURLを指定してください');}
 await db.batch([q('UPDATE cast_profiles SET name=?,bio=?,headline=?,photo_url=?,topics=?,hobbies=?,style=? WHERE id=?',a.name.trim(),a.bio.trim(),...values,actor),audit(actor,'プロフィール更新')]);return json({ok:true});
 }
 if(a.action==='shiftAdd'||a.action==='shiftToggle'){
 requireThat(role==='cast'&&profile?.status==='approved',403,'承認されたキャストのみ操作できます');
 if(a.action==='shiftAdd'){
 requireThat(Number.isSafeInteger(a.starts)&&a.starts%3600000===0&&a.starts>now+900000&&a.starts<now+90*86400000,400,'90日以内の未来の毎正時を指定してください');
 await db.batch([q('INSERT INTO shifts VALUES(?,?,?,1)',crypto.randomUUID(),actor,a.starts),audit(actor,'シフト登録')]);
 }else{requireThat(typeof a.id==='string'&&[0,1].includes(a.enabled),400,'入力が不正です');const shift=await q('SELECT * FROM shifts WHERE id=? AND cast_id=?',a.id,actor).first();requireThat(shift,404,'シフトがありません');const result=await q("UPDATE shifts SET enabled=? WHERE id=? AND cast_id=? AND NOT EXISTS(SELECT 1 FROM reservations WHERE shift_id=? AND status IN ('held','confirmed','completed'))",a.enabled,a.id,actor,a.id).run();requireThat(result.meta.changes===1,409,'予約済みの枠は変更できません');await audit(a.id,'シフト公開状態変更').run();}return json({ok:true});
 }
 if(a.action==='reserve'){
 requireThat(!stripeEnabled||stripeTestReady(env),503,'Stripeテスト決済の準備中です');
 requireThat(role==='user',403,'予約は利用者アカウントで行ってください');const plan=plans.find(p=>p.minutes===a.minutes);requireThat(plan&&['雑談','会話練習'].includes(a.course)&&a.agree===true,400,'プランと同意を確認してください');requireThat(a.course!=='会話練習'||a.minutes>=30,400,'会話練習は30分以上です');
 const shift=await q("SELECT s.*,p.pricing_tier FROM shifts s JOIN cast_profiles p ON p.id=s.cast_id WHERE s.id=? AND s.enabled=1 AND p.status='approved' AND s.cast_id NOT IN (SELECT id FROM members WHERE blocked=1) AND s.starts>?",a.shiftId||'',minStart).first<{id:string;cast_id:string;starts:number;pricing_tier:string}>();requireThat(shift&&shift.cast_id!==actor,409,'この枠は予約できません');const price=priceFor(shift!.pricing_tier,a.minutes);requireThat(price!==null,400,'料金プランを確認してください');requireThat(a.quotedPrice===undefined||a.quotedPrice===price,409,'料金が更新されました。表示を確認して再度予約してください');const bid=crypto.randomUUID();
 const result=await q("INSERT INTO reservations (id,customer,cast_id,shift_id,minutes,price,course,status,expires,created,payment_provider) SELECT ?,?,?,?,?,?,?,'held',?,?,? WHERE EXISTS(SELECT 1 FROM shifts s JOIN cast_profiles p ON p.id=s.cast_id WHERE s.id=? AND s.enabled=1 AND p.status='approved' AND s.cast_id NOT IN (SELECT id FROM members WHERE blocked=1)) AND (SELECT pricing_tier FROM cast_profiles WHERE id=?)=? AND ? NOT IN (SELECT id FROM members WHERE blocked=1)",bid,actor,shift!.cast_id,shift!.id,plan!.minutes,price!,a.course,now+600000,now,stripeEnabled?'stripe_test':'demo',shift!.id,shift!.cast_id,shift!.pricing_tier,actor).run();requireThat(result.meta.changes===1,409,'この枠は予約できません');await audit(bid,'予約仮押さえ').run();return json({id:bid});
 }
 requireThat(typeof a.id==='string',400,'予約を指定してください');const booking=await q('SELECT r.*,s.starts FROM reservations r JOIN shifts s ON s.id=r.shift_id WHERE r.id=?',a.id).first<any>();
 requireThat(booking&&(admin||booking.customer===actor||booking.cast_id===actor),404,'予約が見つかりません');
 if(a.action==='pay'){
 requireThat(booking.customer===actor,403,'予約した利用者のみ操作できます');if(booking.status==='confirmed')return json({ok:true});
 if(booking.payment_provider==='stripe_test')return json(await startStripeCheckout(env,booking,new URL(req.url).origin,now));
 const r=await q("UPDATE reservations SET status='confirmed',test_paid_at=? WHERE id=? AND customer=? AND status='held' AND payment_provider='demo' AND expires>?",now,a.id,actor,now).run();requireThat(r.meta.changes===1,409,'期限切れ、または確定できない予約です');await audit(a.id,testPaymentEvent).run();
 }else if(a.action==='cancel'){
 requireThat(admin||booking.customer===actor,403,'利用者または管理者のみ取り消せます');
 if(booking.status==='held'&&booking.stripe_session_id){
  await expireStripeCheckout(env,booking);
  const current=await q('SELECT status FROM reservations WHERE id=?',a.id).first<{status:string}>();
  if(current?.status==='expired')return json({ok:true});
 }
 const r=await q("UPDATE reservations SET status='cancelled' WHERE id=? AND status=? AND status IN ('held','confirmed') AND stripe_session_id IS ?",a.id,booking.status,booking.stripe_session_id).run();requireThat(r.meta.changes===1,409,'取り消せない予約です');await audit(a.id,'予約取消（実請求なし）').run();if(booking.status==='confirmed'&&now>=booking.starts){try{await guardRequest(env,'close',{id:a.id,endsAt:booking.starts+booking.minutes*60000,participants:[booking.customer,booking.cast_id]});}catch{return json({ok:true,warning:'予約は取り消しましたが、通話終了サーバーへの連絡に失敗しました。運営に確認してください。'});}}
 }else if(a.action==='complete'){
 requireThat(booking.cast_id===actor&&role==='cast',403,'担当キャストのみ操作できます');requireThat(now>=booking.starts,409,'予約開始前には終了できません');const r=await q("UPDATE reservations SET status='completed' WHERE id=? AND status='confirmed'",a.id).run();requireThat(r.meta.changes===1,409,'終了できない予約です');await audit(a.id,'対応終了').run();
 }else if(a.action==='report'){
 requireThat(booking.customer===actor||booking.cast_id===actor,403,'予約の当事者のみ報告できます');requireThat(text(a.body,1000),400,'内容を1〜1000文字で入力してください');await db.batch([q('INSERT INTO reports VALUES(?,?,?,?,?)',crypto.randomUUID(),actor,a.id,a.body.trim(),now),audit(a.id,'問題の報告')]);
 }else if(a.action==='message'){
 requireThat(booking.customer===actor||booking.cast_id===actor,403,'予約の当事者のみ送信できます');requireThat(text(a.body,1000),400,'メッセージは1〜1000文字です');
 // A single SQL statement serializes quota checking with insertion, across Workers.
 const cutoff=now-60000;
 const r=await q("INSERT INTO conversation_messages SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reservations WHERE id=? AND status IN ('confirmed','completed')) AND (SELECT COUNT(*) FROM conversation_messages WHERE sender=? AND created>?)<20",crypto.randomUUID(),a.id,actor,a.body.trim(),now,a.id,actor,cutoff).run();
 if(r.meta.changes!==1){
 const current=await q('SELECT status FROM reservations WHERE id=?',a.id).first<{status:string}>();
 requireThat(current&&['confirmed','completed'].includes(current.status),409,'確定した予約でのみ送信できます');
 const usage=await q('SELECT MIN(created) AS oldest FROM conversation_messages WHERE sender=? AND created>?',actor,cutoff).first<{oldest:number|null}>();
 const retryAfter=Math.max(1,Math.ceil(((usage?.oldest??now)+60000-now)/1000));
 return Response.json({error:`連続送信を防ぐため、メッセージは1分間に20件までです。${retryAfter}秒ほど待ってから送信してください。`,retryAfter},{status:429,headers:{'Cache-Control':'no-store','Retry-After':String(retryAfter)}});
 }
 }else throw new Failure(400,'未対応の操作です');return json({ok:true});
 }catch(e){if(e instanceof Failure||e instanceof PaymentFailure)return json({error:e.message},e.status);if(String(e).includes('UNIQUE'))return json({error:'この枠はすでに登録・予約されています。'},409);console.error('workspace operation failed');return json({error:'処理に失敗しました。再読み込みして状態を確認してください。'},500);}
}
