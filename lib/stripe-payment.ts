export type StripeEnv={
 DB?:D1Database;
 STRIPE_TEST_ENABLED?:string;
 STRIPE_SECRET_KEY?:string;
 STRIPE_WEBHOOK_SECRET?:string;
};
export type StripeBooking={
 id:string;
 customer:string;
 cast_id:string;
 minutes:number;
 price:number;
 status:string;
 starts:number;
 expires:number;
 payment_provider:string;
 stripe_session_id:string|null;
 stripe_checkout_expires:number|null;
};
type CheckoutSession={
 id:string;
 livemode:boolean;
 mode:string;
 status:string;
 payment_status:string;
 expires_at:number;
 client_reference_id:string;
 amount_total:number;
 currency:string;
 payment_intent:string|null;
 url?:string|null;
};

export class PaymentFailure extends Error{
 constructor(public status:number,message:string){super(message);}
}
export const stripeTestEnabled=(env:StripeEnv)=>env.STRIPE_TEST_ENABLED==='1';
const testKeyReady=(env:StripeEnv)=>/^(sk|rk)_test_\S+$/.test(env.STRIPE_SECRET_KEY||'');
const webhookReady=(env:StripeEnv)=>/^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET||'');
export const stripeTestReady=(env:StripeEnv)=>stripeTestEnabled(env)&&testKeyReady(env)&&webhookReady(env);
export const checkoutWindowMinutes=35;
const minStripeSeconds=30*60;

