'use client';
import {useEffect,useState} from 'react';
const KEY='mimy.preferences.v1';
type Preferences={largeText:boolean;reduceMotion:boolean};
const defaults:Preferences={largeText:false,reduceMotion:false};
function read():Preferences{try{const p=JSON.parse(localStorage.getItem(KEY)||'{}');return{largeText:p?.largeText===true,reduceMotion:p?.reduceMotion===true};}catch{return defaults;}}
function apply(p:Preferences){document.documentElement.dataset.largeText=String(p.largeText);document.documentElement.dataset.reduceMotion=String(p.reduceMotion);}
export function PreferenceLoader(){useEffect(()=>{const sync=()=>apply(read());sync();window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);return null;}
export function PreferenceSettings(){const[p,setP]=useState(defaults),[ready,setReady]=useState(false),[message,setMessage]=useState('');useEffect(()=>{setP(read());setReady(true);},[]);
 function save(next:Preferences){setP(next);apply(next);try{localStorage.setItem(KEY,JSON.stringify(next));setMessage('このブラウザーに保存しました。');}catch{setMessage('ブラウザーに保存できませんでした。今回の表示にのみ適用します。');}}
 return <section className="panel"><h2>表示設定</h2><p className="muted">この端末・ブラウザーで共通の設定です。別の端末やアカウントには同期されません。</p><label className="setting-row"><span><strong>文字を大きくする</strong><small>本文・入力欄・操作ボタンを読みやすくします。</small></span><input type="checkbox" disabled={!ready} checked={p.largeText} onChange={e=>save({...p,largeText:e.target.checked})}/></label><label className="setting-row"><span><strong>動きを抑える</strong><small>ボタンの移動や画面のアニメーションを抑えます。</small></span><input type="checkbox" disabled={!ready} checked={p.reduceMotion} onChange={e=>save({...p,reduceMotion:e.target.checked})}/></label><button className="secondary" disabled={!ready} onClick={()=>save(defaults)}>表示設定を初期状態に戻す</button><p role="status">{message}</p></section>;
}
