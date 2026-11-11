'use client';

import {ArrowDown,Clock3,Headphones,Video} from 'lucide-react';
import {pricingTiers} from '../lib/catalog';

export type BookingDuration = 30 | 60;

type PricingSectionProps = {
  castName: string;
  tierId: string;
  duration: BookingDuration;
  onDurationChange: (duration: BookingDuration) => void;
};

export function PricingSection({castName,tierId,duration,onDurationChange}: PricingSectionProps){
  const tier = pricingTiers.find(plan => plan.id === tierId);
  if (!tier) return null;

  const alternateDuration = duration === 30 ? 60 : 30;
  return (
    <section className="pricing-overview booking-pricing" aria-labelledby="pricing-title">
      <div className="pricing-heading">
        <div>
          <p className="pricing-kicker">ふたりの時間を選ぶ</p>
          <h2 id="pricing-title">{castName}と過ごす、<br/><em>ちょうどいいひととき。</em></h2>
        </div>
        <div className="pricing-intro">
          <div className="pricing-includes"><span><Headphones size={15}/>音声通話</span><span><Video size={15}/>ビデオ通話</span></div>
        </div>
      </div>
      <div className="pricing-duration" role="group" aria-label="予約する通話時間">
        {([30,60] as const).map(minutes => (
          <button type="button" key={minutes} aria-pressed={duration === minutes} onClick={() => onDurationChange(minutes)}>
            <Clock3 size={15}/>{minutes}分<span>{minutes === 30 ? '気軽なひととき' : 'ゆっくり話す'}</span>
          </button>
        ))}
      </div>
      <article className={'pricing-card '+(tier.id === 'popular' ? 'pricing-card-popular' : '')}>
        <div className="pricing-card-top">
          <span className="pricing-tier">{tier.label}</span>
          <span className="pricing-card-time">{duration}分のプライベート通話</span>
        </div>
        <p className="pricing-amount" aria-live="polite">
          <span>¥</span><strong>{tier.prices[duration].toLocaleString()}</strong><small>／ {duration}分</small>
        </p>
        <div className="pricing-alternate">
          <span>{alternateDuration}分の料金</span><strong>¥{tier.prices[alternateDuration].toLocaleString()}</strong>
        </div>
        <a className="pricing-cta" href="#reservation-details">日時・コースを選ぶ<ArrowDown size={19}/></a>
      </article>
    </section>
  );
}
