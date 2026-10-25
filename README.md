# mimy — つきの / TSUKINO

予約制の雑談・会話練習サービスの開発検証版。React 19 / TypeScript / Vinext / Cloudflare Workers / D1。

## 現在の状態

**実運営開始前の検証版です。実決済・実通話は行いません。**

実装済み：ログイン識別子によるサーバー保存、予約枠の10分仮押さえ、重複予約防止、価格のサーバー計算、テスト決済、キャンセルとテスト返金、予約チャット、キャスト対応終了、通報、操作履歴、レスポンシブ画面。

キャスト3名は架空のサンプル。年齢確認は自己申告のみ。利用者・キャスト・運営のタブは所有者が同一データを操作する検証用ビューです。スタッフの本番ロールではありません。予約枠の一意性は sandbox owner + cast + slot。利用者間で共有する本番在庫ではありません。

未接続：決済業者、音声通話、LINE/メール通知、本人確認。未実装：本番スタッフ認可、キャスト採用・シフト編集、実報酬の送金、正式な退会・データ削除、サンプル音声。これらを設定なしで動作するようには装っていません。

## ファイル案内

- `app/page.tsx`: 利用者・キャスト・運営画面
- `app/globals.css`: 配色・余白・レスポンシブスタイル
- `lib/catalog.ts`: サンプルプロフィール・料金プラン・予約候補
- `app/api/service/route.ts`: 予約・テスト決済・チャット・通報API
- `db/schema.ts`: D1テーブル定義
- `drizzle/`: スキーママイグレーション
- `tests/service.test.mjs`: SQLiteでAPIを実行する統合テスト
- `docs/PRODUCTION.md`: 本番化仕様と作業一覧

## 編集方法

Node 22.13以上と、`package.json` に記載されたpnpmを使用します。依存関係は `pnpm install --frozen-lockfile`、画面の開発は `pnpm dev`。Sites環境では `sites-preview start <checkout>` を使用します。

ローカルではSitesの認証ヘッダが付かないため、予約APIはログイン要求を返します。画面編集と下記のSQLite統合テストは可能です。本番の認証・D1接続はSitesで提供される構成です。

`pnpm db:generate` でスキーマ変更の差分を生成し、生成SQLもGitにコミットします。既に適用したmigrationは編集しません。

検証: `node --test tests/service.test.mjs` / `pnpm exec tsc --noEmit` / `pnpm build`。

認証はSitesが提供するヘッダを使用。一般の外部ホストで実行する場合、クライアント由来の同名ヘッダを信頼してはいけません。必ず検証済みセッションから識別子を生成する認証層に置き換えてください。

## Git

保存先: https://github.com/aowork777-collab/mimy

```bash
git clone https://github.com/aowork777-collab/mimy.git
cd mimy
pnpm install --frozen-lockfile
pnpm dev
```

変更後は `git add`、`git commit`、`git push` でこのリポジトリへ保存できます。GitHubのWebエディターでも個々のファイルを編集できます。

GitHubと公開中Sitesのソース管理は別です。GitHubへのpushだけではSitesに自動デプロイされません。公開へ反映するときは、このリポジトリの更新内容をSitesへ取り込んで再ビルド・デプロイしてください。`.openai/hosting.json` は既存Sitesの識別情報を含みます。別サイトへ複製するときは新しいSiteのIDに置き換えます。

APIキー、認証トークン、実顧客データは含めていません。環境変数・ランタイムのデータベース内容はGitへ保存しないでください。

料金を変更する場合は `lib/catalog.ts` を編集。購入時点の料金は `bookings.price` に固定され、過去の予約金額は変わりません。
