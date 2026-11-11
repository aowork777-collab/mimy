export const casts = [
 {id:'aoi',name:'あおい',en:'AOI',color:'#d9e6dc',icon:'☘',tag:'ゆっくり、自然体で',desc:'何気ない一日のことから、言葉にしにくい気持ちまで。あなたのペースでお話ししましょう。',topics:['聞き上手','映画','日常の話'],type:'雑談'},
 {id:'hinata',name:'ひなた',en:'HINATA',color:'#f4dfc7',icon:'☀',tag:'話すことが、楽しみになる',desc:'沈黙があっても大丈夫。好きなことを一緒に見つけながら、会話を楽しみませんか。',topics:['明るい','旅行','初めて歓迎'],type:'雑談'},
 {id:'shiori',name:'しおり',en:'SHIORI',color:'#e0daeb',icon:'✧',tag:'小さな自信を、一つずつ',desc:'質問の広げ方や聞き方を、一緒に練習。最後に良かったところと次の一歩をお伝えします。',topics:['会話練習','落ち着いた','振り返り'],type:'会話練習'}
];
export const plans=[{minutes:30,price:1990,label:'30分トーク'},{minutes:60,price:3980,label:'60分トーク'}];
export const pricingTiers=[{id:'new',label:'新人',prices:{30:1990,60:3980}},{id:'popular',label:'人気',prices:{30:2990,60:5980}}] as const;
export function priceFor(tier:string,minutes:number){
 const plan=pricingTiers.find(p=>p.id===tier);
 return plan&&(minutes===30||minutes===60)?plan.prices[minutes]:null;
}
export const termsVersion='2026-10-25-test-v1';
export function slotOptions(){const base=new Date();const day=new Date(base.getTime()+9*3600000).toISOString().slice(0,10);return Array.from({length:7},(_,i)=>{const d=new Date(day+'T00:00:00+09:00');d.setUTCDate(d.getUTCDate()+i);return new Date(d.getTime()+9*3600000).toISOString().slice(0,10);}).flatMap(d=>['19:00','20:00','21:00','22:00'].map(t=>d+'T'+t+':00+09:00')).filter(s=>Date.parse(s)>Date.now()+15*60000);}
