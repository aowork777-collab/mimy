import type {MemberIdentity} from './email-auth';
import {sanitizePhoto} from './photo-sanitizer';

type PhotoEnvironment={DB?:D1Database;BUCKET?:R2Bucket};
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
const maxPhotoBytes=3*1024*1024;

export async function handleDiaryPhoto(req:Request,env:PhotoEnvironment,identity:MemberIdentity|null){
 if(!env.DB||!env.BUCKET)return fail('写真の保存先が準備できていません',503);
 if(!identity)return fail('ログインしてください',401);
 const db=env.DB;
 const actor=identity.id;
 const member=await db.prepare('SELECT blocked FROM members WHERE id=?').bind(actor).first<{blocked:number}>();
 if(!member||member.blocked)return fail('このアカウントでは利用できません',403);

 if(req.method==='GET'){
  const id=new URL(req.url).searchParams.get('id')||'';
  if(!/^[a-f0-9-]{36}$/.test(id))return fail('写真がありません',404);
  // Every image request checks the current audience, including direct image URLs.
  const allowed=await db.prepare(`
   SELECT a.id FROM diary_photos a
   JOIN cast_profiles c ON c.id=a.owner
   JOIN members m ON m.id=a.owner
   WHERE a.id=? AND c.status='approved' AND m.blocked=0 AND (
    a.owner=? OR EXISTS(
     SELECT 1 FROM cast_posts p WHERE p.photo_id=a.id AND p.cast_id=a.owner AND (
      p.visibility='public' OR EXISTS(
       SELECT 1 FROM cast_favorites f WHERE f.cast_id=p.cast_id AND f.member_id=?
      )
     )
    )
   )
  `).bind(id,actor,actor).first();
  if(!allowed)return fail('写真がありません',404);
  const object=await env.BUCKET.get('diary-photos/'+id);
  if(!object)return fail('写真がありません',404);
  return new Response(await object.arrayBuffer(),{headers:{
   'Content-Type':object.httpMetadata?.contentType||'image/jpeg',
   'Cache-Control':'private, no-store',
   'Vary':'Cookie',
   'X-Content-Type-Options':'nosniff',
  }});
 }
 if(req.method!=='POST')return fail('操作が不正です',405);
 if(req.headers.get('origin')!==new URL(req.url).origin)return fail('送信元が不正です',403);
 const cast=await db.prepare("SELECT id FROM cast_profiles WHERE id=? AND status='approved'").bind(actor).first();
 if(!cast)return fail('承認されたキャストのみ写真を追加できます',403);
 if(Number(req.headers.get('content-length')||0)>maxPhotoBytes)return fail('写真は3MB以下にしてください',413);
 const reader=req.body?.getReader();
 if(!reader)return fail('写真を選択してください',400);
 const chunks:Uint8Array[]=[];
 let length=0;
 while(true){
  const {done,value}=await reader.read();
  if(done)break;
  length+=value.length;
  if(length>maxPhotoBytes){await reader.cancel();return fail('写真は3MB以下にしてください',413);}
  chunks.push(value);
 }
 const bytes=new Uint8Array(length);
 let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let clean:{bytes:Uint8Array;type:string};
 try{clean=sanitizePhoto(bytes);}
 catch(error){return fail((error as Error).message,400);}
 const id=crypto.randomUUID();
 const now=Date.now();
 const result=await db.prepare(`
  INSERT INTO diary_photos(id,owner,created) SELECT ?,?,?
  WHERE (SELECT COUNT(*) FROM diary_photos WHERE owner=? AND created>?)<5
 `).bind(id,actor,now,actor,now-60000).run();
 if(!result.meta.changes)return fail('写真の追加が続いています。少し待ってください',429);
 try{
  await env.BUCKET.put('diary-photos/'+id,clean.bytes,{httpMetadata:{contentType:clean.type}});
 }catch{
  await db.prepare('DELETE FROM diary_photos WHERE id=?').bind(id).run();
  return fail('写真を保存できませんでした。もう一度お試しください',503);
 }
 return Response.json({id},{headers:{'Cache-Control':'no-store'}});
}
