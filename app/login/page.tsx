'use client';
import {useEffect,useState} from 'react';
import {InfoShell} from '../../components/info-shell';
type Mode='login'|'signup'|'reset'|'password';
export default function Login(){
 const [mode,setMode]=useState<Mode>('login'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const m=new URLSearchParams(location.search).get('mode');if(m==='password'||m==='reset'||m==='signup')setMode(m)},[]);
 function change(m:Mode){setMode(m);setMessage('');setError('')}
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage('');setError('');const f=new FormData(e.currentTarget);
 try{const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:mode,email:f.get('email'),password:f.get('password')})});const d=await r.json() as {error?:string;message?:string};if(!r.ok)throw Error(d.error);
 if(mode==='login'){const dest=new URLSearchParams(location.search).get('return_to')||'/';const url=new URL(dest,location.origin);location.assign(url.origin===location.origin?url.pathname+url.search:'/');return;}
 if(mode==='password'){change('login');setMessage('パスワードを変更しました。新しいパスワードでログインしてください。');return;}
 setMessage(d.message||'確認メールをご確認ください。');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const titles={login:'おかえりなさい。',signup:'mimy.をはじめる',reset:'パスワードをお忘れですか？',password:'新しいパスワードを設定'};
 return <InfoShell title="アカウント" label="YOUR LITTLE PLACE"><section className="panel auth-panel"><h2>{titles[mode]}</h2><p>{mode==='signup'?'メールアドレスを確認すると、予約やチャットをご利用いただけます。':mode==='reset'?'登録したメールアドレスに再設定リンクを送ります。':'メールアドレスとパスワードで、あなたの時間へ。'}</p><form onSubmit={submit} key={mode}>
 {mode!=='password'&&<label>メールアドレス<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy}/></label>}
 {mode!=='reset'&&<label>{mode==='password'?'新しいパスワード':'パスワード'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} maxLength={128} required disabled={busy}/>{mode!=='login'&&<small>12〜128文字。ほかのサービスと異なるパスワードをお使いください。</small>}</label>}
 {mode==='signup'&&<label className="check"><input type="checkbox" required/> <span><a href="/terms" target="_blank" rel="noreferrer">利用規約</a>と<a href="/privacy" target="_blank" rel="noreferrer">プライバシー案内</a>を確認しました</span></label>}
 <button className="primary" disabled={busy}>{busy?'確認中…':mode==='login'?'ログイン':mode==='signup'?'確認メールを送って登録':mode==='reset'?'再設定メールを送る':'パスワードを保存'}</button></form>
 {error&&<p role="alert" className="alert">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 <div className="auth-links">{mode!=='login'&&<button className="secondary" disabled={busy} onClick={()=>change('login')}>ログインへ戻る</button>}{mode==='login'&&<><button className="secondary" disabled={busy} onClick={()=>change('signup')}>はじめての方・新規登録</button><button className="secondary" disabled={busy} onClick={()=>change('reset')}>パスワードを忘れた方</button></>}</div>
 {mode==='login'&&<p className="muted">以前からご利用の方は、引き継ぎのために<a href="/signin-with-chatgpt?return_to=%2Flogin" target="_top">先に従来のアカウントでログイン</a>し、同じメールアドレスでメールログインしてください。</p>}</section></InfoShell>
}
