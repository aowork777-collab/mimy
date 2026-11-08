import {DurableObject} from 'cloudflare:workers';
import {RoomServiceClient} from 'livekit-server-sdk';
import {guardAuthToken,type GuardJob} from '../../lib/call-guard-client';
type Env={DEADLINES:DurableObjectNamespace;LIVEKIT_URL:string;LIVEKIT_API_KEY:string;LIVEKIT_API_SECRET:string};
type Stored=GuardJob&{closed:boolean;attempts:number;cleanupUntil:number};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export default {async fetch(req:Request,env:Env){
 if(!env.LIVEKIT_API_SECRET||!env.LIVEKIT_API_KEY||!/^wss:\/\/[a-z0-9-]+\.livekit\.cloud$/i.test(env.LIVEKIT_URL||''))return json({error:'Service not configured'},503);
 if(req.method!=='POST')return json({error:'POST required'},405);
 const expected='Bearer '+await guardAuthToken(env.LIVEKIT_API_SECRET);const actual=req.headers.get('authorization')||'';
 const a=new TextEncoder().encode(actual),b=new TextEncoder().encode(expected);let different=a.length^b.length;for(let i=0;i<b.length;i++)different|=(a[i]||0)^b[i];if(different)return json({error:'Unauthorized'},401);
 const path=new URL(req.url).pathname;if(!['/schedule','/close'].includes(path))return json({error:'Not found'},404);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Too large'},413);
 let job:GuardJob;try{const raw=await req.text();if(raw.length>4096)throw Error();job=JSON.parse(raw);if(!/^[a-f0-9-]{36}$/.test(job.id)||!Number.isSafeInteger(job.endsAt)||job.endsAt>Date.now()+86400000||!Array.isArray(job.participants)||job.participants.length!==2||job.participants.some(p=>typeof p!=='string'||p.length>200||!p))throw Error();}catch{return json({error:'Invalid job'},400);}
 return env.DEADLINES.get(env.DEADLINES.idFromName(job.id)).fetch(new Request('https://deadline'+path,{method:'POST',body:JSON.stringify(job)}));
}};
export class CallDeadline extends DurableObject<Env>{
 async fetch(req:Request){const incoming=await req.json<GuardJob>(),action=new URL(req.url).pathname;
 let job=await this.ctx.storage.get<Stored>('job');
 if(job&&(job.endsAt!==incoming.endsAt||job.participants.join('\0')!==incoming.participants.join('\0')))return json({error:'Immutable reservation'},409);
 if(action==='/schedule'){
  if(job?.closed||incoming.endsAt<=Date.now())return json({error:'Call ended'},409);
  if(!job){job={...incoming,closed:false,attempts:0,cleanupUntil:incoming.endsAt+120000};await this.ctx.storage.put('job',job);}
  // Persist before acknowledging: no browser is needed to execute the alarm.
  await this.ctx.storage.setAlarm(job.endsAt);return json({scheduled:true,endsAt:job.endsAt});
 }
 job={...(job||incoming),closed:true,attempts:0,cleanupUntil:Math.max(incoming.endsAt,Date.now())+120000};
 await this.ctx.storage.put('job',job);await this.ctx.storage.setAlarm(Date.now()+1000);
 try{await this.disconnect(job);return json({closed:true});}catch{return json({accepted:true,retrying:true},202);}
 }
 async disconnect(job:Stored){
  const service=new RoomServiceClient(this.env.LIVEKIT_URL.replace('wss:','https:'),this.env.LIVEKIT_API_KEY,this.env.LIVEKIT_API_SECRET),room='reservation-'+job.id;
  const ignoreMissing=async(fn:()=>Promise<unknown>)=>{try{await fn();}catch(e){if((e as {code?:string}).code!=='not_found'&&(e as {status?:number}).status!==404)throw e;}};
  // LiveKit Cloud revokes participant tokens, including reconnect tokens.
  for(const identity of job.participants)await ignoreMissing(()=>service.removeParticipant(room,identity));
  await ignoreMissing(()=>service.deleteRoom(room));
 }
 async alarm(){
  const job=await this.ctx.storage.get<Stored>('job');if(!job)return;
  if(!job.closed&&Date.now()<job.endsAt){await this.ctx.storage.setAlarm(job.endsAt);return;}
  job.closed=true;job.attempts++;await this.ctx.storage.put('job',job);
  // Schedule retry first, so a crash/network outage does not lose the deadline.
  await this.ctx.storage.setAlarm(Date.now()+Math.min(60000,1000*2**Math.min(job.attempts,6)));
  try{await this.disconnect(job);if(Date.now()>=job.cleanupUntil){await this.ctx.storage.deleteAlarm();await this.ctx.storage.delete('job');}else await this.ctx.storage.setAlarm(Math.min(job.cleanupUntil,Date.now()+15000));}
  catch{console.error('Call termination retry required',{reservation:job.id,attempt:job.attempts});}
 }
}
