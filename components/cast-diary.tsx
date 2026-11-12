'use client';
import {useEffect,useState} from 'react';
type Post={id:string;title:string;body:string;created:number;updated:number;visibility:'public'|'fans';photo_id:string|null};
const format=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric'});
export function CastDiary({castId,editable=false}:{castId:string;editable?:boolean}){
 const [posts,setPosts]=useState<Post[]>([]);
 const [page,setPage]=useState(0);
 const [hasNext,setHasNext]=useState(false);
 const [version,setVersion]=useState(0);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState('');
 const [title,setTitle]=useState('');
 const [body,setBody]=useState('');
 const [visibility,setVisibility]=useState('public');
 const [photoId,setPhotoId]=useState('');
 const [uploading,setUploading]=useState(false);
 const [exclusiveLocked,setExclusiveLocked]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');
  async function load(){
   try{
    const params=new URLSearchParams({diaryCast:castId,page:String(page)});
    const response=await fetch('/api/workspace?'+params,{signal:controller.signal});
    const data=await response.json() as {posts:Post[];hasNext:boolean;exclusiveLocked:boolean;error?:string};
    if(!response.ok)throw Error(data.error||'日記を取得できませんでした。');
    if(!controller.signal.aborted){setPosts(data.posts);setHasNext(data.hasNext);setExclusiveLocked(data.exclusiveLocked);}
   }catch(err){if(!controller.signal.aborted)setError((err as Error).message);}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();
  return()=>controller.abort();
 },[castId,page,version]);
 function reset(){setEditing('');setTitle('');setBody('');setPhotoId('');setVisibility('public');}
 async function upload(file:File){
  setUploading(true);setError('');
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPEG・PNG・WebPの写真を選択してください。');
   if(file.size>3*1024*1024)throw Error('写真は3MB以下にしてください。');
   const response=await fetch('/api/diary-photo',{method:'POST',headers:{'Content-Type':file.type},body:file});
   const data=await response.json() as {id:string;error?:string};
   if(!response.ok)throw Error(data.error||'写真を追加できませんでした。');
   setPhotoId(data.id);
  }catch(err){setError((err as Error).message);}
  finally{setUploading(false);}
 }
 async function mutate(payload:Record<string,string>){
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const data=await response.json() as {error?:string};
   if(!response.ok)throw Error(data.error||'保存できませんでした。');
   reset();setPage(0);setVersion(n=>n+1);
   setNotice(payload.action==='diaryDelete'?'日記を削除しました。':'日記を公開しました。');
  }catch(err){setError((err as Error).message);}
  finally{setBusy(false);}
 }
 return <section className="cast-diary">
  <h2>{editable?'ブログ・日記を投稿':'ブログ・日記'}</h2>
  {editable&&<form className="diary-editor" onSubmit={event=>{event.preventDefault();if(!uploading)void mutate({action:'diarySave',id:editing,title,body,visibility,photoId});}}>
   <p>公開範囲を選んで投稿できます。写真は1投稿につき1枚添付できます。</p>
   <label>タイトル<input required maxLength={80} value={title} disabled={busy||uploading} onChange={e=>setTitle(e.target.value)}/></label>
   <label>本文<textarea required maxLength={2000} value={body} disabled={busy||uploading} onChange={e=>setBody(e.target.value)}/></label>
   <label>公開範囲<select value={visibility} disabled={busy||uploading} onChange={e=>setVisibility(e.target.value)}><option value="public">公開 · プロフィールを見ている利用者</option><option value="fans">推してくれた人限定</option></select></label>
   <label>写真をファイル・アルバムから選ぶ<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';}}/></label>
   <p className="muted">JPEG・PNG・WebP／3MBまで。写真は投稿を保存すると選んだ公開範囲で表示されます。</p>
   {uploading&&<p role="status">写真をアップロード中…</p>}
   {photoId&&<div className="diary-photo-preview"><img src={'/api/diary-photo?id='+encodeURIComponent(photoId)} alt="投稿に添付する写真"/><button type="button" className="secondary" disabled={busy||uploading} onClick={()=>setPhotoId('')}>写真を外す</button></div>}
   <div className="actions"><button className="primary" disabled={busy||uploading}>{editing?'編集を保存して公開':'日記を公開'}</button>
   {editing&&<button className="secondary" type="button" disabled={busy||uploading} onClick={reset}>編集をやめる</button>}</div>
  </form>}
  {error&&<p role="alert">{error}<button className="secondary" onClick={()=>setVersion(n=>n+1)}>再読み込み</button></p>}
  {!editable&&exclusiveLocked&&<p className="diary-locked">「この人を推す」を押すと、推してくれた人限定の投稿も読めます。</p>}
  {notice&&<p role="status">{notice}</p>}
  {loading?<p role="status">日記を読み込み中…</p>:!error&&<>
   {!posts.length&&<p>{exclusiveLocked?'現在読める投稿はありません。':'日記はまだありません。'}</p>}
   <div className="diary-posts">{posts.map(post=><article key={post.id} className="diary-post">
    <time dateTime={new Date(post.created).toISOString()}>{format.format(post.created)}</time>
    <span className="status">{post.visibility==='fans'?'推してくれた人限定':'公開'}</span>
    <h3>{post.title}</h3><p>{post.body}</p>
    {post.photo_id&&<img className="diary-photo" src={'/api/diary-photo?id='+encodeURIComponent(post.photo_id)} alt={post.title+'の添付写真'} loading="lazy"/>}
    {editable&&<div className="actions">
     <button className="secondary" disabled={busy||uploading} onClick={()=>{setEditing(post.id);setTitle(post.title);setBody(post.body);setVisibility(post.visibility);setPhotoId(post.photo_id||'');}}>編集する</button>
     <button className="secondary" disabled={busy||uploading} onClick={()=>{if(confirm('この日記を削除しますか？'))void mutate({action:'diaryDelete',id:post.id});}}>削除する</button>
    </div>}
   </article>)}</div>
   {(page>0||hasNext)&&<div className="member-pagination"><button className="secondary" disabled={page===0||busy} onClick={()=>setPage(n=>n-1)}>前へ</button><span>{page+1}ページ</span><button className="secondary" disabled={!hasNext||busy} onClick={()=>setPage(n=>n+1)}>次へ</button></div>}
  </>}
 </section>;
}
