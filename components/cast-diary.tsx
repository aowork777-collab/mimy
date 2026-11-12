'use client';
import {useEffect,useState} from 'react';
type Post={id:string;title:string;body:string;created:number;updated:number};
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
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');
  async function load(){
   try{
    const params=new URLSearchParams({diaryCast:castId,page:String(page)});
    const response=await fetch('/api/workspace?'+params,{signal:controller.signal});
    const data=await response.json() as {posts:Post[];hasNext:boolean;error?:string};
    if(!response.ok)throw Error(data.error||'日記を取得できませんでした。');
    if(!controller.signal.aborted){setPosts(data.posts);setHasNext(data.hasNext);}
   }catch(err){if(!controller.signal.aborted)setError((err as Error).message);}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();
  return()=>controller.abort();
 },[castId,page,version]);
 function reset(){setEditing('');setTitle('');setBody('');}
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
  {editable&&<form className="diary-editor" onSubmit={event=>{event.preventDefault();void mutate({action:'diarySave',id:editing,title,body});}}>
   <p>投稿はプロフィールを見ている利用者に公開されます。</p>
   <label>タイトル<input required maxLength={80} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
   <label>本文<textarea required maxLength={2000} value={body} disabled={busy} onChange={e=>setBody(e.target.value)}/></label>
   <div className="actions"><button className="primary" disabled={busy}>{editing?'編集を保存して公開':'日記を公開'}</button>
   {editing&&<button className="secondary" type="button" disabled={busy} onClick={reset}>編集をやめる</button>}</div>
  </form>}
  {error&&<p role="alert">{error}<button className="secondary" onClick={()=>setVersion(n=>n+1)}>再読み込み</button></p>}
  {notice&&<p role="status">{notice}</p>}
  {loading?<p role="status">日記を読み込み中…</p>:!error&&<>
   {!posts.length&&<p>日記はまだありません。</p>}
   <div className="diary-posts">{posts.map(post=><article key={post.id} className="diary-post">
    <time dateTime={new Date(post.created).toISOString()}>{format.format(post.created)}</time>
    <h3>{post.title}</h3><p>{post.body}</p>
    {editable&&<div className="actions">
     <button className="secondary" disabled={busy} onClick={()=>{setEditing(post.id);setTitle(post.title);setBody(post.body);}}>編集する</button>
     <button className="secondary" disabled={busy} onClick={()=>{if(confirm('この日記を削除しますか？'))void mutate({action:'diaryDelete',id:post.id});}}>削除する</button>
    </div>}
   </article>)}</div>
   {(page>0||hasNext)&&<div className="member-pagination"><button className="secondary" disabled={page===0||busy} onClick={()=>setPage(n=>n-1)}>前へ</button><span>{page+1}ページ</span><button className="secondary" disabled={!hasNext||busy} onClick={()=>setPage(n=>n+1)}>次へ</button></div>}
  </>}
 </section>;
}
