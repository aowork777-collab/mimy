export type GuardEnv={CALL_GUARD_URL?:string;CALL_GUARD_SECRET?:string;LIVEKIT_API_SECRET?:string};
export type GuardJob={id:string;endsAt:number;participants:string[]};
export function guardConfigured(env:GuardEnv){try{return new URL(env.CALL_GUARD_URL||'').protocol==='https:'&&!!(env.CALL_GUARD_SECRET||env.LIVEKIT_API_SECRET);}catch{return false;}}
export async function guardAuthToken(secret:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('mimy.call-guard.v1'))),n=>n.toString(16).padStart(2,'0')).join('');}
export async function guardRequest(env:GuardEnv,action:'schedule'|'close',job:GuardJob){
 if(!guardConfigured(env))throw Error('通話終了サーバーが未設定です');
 const r=await fetch(new URL('/'+action,env.CALL_GUARD_URL),{method:'POST',headers:{Authorization:'Bearer '+(env.CALL_GUARD_SECRET||await guardAuthToken(env.LIVEKIT_API_SECRET!)),'Content-Type':'application/json'},body:JSON.stringify(job),signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!r.ok)throw Error('通話終了サーバーに登録できません');
}