async function stripe(env:StripeEnv,path:string,body?:URLSearchParams,key?:string){
 if(!testKeyReady(env))throw new PaymentFailure(503,'Stripeテスト環境を設定してください');
 const headers=new Headers({Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2026-10-28.endive'});
 if(body)headers.set('Content-Type','application/x-www-form-urlencoded');
 if(key)headers.set('Idempotency-Key',key);
 let response:Response;
 try{
  response=await fetch('https://api.stripe.com/v1/checkout/sessions'+path,{
   method:body?'POST':'GET',headers,body,redirect:'error',signal:AbortSignal.timeout(10000),
  });
 }catch{
  throw new PaymentFailure(502,'Stripeに接続できません。少し待ってから再試行してください');
 }
 if(!response.ok)throw new PaymentFailure(502,'Stripeで決済を処理できませんでした。時間をおいて再試行してください');
 const session=await response.json() as CheckoutSession;
 if(session.livemode!==false||!/^cs_test_\w+$/.test(session.id)||session.mode!=='payment'){
  throw new PaymentFailure(502,'Stripeテスト決済を確認できませんでした');
 }
 return session;
}

function validateSession(session:CheckoutSession,booking:StripeBooking){
 if(session.client_reference_id!==booking.id||session.amount_total!==booking.price||session.currency!=='jpy'){
  throw new PaymentFailure(502,'予約の金額とStripeの決済情報が一致しません');
 }
}

export async function startStripeCheckout(env:StripeEnv,booking:StripeBooking,origin:string,now=Date.now()){
 if(!stripeTestReady(env)||!env.DB)throw new PaymentFailure(503,'Stripeテスト決済の準備中です');
 if(booking.status!=='held'||booking.expires<=now)throw new PaymentFailure(409,'支払い期限が過ぎています。予約状況をご確認ください');
 const db=env.DB;
 let session:CheckoutSession;
 if(booking.stripe_session_id){
  session=await stripe(env,'/'+encodeURIComponent(booking.stripe_session_id));
 }else{
  // Save a fixed expiry before requesting a session so retries use identical Stripe parameters.
  const deadline=Math.floor(now/1000)+checkoutWindowMinutes*60;
  const updated=await db.prepare(`
   UPDATE reservations SET stripe_checkout_expires=?,expires=?
   WHERE id=? AND customer=? AND status='held' AND payment_provider='stripe_test'
    AND stripe_checkout_expires IS NULL AND expires>? AND ?<(
     SELECT starts FROM shifts WHERE id=reservations.shift_id
    )
   RETURNING stripe_checkout_expires
  `).bind(deadline,deadline*1000,booking.id,booking.customer,now,deadline*1000).first<{stripe_checkout_expires:number}>();
  const expiry=updated?.stripe_checkout_expires??(await db.prepare(`
   SELECT stripe_checkout_expires FROM reservations WHERE id=? AND status='held'
  `).bind(booking.id).first<{stripe_checkout_expires:number|null}>())?.stripe_checkout_expires;
  if(!expiry||expiry-Math.floor(now/1000)<minStripeSeconds){
   throw new PaymentFailure(409,'支払い画面を作成できる時間を過ぎました。予約を取り消して再度お試しください');
  }
  const back=new URL('/',origin);
  back.searchParams.set('view','bookings');
  back.searchParams.set('booking',booking.id);
  const success=new URL(back);
  success.searchParams.set('checkout','returned');
  const form=new URLSearchParams({
   mode:'payment',
   'payment_method_types[0]':'card',
   'line_items[0][price_data][currency]':'jpy',
   'line_items[0][price_data][product_data][name]':`mimy. 会話予約 ${booking.minutes}分`,
   'line_items[0][price_data][unit_amount]':String(booking.price),
   'line_items[0][quantity]':'1',
   client_reference_id:booking.id,
   expires_at:String(expiry),
   success_url:success.href,
   cancel_url:back.href,
  });
  session=await stripe(env,'',form,'mimy-checkout-'+booking.id);
  validateSession(session,booking);
  const saved=await db.prepare(`
   UPDATE reservations SET stripe_session_id=?
   WHERE id=? AND status='held' AND expires>?
    AND (stripe_session_id IS NULL OR stripe_session_id=?)
    AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id IN (customer,cast_id) AND m.blocked=1)
    AND EXISTS(SELECT 1 FROM cast_profiles p WHERE p.id=cast_id AND p.status='approved')
  `).bind(session.id,booking.id,Date.now(),session.id).run();
  if(!saved.meta.changes)throw new PaymentFailure(409,'予約が変更されました。予約一覧をご確認ください');
 }
 validateSession(session,booking);
 if(session.status!=='open'||!session.url||!/^https:\/\/checkout\.stripe\.com\//.test(session.url)){
  throw new PaymentFailure(409,'この支払い画面は終了しました。予約の更新をお待ちください');
 }
 return {checkoutUrl:session.url};
}

export async function expireStripeCheckout(env:StripeEnv,booking:StripeBooking){
 if(!booking.stripe_session_id)return;
 const path='/'+encodeURIComponent(booking.stripe_session_id);
 let session=await stripe(env,path);
 if(session.status==='open'){
  try{session=await stripe(env,path+'/expire',new URLSearchParams());}
  catch{session=await stripe(env,path);}
 }
 validateSession(session,booking);
 if(session.status!=='expired'||session.payment_status!=='unpaid'){
  throw new PaymentFailure(409,'決済状況を確認中です。Stripeの通知が反映された後に予約状況をご確認ください');
 }
}

async function signedEvent(raw:string,header:string,secret:string,now:number){
 const fields=header.split(',').map(part=>part.trim().split('=',2));
 const timestamp=fields.find(([name])=>name==='t')?.[1]||'';
 if(!/^\d{1,12}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const signatures=fields.filter(([name,value])=>name==='v1'&&/^[a-f0-9]{64}$/.test(value||''));
 if(!signatures.length)return false;
 const encode=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encode.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const signed=encode.encode(timestamp+'.'+raw);
 for(const [,value] of signatures){
  const bytes=Uint8Array.from(value.match(/../g)!,hex=>parseInt(hex,16));
  if(await crypto.subtle.verify('HMAC',key,bytes,signed))return true;
 }
 return false;
}
const reply=(status:number)=>Response.json({ok:status===200},{status,headers:{'Cache-Control':'no-store'}});
export async function handleStripeWebhook(req:Request,env:StripeEnv,now=Date.now()){
 if(!env.DB||!webhookReady(env))return reply(503);
 // Limit request size before collecting the raw body used for signature verification.
 const signature=req.headers.get('stripe-signature');
 const reader=req.body?.getReader();
 if(!signature||!reader)return reply(400);
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let raw='',size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>128*1024){await reader.cancel();return reply(413);}
   raw+=decoder.decode(value,{stream:true});
  }
  raw+=decoder.decode();
  if(!await signedEvent(raw,signature,env.STRIPE_WEBHOOK_SECRET!,now))return reply(400);
 }catch{return reply(400);}
 let event:{type?:string;livemode?:boolean;data?:{object?:CheckoutSession}};
 try{event=JSON.parse(raw);}catch{return reply(400);}
 if(event?.livemode!==false)return reply(400);
 if(event.type!=='checkout.session.completed'&&event.type!=='checkout.session.expired')return reply(200);
 const session=event.data?.object;
 if(!session||session.livemode!==false||session.mode!=='payment'||!/^cs_test_\w+$/.test(session.id||''))return reply(400);
 const db=env.DB;
 const booking=await db.prepare(`
  SELECT r.*,s.starts FROM reservations r JOIN shifts s ON s.id=r.shift_id
  WHERE r.stripe_session_id=? AND r.payment_provider='stripe_test'
 `).bind(session.id).first<StripeBooking>();
 if(!booking)return reply(200);
 try{validateSession(session,booking);}catch{return reply(400);}
 if(event.type==='checkout.session.expired'){
  if(session.status!=='expired'||session.payment_status!=='unpaid')return reply(400);
  await db.prepare("UPDATE reservations SET status='expired' WHERE id=? AND status='held' AND stripe_paid_at IS NULL").bind(booking.id).run();
 }else{
  if(session.status!=='complete'||session.payment_status!=='paid'||!/^pi_\w+$/.test(session.payment_intent||''))return reply(400);
  // One update records payment exactly once. A stale or blocked reservation remains unavailable.
  await db.prepare(`
   UPDATE reservations SET stripe_paid_at=?,stripe_payment_intent=?,status=CASE
    WHEN status='held' AND ?>0
     AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id IN (customer,cast_id) AND m.blocked=1)
     AND EXISTS(SELECT 1 FROM cast_profiles p WHERE p.id=cast_id AND p.status='approved')
    THEN 'confirmed'
    WHEN status='held' THEN 'cancelled'
    ELSE status END
   WHERE id=? AND stripe_paid_at IS NULL
  `).bind(now,session.payment_intent,booking.starts-now,booking.id).run();
 }
 return reply(200);
}
