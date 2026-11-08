import {sanitizePhoto} from './photo-sanitizer';
type PhotoEnv={DB?:D1Database;BUCKET?:R2Bucket};
const json=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const keyFor=async(id:string)=>'cast-photos/'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id))),b=>b.toString(16).padStart(2,'0')).join('');
export async function handlePhoto(req:Request,env:PhotoEnv){
 if(!env.DB||!env.BUCKET)return json('写真の保存先が準備できていません',503);
 const actor=req.headers.get('oai-authenticated-user-id');
 if(req.method==='GET'){
 const id=new URL(req.url).searchParams.get('id');if(!id||id.length>200)return json('写真がありません',404);
 const profile=await env.DB.prepare('SELECT status FROM cast_profiles WHERE id=?').bind(id).first<{status:string}>();
 if(!profile||(profile.status!=='approved'&&actor!==id))return json('写真がありません',404);
 const object=await env.BUCKET.get(await keyFor(id));if(!object)return json('写真がありません',404);
 // Also sanitize photos uploaded before this protection was added.
 let bytes:Uint8Array,type:string;
 try{const clean=sanitizePhoto(new Uint8Array(await object.arrayBuffer()));bytes=clean.bytes;type=clean.type;}catch{return json('写真を読み取れません。キャストは写真を選び直してください',404);}
 if(object.customMetadata?.privacyVersion!=='1'&&object.etag){
 // Conditional replacement cannot overwrite a newer upload racing this request.
 try{await env.BUCKET.put(await keyFor(id),bytes,{onlyIf:{etagMatches:object.etag},httpMetadata:{contentType:type},customMetadata:{privacyVersion:'1'}});}catch{/* The response still contains only sanitized bytes. */}
 }
 return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method!=='POST')return json('POSTのみ利用できます',405);
 if(!actor||!req.headers.get('oai-authenticated-user-email'))return json('ログインしてください',401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return json('送信元が不正です',403);
 const profile=await env.DB.prepare("SELECT id FROM cast_profiles WHERE id=? AND status='approved'").bind(actor).first();if(!profile)return json('承認されたキャストのみ写真を変更できます',403);
 const max=3*1024*1024;if(Number(req.headers.get('content-length')||0)>max)return json('写真は3MB以下にしてください',413);
 const reader=req.body?.getReader();if(!reader)return json('写真を選択してください',400);
 const parts:Uint8Array[]=[];let length=0;while(true){const{done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();return json('写真は3MB以下にしてください',413)}parts.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 let clean:{bytes:Uint8Array;type:string};try{clean=sanitizePhoto(bytes);}catch(e){return json((e as Error).message,400);}
 await env.BUCKET.put(await keyFor(actor),clean.bytes,{httpMetadata:{contentType:clean.type},customMetadata:{privacyVersion:'1'}});
 const url='/api/cast-photo?id='+encodeURIComponent(actor)+'&v='+crypto.randomUUID();
 await env.DB.prepare('UPDATE cast_profiles SET photo_url=? WHERE id=?').bind(url,actor).run();
 return Response.json({url},{headers:{'Cache-Control':'no-store'}});
}
