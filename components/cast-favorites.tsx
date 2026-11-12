'use client';
import {useEffect,useState} from 'react';
import {Heart} from 'lucide-react';

export function FavoriteButton({castId,selected,onChange}:{castId:string;selected:boolean;onChange:()=>Promise<void>}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 return <div className="favorite-control">
  <button type="button" className="favorite-button" aria-pressed={selected} disabled={busy} onClick={async()=>{
   setBusy(true);setError('');
   try{
    const response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'favorite',castId,enabled:!selected})});
    const data=await response.json() as {error?:string};
    if(!response.ok)throw Error(data.error||'推しの設定を保存できませんでした。');
    await onChange();
   }catch(err){setError((err as Error).message);}
   finally{setBusy(false);}
  }}>
   <Heart size={18} fill={selected?'currentColor':'none'}/>{busy?'保存中…':selected?'推し登録済み · 解除する':'この人を推す'}
  </button>
  <small>推すと表示名がキャストに伝わります。</small>
  {error&&<p role="alert">{error}</p>}
 </div>;
}

export function CastFans(){
 const [page,setPage]=useState(0);
 const [version,setVersion]=useState(0);
 const [data,setData]=useState<{names:string[];count:number;hasNext:boolean}|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  setData(null);setError('');
  async function load(){
   try{
    const response=await fetch('/api/workspace?fans=1&page='+page,{signal:controller.signal});
    const result=await response.json() as {names:string[];count:number;hasNext:boolean;error?:string};
    if(!response.ok)throw Error(result.error||'応援者を取得できませんでした。');
    if(!controller.signal.aborted)setData(result);
   }catch(err){if(!controller.signal.aborted)setError((err as Error).message);}
  }
  void load();
  return()=>controller.abort();
 },[page,version]);
 return <section className="panel cast-fans">
  <div className="name-line"><h2>あなたを推している人</h2><button className="secondary" onClick={()=>setVersion(n=>n+1)}>更新</button></div>
  {error?<p role="alert">{error}</p>:data?<>
   <p className="fan-count"><strong>{data.count}</strong>人</p>
   {!data.names.length?<p>まだ推し登録はありません。</p>:<ul className="fan-names">{data.names.map((name,index)=><li key={index}>{name}</li>)}</ul>}
   {(page>0||data.hasNext)&&<div className="member-pagination"><button className="secondary" disabled={!page} onClick={()=>setPage(n=>n-1)}>前へ</button><span>{page+1}ページ</span><button className="secondary" disabled={!data.hasNext} onClick={()=>setPage(n=>n+1)}>次へ</button></div>}
  </>:<p role="status">読み込み中…</p>}
 </section>;
}
