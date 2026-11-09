'use client';
import {useEffect,useState,useRef} from 'react';
import {InfoShell} from '../../../components/info-shell';
export default function Confirm(){
 const initialized=useRef(false);
 const [link,setLink]=useState<{token_hash:string;type:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(initialized.current)return;initialized.current=true;const p=new URLSearchParams(location.search);setLink({token_hash:p.get('token_hash')||'',type:p.get('type')||''});history.replaceState(null,'',location.pathname)},[]);
 async function verify(){if(!link)return;setBusy(true);setError('');try{const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',...link})});const d=await r.json() as {error?:string;next:string};if(!r.ok)throw Error(d.error);location.assign(d.next)}catch(e){setError((e as Error).message);setBusy(false)}}
 return <InfoShell title="メールアドレスの確認" label="WELCOME TO MIMY."><section className="panel auth-panel"><h2>{link?.type==='recovery'?'パスワードを再設定する':'登録を完了する'}</h2><p>ご自身がmimy.で申し込んだメールであることを確認して、次へお進みください。</p>{link?.token_hash?<button className="primary" disabled={busy} onClick={verify}>{busy?'確認中…':'確認して進む'}</button>:<p>メール内のリンクから開いてください。</p>}{error&&<p className="alert" role="alert">{error}</p>}<a href="/login">ログイン画面へ戻る</a></section></InfoShell>
}
