# 利用ツールと運用先

## 公開サイトを動かすサービス

| サービス | mimy.での役割 | 困ったときに見る場所 |
| --- | --- | --- |
| [XServerドメイン](https://www.xdomain.ne.jp/) | 独自ドメインの契約とDNS管理。サイト用のCNAME・確認用TXTと、メール送信用のレコードを管理 | サイトの名前解決や送信元ドメインの認証に失敗したらDNSレコード設定 |
| ChatGPT Sites | サイトのバージョン保存、公開、独自ドメインの接続、実行時の環境変数の管理 | サイト設定・デプロイ結果・Workerログ |
| [Cloudflare Workers](https://dash.cloudflare.com/) | Webサイトのサーバー処理を実行。通話終了には別のWorkerとDurable Objectを使用する設計 | サイト本体の障害はSites。専用通話終了Workerのログは、そのWorkerを置いたCloudflare側 |
| Cloudflare D1 | 会員・権限・シフト・予約・メッセージ・日記・決済記録を保存するSQLデータベース | Sites側のDBバインディング `DB` とマイグレーション |
| Cloudflare R2 | アップロード画像を保存するオブジェクトストレージ。画像の参照先はD1に記録 | Sites側のR2バインディング `BUCKET`、写真API |
| [Supabase Auth](https://supabase.com/dashboard) | メール・パスワードによる認証、確認リンク、再設定、セッション | Authenticationの利用者・URL設定・メールテンプレート・SMTP設定 |
| [Resend](https://resend.com/domains) | Supabaseが送る登録確認・パスワード再設定メールのSMTP配信。送信元には `auth.example-jp.com` を設定 | 送信元ドメインの認証状態、メール配信ログ |
| [LiveKit Cloud](https://cloud.livekit.io/) | 利用者とキャストの音声・映像を通話ルーム内で中継 | プロジェクト設定、接続状況。参加できない場合はmimy.側の予約状態・通話終了Workerも確認 |
| [Stripe](https://dashboard.stripe.com/) | Checkoutの支払い画面と決済結果のWebhook。現在はサンドボックスを使用 | ワークベンチの「ログ」でCheckout作成、「Webhook」でサイトへの通知を確認 |

公開URLは `mimy.example-jp.com` です。Sitesから発行された `tsukino-talk-1025.haru-stoko.chatgpt.site` は同じサイトの別ホスト名です。ログインCookieはホストごとに保存されるため、動作確認では公開URLにそろえるとアカウントの混同を避けられます。Resend用の `auth.example-jp.com` は送信元ドメインです。

## 開発で使うツール

| ツール | 役割 | 設定や使い方を確認する場所 |
| --- | --- | --- |
| Git / [GitHub](https://github.com/aowork777-collab/mimy) | ソース・設計書・変更履歴の管理と共有 | `main` のコミット履歴。サイト公開はSitesで別途実行 |
| VS Code / WSL | ファイル編集とターミナル。WindowsではWSL側でNode.js・Gitを実行できる | [最初のセットアップ](local-development.md) |
| Node.js / pnpm | ローカルの実行環境と、依存パッケージのインストール・コマンド実行 | [package.json](../../package.json)・`pnpm-lock.yaml` |
| TypeScript / React | 型付きのコードと画面コンポーネント | `app/`・`components/`・`lib/` |
| Vinext / Vite | Next.js形式のルートを使い、開発サーバーとWorkers用ビルドを提供 | [vite.config.ts](../../vite.config.ts)・[実行スクリプト](../../scripts/run-framework.mjs) |
| Wrangler / Drizzle Kit | ローカルD1へのSQL適用、専用Workerのデプロイ、DBの変更履歴作成 | [wrangler.local.jsonc](../../wrangler.local.jsonc)・[db/schema.ts](../../db/schema.ts)・`drizzle/` |
| Codex / GitHub・Sites連携 | コードの調査・編集・テスト、GitHubへの反映、Sitesの公開と調査を支援 | 公開後のアプリは上の運用サービスで動く |

## 症状から調べる場所を選ぶ

| 症状 | 最初の確認 |
| --- | --- |
| 公開URLが開けない | XServerのDNSとSitesの独自ドメイン接続。Sites発行URLも開いて比較する |
| 確認メールが届かない | Supabaseの認証ログとResendの配信履歴 |
| メール内リンクで404 | SupabaseのSite URLと確認テンプレートが `/auth/confirm` を指すか確認 |
| キャストなのに利用者画面になる | 同じURL・ログイン方法か確認し、アカウント画面のID、キャスト承認状態を照合。「ゲスト」は初期表示名としても使われる |
| 決済画面が開かない | 予約の期限とページ上部のエラーを確認。Stripeの `POST /v1/checkout/sessions` があればレスポンス本文、なければSitesのWorkerログを確認 |
| Stripeで支払ったが予約が仮押さえのまま | Stripeのイベント配信結果とSitesの `/api/stripe/webhook` の応答。リダイレクトで戻っただけでは予約は確定しない |
| 通話に入れない | 予約状態・開始時刻・ブラウザーの権限・LiveKit・専用Workerの接続を確認 |

調査メモには、発生日時、URL、HTTPステータス、エラー文、リクエストIDを残すと原因を追いやすくなります。Cookie、トークン、APIキー、利用者情報は共有前に伏せます。
