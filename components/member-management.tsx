'use client';

import {useEffect,useState} from 'react';

type Member={id:string;name:string;role:string;blocked:number;block_reason:string;admin_protected:number};
type HistoryKind='reservations'|'purchases';
type HistoryEntry={
 id:string;
 course:string;
 minutes:number;
 price:number;
 status:string;
 cast_name:string;
 customer_name?:string;
 participation?:'customer'|'cast';
 starts?:number;
 created?:number;
 paid_at?:number|null;
 payment_provider?:string;
};
type HistoryResponse={
 member:{id:string;name:string;email:string|null};
 entries:HistoryEntry[];
 hasNext:boolean;
};

const statusNames:Record<string,string>={
 held:'支払い待ち',confirmed:'予約確定',completed:'対応終了',cancelled:'キャンセル',expired:'期限切れ',
};
const dateFormat=new Intl.DateTimeFormat('ja-JP',{
 timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
const priceFormat=new Intl.NumberFormat('ja-JP');

function MemberHistory({memberId,id}:{memberId:string;id:string}){
 const [kind,setKind]=useState<HistoryKind>('reservations');
 const [page,setPage]=useState(0);
 const [attempt,setAttempt]=useState(0);
 const [email,setEmail]=useState<string|null|undefined>(undefined);
 const [result,setResult]=useState<HistoryResponse|null>(null);
 const [error,setError]=useState('');

 useEffect(()=>{
  const controller=new AbortController();
  const params=new URLSearchParams({memberId,history:kind,historyPage:String(page)});
  async function load(){
   try{
    const response=await fetch('/api/workspace?'+params,{signal:controller.signal});
    const data=await response.json() as HistoryResponse & {error?:string};
    if(!response.ok)throw Error(data.error||'詳細を取得できませんでした。');
    if(!controller.signal.aborted){
     setEmail(data.member.email);
     setResult(data);
    }
   }catch(err){
    if(!controller.signal.aborted)setError(err instanceof Error?err.message:'詳細を取得できませんでした。');
   }
  }
  void load();
  return()=>controller.abort();
 },[memberId,kind,page,attempt]);

 function showHistory(nextKind:HistoryKind,nextPage:number){
  if(nextKind===kind&&nextPage===page)return;
  setResult(null);
  setError('');
  setKind(nextKind);
  setPage(nextPage);
 }

 const purchase=kind==='purchases';
 return <div className="member-details" id={id}>
  <div className="member-email">
   <strong>登録メールアドレス</strong>
   <span>{email===undefined?'—':email??'確認済みの登録メール情報がまだありません。'}</span>
  </div>
  <div className="member-history-tabs" role="group" aria-label="表示する履歴">
   <button type="button" className="secondary" aria-pressed={!purchase} onClick={()=>showHistory('reservations',0)}>予約履歴</button>
   <button type="button" className="secondary" aria-pressed={purchase} onClick={()=>showHistory('purchases',0)}>購入履歴</button>
  </div>
  {purchase&&<p className="muted">テスト決済の履歴です。実際の請求は発生していません。</p>}
  {error?<div role="alert">
   <p>{error}</p>
   <button type="button" className="secondary" onClick={()=>{setError('');setAttempt(n=>n+1);}}>再読み込み</button>
  </div>:!result?<p role="status">履歴を読み込み中です。</p>:<>
   {result.entries.length===0?<p role="status">{purchase?'テスト決済の履歴はありません。':'予約履歴はありません。'}</p>:
    <ul className="member-history-list">
     {result.entries.map(entry=><li key={entry.id} className="member-history-row">
      <div className="member-history-title">
       <strong>{entry.participation==='cast'?'予約者 '+entry.customer_name:'キャスト '+entry.cast_name}</strong>
       <span className={'status '+entry.status}>{statusNames[entry.status]??entry.status}</span>
      </div>
      <dl className="member-history-fields">
       {purchase?<><div><dt>テスト決済日時</dt><dd>{entry.paid_at==null?'記録なし':dateFormat.format(entry.paid_at)}</dd></div><div><dt>決済方法</dt><dd>{entry.payment_provider==='stripe_test'?'Stripeテスト':'デモ決済'}</dd></div></>:
        <><div><dt>予約日時</dt><dd>{dateFormat.format(entry.starts)}</dd></div>
        <div><dt>予約受付日時</dt><dd>{dateFormat.format(entry.created)}</dd></div></>}
       <div><dt>コース</dt><dd>{entry.course}・{entry.minutes}分</dd></div>
       <div><dt>{purchase?'テスト決済額':'予約金額'}</dt><dd>{priceFormat.format(entry.price)}円</dd></div>
       <div><dt>予約ID</dt><dd>{entry.id}</dd></div>
      </dl>
     </li>)}
    </ul>}
   {(page>0||result.hasNext)&&<div className="member-pagination" aria-label="履歴のページ">
    <button type="button" className="secondary" disabled={page===0} onClick={()=>showHistory(kind,page-1)}>前へ</button>
    <span>{page+1}ページ</span>
    <button type="button" className="secondary" disabled={!result.hasNext} onClick={()=>showHistory(kind,page+1)}>次へ</button>
   </div>}
  </>}
 </div>;
}

export function MemberManagement(){
 const [items,setItems]=useState<Member[]>([]);
 const [page,setPage]=useState(0);
 const [search,setSearch]=useState('');
 const [memberRole,setMemberRole]=useState('user');
 const [total,setTotal]=useState(0);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [expanded,setExpanded]=useState<string|null>(null);
 const [listVersion,setListVersion]=useState(0);

 useEffect(()=>{
  const controller=new AbortController();
  const params=new URLSearchParams({membersPage:String(page),memberSearch:search,memberRole});
  async function load(){
   try{
    const response=await fetch('/api/workspace?'+params,{signal:controller.signal});
    const data=await response.json() as {error?:string;members?:Member[];memberTotal?:number};
    if(!response.ok)throw Error(data.error||'アカウントを取得できませんでした。');
    if(!controller.signal.aborted){
     setItems(data.members||[]);
     setTotal(data.memberTotal||0);
    }
   }catch(err){
    if(!controller.signal.aborted)setMessage(err instanceof Error?err.message:'アカウントを取得できませんでした。');
   }
  }
  void load();
  return()=>controller.abort();
 },[page,search,memberRole,listVersion]);

 async function toggle(member:Member){
  const reason=member.blocked?'':prompt('利用停止の理由を入力してください（200文字以内）');
  if(reason===null||(!member.blocked&&!reason.trim()))return;
  if(!confirm(member.blocked?'利用停止を解除しますか？取り消した予約は元に戻りません。':'このアカウントを停止し、未完了の予約を取り消しますか？'))return;
  setBusy(true);
  setMessage('');
  try{
   const response=await fetch('/api/workspace',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'memberBlock',target:member.id,blocked:!member.blocked,reason}),
   });
   const data=await response.json() as {error?:string;warning?:string};
   if(!response.ok)throw Error(data.error||'アカウントを更新できませんでした。');
   setMessage(data.warning||'更新しました。');
   setExpanded(null);
   setListVersion(n=>n+1);
  }catch(err){
   setMessage(err instanceof Error?err.message:'アカウントを更新できませんでした。');
  }finally{
   setBusy(false);
  }
 }

 return <section className="panel">
  <h2>登録アカウントの管理</h2>
  <p>利用停止中は予約・メッセージ・通話などを利用できません。履歴は削除せず保管します。</p>
  <div className="member-history-tabs" role="group" aria-label="アカウントの役割">
   {[['user','ゲスト'],['cast','キャスト'],['admin','管理者']].map(([value,label])=><button key={value} className="secondary" aria-pressed={memberRole===value} onClick={()=>{setMemberRole(value);setPage(0);setItems([]);setExpanded(null);}}>{label}</button>)}
  </div>
  <label>表示名・アカウントIDで検索
   <input disabled={busy} value={search} maxLength={100} onChange={e=>{
    setSearch(e.target.value);
    setPage(0);
    setExpanded(null);
   }}/>
  </label>
  <p role="status">{message}</p>
  {items.map(member=>{
   const isOpen=expanded===member.id;
   const detailId='member-details-'+member.id;
   return <div className="application" key={member.id}>
    <h3>{member.name} <span className="status">{member.blocked?'利用停止':member.admin_protected?'管理者':member.role==='cast'?'キャスト':'ゲスト'}</span></h3>
    <small>{member.id}</small>
    {member.blocked&&<p>理由：{member.block_reason}</p>}
    <div className="actions">
     <button type="button" className={isOpen?'secondary':'primary'} aria-expanded={isOpen}
      aria-controls={isOpen?detailId:undefined} onClick={()=>setExpanded(isOpen?null:member.id)}>
      {isOpen?'アカウント詳細を閉じる':'アカウント詳細を見る'}
     </button>
     <button type="button" className="secondary" disabled={busy||!!member.admin_protected} onClick={()=>void toggle(member)}>
      {member.blocked?'利用停止を解除':'違反アカウントを停止'}
     </button>
    </div>
    {isOpen&&<MemberHistory memberId={member.id} id={detailId}/>}
   </div>;
  })}
  <div className="member-pagination" aria-label="登録アカウントのページ">
   <button type="button" className="secondary" disabled={busy||page===0} onClick={()=>{setPage(p=>p-1);setExpanded(null);}}>前へ</button>
   <span>{page+1}ページ ／ {total}件</span>
   <button type="button" className="secondary" disabled={busy||(page+1)*50>=total} onClick={()=>{setPage(p=>p+1);setExpanded(null);}}>次へ</button>
  </div>
 </section>;
}
