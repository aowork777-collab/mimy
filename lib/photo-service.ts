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
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method!=='POST')return json('POSTのみ利用できます',405);
 if(!actor||!req.headers.get('oai-authenticated-user-email'))return json('ログインしてください',401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return json('送信元が不正です',403);
 const profile=await env.DB.prepare("SELECT id FROM cast_profiles WHERE id=? AND status='approved'").bind(actor).first();if(!profile)return json('承認されたキャストのみ写真を変更できます',403);
 const max=3*1024*1024;if(Number(req.headers.get('content-length')||0)>max)return json('写真は3MB以下にしてください',413);
 const reader=req.body?.getReader();if(!reader)return json('写真を選択してください',400);
 const parts:Uint8Array[]=[];let length=0;while(true){const{done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();return json('写真は3MB以下にしてください',413)}parts.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 let type='';if(length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';else if(length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))type='image/png';else if(length>=16&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')type='image/webp';
 if(!type)return json('JPEG・PNG・WebP画像を選択してください',400);
 await env.BUCKET.put(await keyFor(actor),bytes,{httpMetadata:{contentType:type}});
 const url='/api/cast-photo?id='+encodeURIComponent(actor)+'&v='+crypto.randomUUID();
 await env.DB.prepare('UPDATE cast_profiles SET photo_url=? WHERE id=?').bind(url,actor).run();
 return Response.json({url},{headers:{'Cache-Control':'no-store'}});
}
