import {AccessToken, RoomServiceClient, TrackSource} from 'livekit-server-sdk';
export type CallEnv={DB?:D1Database;LIVEKIT_URL?:string;LIVEKIT_API_KEY?:string;LIVEKIT_API_SECRET?:string;LIVEKIT_FREE_PLAN?:string};
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function callConfigured(env:CallEnv){return !!(env.LIVEKIT_URL?.match(/^wss:\/\/[a-z0-9-]+\.livekit\.cloud$/i)&&env.LIVEKIT_API_KEY&&env.LIVEKIT_API_SECRET&&env.LIVEKIT_FREE_PLAN==='build');}
export async function handleCall(req:Request,env:CallEnv){
 const actor=req.headers.get('oai-authenticated-user-id');
 if(!actor||!req.headers.get('oai-authenticated-user-email'))return response({error:'ログインが必要です'},401);
 if(req.method!=='POST')return response({error:'POSTのみ利用できます'},405);
 if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'送信元が不正です'},403);
 if(!env.DB)return response({error:'データベースが未接続です'},503);
 let input:{id?:string;action?:string};try{const raw=await req.text();if(raw.length>1000)throw Error();input=JSON.parse(raw);if(!input||typeof input.id!=='string'||!['join','check'].includes(input.action||''))throw Error();}catch{return response({error:'予約の指定が不正です'},400);}
 const booking=await env.DB.prepare('SELECT r.*,s.starts,p.status AS cast_status FROM reservations r JOIN shifts s ON s.id=r.shift_id JOIN cast_profiles p ON p.id=r.cast_id WHERE r.id=? AND (r.customer=? OR r.cast_id=?)').bind(input.id,actor,actor).first<{id:string;status:string;starts:number;minutes:number;cast_status:string}>();
 if(!booking)return response({error:'予約が見つかりません'},404);
 if(!callConfigured(env))return response({error:'通話は準備中です。運営による無料プランの接続設定が必要です'},503);
 const end=booking.starts+booking.minutes*60000,now=Date.now();
 const allowed=booking.status==='confirmed'&&booking.cast_status==='approved'&&now>=booking.starts&&now<end;
 const roomName='reservation-'+booking.id;
 const service=new RoomServiceClient(env.LIVEKIT_URL!.replace('wss:','https:'),env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET);
 if(!allowed){
  // Token expiry alone does not disconnect an existing connection. Delete a closed room on checks.
  if(now>=booking.starts){try{await service.deleteRoom(roomName);}catch{/* Room may already be gone; never issue another token. */}}
  return response({error:now<booking.starts?'予約開始時刻になると参加できます':'この予約の通話は終了、取消、または停止されています'},409);
 }
 if(input.action==='check')return response({ok:true,endsAt:end});
 try{
  await service.createRoom({name:roomName,maxParticipants:2,emptyTimeout:60,departureTimeout:20});
  const token=new AccessToken(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET,{identity:actor,ttl:Math.max(1,Math.min(60,Math.floor((end-now)/1000)))});
  token.addGrant({roomJoin:true,room:roomName,canSubscribe:true,canPublish:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE,TrackSource.CAMERA]});
  return response({url:env.LIVEKIT_URL,token:await token.toJwt(),endsAt:end});
 }catch{return response({error:'通話サービスに接続できません。無料枠の残量と接続設定を運営に確認してください'},503);}
}
