'use client';

import {useState} from 'react';
import {ArrowUpRight,Headphones,Video,Clock3} from 'lucide-react';
import {pricingTiers} from '../lib/catalog';

export function PricingSection(){
 const [duration,setDuration]=useState<30|60>(30);
 return <section className="pricing-overview" aria-labelledby="pricing-title">
  <div className="pricing-heading">
   <div><p className="pricing-kicker">ふたりの時間を選ぶ</p><h2 id="pricing-title">今日の気分に、<br/><em>ちょうどいいひととき。</em></h2></div>
   <div className="pricing-intro"><p>気になるキャストと、あなたのペースで。<br/>音声でも、顔を見ながらでも。</p><div className="pricing-includes"><span><Headphones size={15}/>音声通話</span><span><Video size={15}/>ビデオ通話</span></div></div>
  </div>
  <div className="pricing-duration" role="group" aria-label="料金を表示する通話時間">
   {([30,60] as const).map(minutes=><button type="button" key={minutes} aria-pressed={duration===minutes} onClick={()=>setDuration(minutes)}><Clock3 size={15}/>{minutes}分<span>{minutes===30?'気軽なひととき':'ゆっくり話す'}</span></button>)}
  </div>
  <div className="pricing-cards">
   {pricingTiers.map(tier=><article className={'pricing-card '+(tier.id==='popular'?'pricing-card-popular':'')} key={tier.id}>
    <div className="pricing-card-top"><span className="pricing-tier">{tier.label}</span><span className="pricing-card-time">{duration}分のプライベート通話</span></div>
    <h3>{tier.id==='new'?'はじめましてから、少しずつ。':'お気に入りと、心ほどける時間。'}</h3>
    <p className="pricing-card-description">{tier.id==='new'?'新しく参加したキャストと、お互いを知る時間に。':'人気キャストとの会話を、あなたの特別な時間に。'}</p>
    <p className="pricing-amount" aria-live="polite"><span>¥</span><strong>{tier.prices[duration].toLocaleString()}</strong><small>／ {duration}分</small></p>
    <div className="pricing-alternate"><span>{duration===30?'もう少しゆっくり、60分なら':'気軽に話せる30分なら'}</span><strong>¥{tier.prices[duration===30?60:30].toLocaleString()}</strong></div>
    <a className="pricing-cta" href="#partners">キャストと空き時間を見る<ArrowUpRight size={19}/></a>
   </article>)}
  </div>
  <p className="pricing-note">表示額が予約金額です。現在はデモ決済のため、実際の請求は発生しません。</p>
 </section>;
}
