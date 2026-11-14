# コードの地図と読み方

[設計書](architecture.md) · [セットアップ](local-development.md) · [運用先](services.md)

## フォルダで探す

| 場所 | 何が入っているか | 最初に開くファイル |
| --- | --- | --- |
| `app/` | URLごとの画面、共通の見た目 | [トップ・予約一覧](../../app/page.tsx)、[共通CSS](../../app/globals.css) |
| `app/api/` | HTTPリクエストを受け付ける入口 | [予約・会員API](../../app/api/workspace/route.ts) |
| `components/` | 画面を構成するフォーム・一覧・通話UI | [キャスト一覧](../../components/cast-directory.tsx)、[料金表示](../../components/pricing-section.tsx) |
| `lib/` | 認証、権限、予約、決済、写真などの処理 | [予約・会員の処理](../../lib/workspace-service.ts) |
| `db/`・`drizzle/` | DB定義と適用順のある変更履歴 | [テーブル定義](../../db/schema.ts)、[Stripeの変更履歴](../../drizzle/0013_stripe_sandbox.sql) |
| `worker/`・`infrastructure/` | サイトのWorker入口と、別途運用する通話終了Worker | [サイト入口](../../worker/index.ts)、[通話終了Worker](../../infrastructure/call-guard/index.ts) |
| `tests/` | 一時SQLiteと外部通信のモックで動かすテスト | [予約・権限など](../../tests/service.test.mjs) |
| `public/` | リポジトリと一緒に配信する固定画像など | 利用者のアップロードはR2を参照 |
| `scripts/`・`.openai/` | 起動・ビルドの補助とSitesの公開設定 | [実行スクリプト](../../scripts/run-framework.mjs)、[Sites設定](../../.openai/hosting.json) |
| `examples/` | スターター由来のD1のサンプル | 実際の予約機能は `app/api/workspace/` と `lib/workspace-service.ts` |

## 変えたい機能から探す

| 機能 | 画面・UI | サーバー処理・設定 |
| --- | --- | --- |
| 登録・ログイン・再設定 | [ログイン](../../app/login/page.tsx)、[メール確認](../../app/auth/confirm/page.tsx) | [認証API](../../app/api/auth/route.ts)、[メール認証](../../lib/email-auth.ts) |
| キャストを探す・プロフィールを見る | [一覧と詳細UI](../../components/cast-directory.tsx)、[プロフィール画面](../../app/cast/page.tsx) | `GET /api/workspace` の `casts`・`shifts` |
| 表示名・ゲストプロフィール・シフト | [共通画面](../../app/page.tsx)、[ゲストプロフィール](../../components/guest-profile.tsx) | `profile`・`guestProfile`・`castProfile`・`shiftAdd`・`shiftToggle` |
| 日記・推し登録 | [日記](../../components/cast-diary.tsx)、[推し登録](../../components/cast-favorites.tsx) | `diarySave`・`diaryDelete`・`favorite`、[日記写真API](../../app/api/diary-photo/route.ts) |
| キャスト写真 | [写真選択UI](../../components/photo-picker.tsx) | [プロフィール写真](../../lib/photo-service.ts)、[メタデータ除去](../../lib/photo-sanitizer.ts) |
| 料金と予約 | [予約ページ](../../app/reserve/page.tsx)、[料金UI](../../components/pricing-section.tsx) | [料金定義](../../lib/catalog.ts)、`reserve`・`cancel` |
| Stripe決済 | [予約一覧の決済ボタン](../../app/page.tsx) | `pay`、[決済処理](../../lib/stripe-payment.ts)、[Webhook入口](../../app/api/stripe/webhook/route.ts) |
| チャット・通話 | [予約一覧の会話欄](../../app/page.tsx)、[通話UI](../../components/voice-call.tsx) | `message`、[通話参加処理](../../lib/call-service.ts)、[通話終了Worker](../../infrastructure/call-guard/index.ts) |
| 管理者の操作 | [会員検索・履歴](../../components/member-management.tsx)、[招待](../../components/admin-invitations.tsx)、[招待の承諾](../../app/admin-invite/page.tsx) | `memberBlock`・`adminInvite*`・`review`・`pricingTier`、`GET /api/workspace?memberId=…` |
| FAQ・設定・利用規約 | [ヘルプ](../../app/help/page.tsx)、[設定](../../app/settings/page.tsx)、[規約](../../app/terms/page.tsx)、[プライバシー](../../app/privacy/page.tsx) | [表示設定](../../components/preferences.tsx) |

表の `reserve` や `message` は、`POST /api/workspace` のJSONにある `action` 値です。[処理本体](../../lib/workspace-service.ts)でその文字列を検索すると、権限チェック、入力チェック、SQLがまとまった箇所に移動できます。`/cast` と `/reserve` は [app/page.tsx](../../app/page.tsx) の画面コンポーネントを切り替えて使っています。

## 例：「Stripeでテスト決済へ進む」ボタンを追う

VS Codeのファイル横断検索（`Ctrl+Shift+F`）でボタンの文字列を検索します。ターミナルなら、リポジトリのルートから次を実行できます。

```bash
rg -n 'Stripeでテスト決済へ進む' app components
rg -n "a.action==='pay'|startStripeCheckout" lib
rg -n 'handleStripeWebhook' app/api lib
```

1. [app/page.tsx](../../app/page.tsx) のクリック処理が `action: 'pay'` と予約IDを送る。
2. [workspaceのルート](../../app/api/workspace/route.ts) がログインを確認し、[処理本体](../../lib/workspace-service.ts) が予約者本人か確認する。
3. [決済処理](../../lib/stripe-payment.ts) がCheckout URLを返し、画面がStripeへ遷移する。
4. 支払い結果が [Webhook](../../app/api/stripe/webhook/route.ts) に届くと、検証後に予約状態が更新される。

画面で何が送られたかを見るには、ブラウザー開発者ツールの「ネットワーク」で `/api/workspace` を選び、リクエストの `action` とレスポンスのエラーを確認します。

## テストの選び方

| 変更した機能 | コマンド |
| --- | --- |
| ログイン、確認メールからの認証、旧アカウント移行 | `node --test tests/email-auth.test.mjs` |
| 会員、キャスト、予約、Stripe、写真、チャット、日記 | `node --test tests/service.test.mjs` |
| 通話終了のタイマーや再試行 | `node --test tests/call-guard.test.mjs` |
| 複数箇所の変更 | `node --test tests/*.test.mjs` |

メールの実配信、Stripeの実際のサンドボックス画面とWebhook配送、2端末間の通話は、各サービスを接続した環境でも確認します。
