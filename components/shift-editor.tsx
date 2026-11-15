'use client';
import {useState} from 'react';

export function ShiftEditor({busy,onSave}:{busy:boolean;onSave:(starts:number,ends:number)=>Promise<boolean>}){
 const [day,setDay]=useState('');
 const [startTime,setStartTime]=useState('20:00');
 const [endTime,setEndTime]=useState('22:00');
 const [error,setError]=useState('');
 const overnight=endTime<=startTime;
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  setError('');
  const starts=Date.parse(day+'T'+startTime+':00+09:00');
  const ends=Date.parse(day+'T'+endTime+':00+09:00')+(overnight?86400000:0);
  if(!Number.isFinite(starts)||starts%1800000!==0||ends%1800000!==0){
   setError('開始・終了時刻は00分または30分を選んでください。');
   return;
  }
  await onSave(starts,ends);
 }
 return <section className="panel">
  <h3>シフトを追加</h3>
  <p className="muted">会話できる時間の範囲を、30分単位で登録します。時刻は日本時間です。</p>
  <form onSubmit={submit}>
   <div className="shift-range-fields">
    <label>開始日<input type="date" value={day} onChange={e=>setDay(e.target.value)} required disabled={busy}/></label>
    <label>開始時刻<input type="time" step={1800} value={startTime} onChange={e=>setStartTime(e.target.value)} required disabled={busy}/></label>
    <label>終了時刻<input type="time" step={1800} value={endTime} onChange={e=>setEndTime(e.target.value)} required disabled={busy}/></label>
   </div>
   <p className="shift-range-summary">{startTime} 〜 {overnight?'翌日 ':''}{endTime}</p>
   <p className="muted">この範囲内で、空いている30分・60分の会話を受け付けます。</p>
   {error&&<p className="alert" role="alert">{error}</p>}
   <button className="primary" disabled={busy||!day}>{busy?'保存中…':'シフトを登録する'}</button>
  </form>
 </section>;
}
