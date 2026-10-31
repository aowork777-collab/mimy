'use client';
import {useState} from 'react';
import {InfoShell} from '../../components/info-shell';
const faqs=[
 ['はじめ方','誰が利用できますか？','18歳以上の方が利用できます。予約やチャットにはChatGPTアカウントでのログインが必要です。年齢確認は現在、自己申告です。'],
 ['予約','予約するには？','ホームでキャストを選び、コース・時間・空き枠を指定します。確認事項に同意して仮押さえし、10分以内に「テスト決済で確定」を押してください。日時は日本時間です。'],
 ['予約','仮押さえが切れたら？','10分を過ぎると確定できなくなります。空き枠から選び直してください。他の利用者が先に予約した枠は選べません。'],
 ['予約','キャンセルできますか？','「予約・メッセージ」で対象の予約を開き、「予約を取り消す」を押します。仮押さえ中または確定済みの予約が対象です。現在は実請求がないため、実際の返金も発生しません。'],
 ['料金','表示金額は請求されますか？','現在はテスト決済のみです。表示金額はプランの設定額で、実際の請求は行いません。実課金開始前に料金・支払い・キャンセル条件を案内します。'],
 ['通話','ビデオ通話の始め方は？','確定した予約の開始時刻に、客と担当キャストがそれぞれ予約画面から参加します。マイクを許可してください。映像を送る場合は「カメラをオン」を押してカメラを許可します。LINEではなくブラウザー内の通話です。'],
 ['通話','音が聞こえない・映像が出ない','ブラウザーのマイク・カメラ許可、端末の音量、ミュート、相手のカメラ状態を確認してください。他のアプリが機器を使用していないか確認し、改善しない場合は退出して再参加します。イヤホンの使用もお試しください。'],
 ['通話','参加できないのはなぜ？','予約が未確定、開始前、終了後、取消済み、担当キャストが停止中の場合は参加できません。予約の当事者以外も参加できません。無料枠の上限や通信障害で接続できない場合もあります。'],
 ['安全','会話は録画されますか？','mimy.には録音・録画機能を実装していません。ただし相手側の端末による録画を防ぐ仕組みではありません。住所や連絡先などの個人情報を不用意に伝えないでください。'],
 ['安全','不快な言動や問題があったら？','通話の「退出する」で会話を終了できます。予約詳細の「運営に問題を報告する」から内容を送信すると管理者の報告一覧に保存されます。即時対応や返信時間は保証されません。'],
 ['キャスト','キャストになるには？','利用者アカウントの「アカウント」で公開名・自己紹介を入力して申請します。管理者の承認後、「プロフィール・シフト」から空き枠を登録できます。'],
 ['アカウント','管理者・キャストに自分で切り替えられますか？','設定画面から権限は変更できません。キャストは運営の承認、管理者はサーバー側の指定によって決まります。']
];
export default function Help(){const[query,setQuery]=useState(''),[category,setCategory]=useState('すべて');const found=faqs.filter(([c,q,a])=>(category==='すべて'||category===c)&&(q+a+c).includes(query.trim()));return <InfoShell title="ヘルプ・よくある質問" label="WE ARE HERE TO HELP"><section className="help-intro"><h2>困ったときも、あなたのペースで。</h2><p>予約から通話まで、使い方をご案内します。</p><label>質問を検索<input type="search" placeholder="予約、カメラ、料金…" value={query} onChange={e=>setQuery(e.target.value)}/></label></section><div className="help-categories" aria-label="質問のカテゴリ">{['すべて',...new Set(faqs.map(f=>f[0]))].map(c=><button key={c} className={'secondary '+(category===c?'selected':'')} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div><p className="muted" role="status">{found.length}件の質問</p><div className="faq-list">{found.map(([c,q,a])=><details key={q}><summary><small>{c}</small>{q}</summary><p>{a}</p></details>)}{!found.length&&<p className="empty">一致する質問がありません。別の言葉で検索してください。</p>}</div><section className="panel" id="call"><h2>通話前のチェック</h2><ol><li>予約を確定し、開始時刻を確認する</li><li>ブラウザーでマイクを許可する</li><li>音量と通信状況を確認する</li><li>映像を送るときだけカメラをオンにする</li></ol></section><section className="panel"><h2>運営への報告</h2><p>予約に関する問題はホームの「予約・メッセージ」→予約詳細→「運営に問題を報告する」から送信できます。</p><a className="primary" href="/">予約画面へ進む</a><p className="muted">予約に紐づかない一般のお問い合わせ窓口は準備中です。現在このページからメールや問い合わせを送信する機能はありません。</p></section></InfoShell>}
