'use client';
import {useState} from 'react';
export type GuestProfileData={bio:string;topics:string;style:string};
export function GuestProfile({profile}:{profile:GuestProfileData|null}){
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 return <section className="panel">
  <h3>ゲストプロフィール</h3>
  <p>すべて任意です。空欄のまま保存できます。現在はご自身のアカウント内に保存されます。</p>
  <form onSubmit={async event=>{
   event.preventDefault();
   const form=new FormData(event.currentTarget);
   setBusy(true);setMessage('');
   try{
    const response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     action:'guestProfile',bio:form.get('bio'),topics:form.get('topics'),style:form.get('style'),
    })});
    const data=await response.json() as {error?:string};
    if(!response.ok)throw Error(data.error||'保存できませんでした。');
    setMessage('プロフィールを保存しました。');
   }catch(error){setMessage((error as Error).message);}
   finally{setBusy(false);}
  }}>
   <label>自己紹介（任意・500文字まで）<textarea name="bio" defaultValue={profile?.bio||''} maxLength={500}/></label>
   <label>好きな話題・趣味（任意・100文字まで）<input name="topics" defaultValue={profile?.topics||''} maxLength={100}/></label>
   <label>希望する会話の雰囲気（任意・100文字まで）<input name="style" defaultValue={profile?.style||''} maxLength={100} placeholder="ゆっくり話したい、聞いてほしい、など"/></label>
   <button className="primary" disabled={busy}>{busy?'保存中…':'プロフィールを保存'}</button>
  </form>
  <p role="status">{message}</p>
 </section>;
}
