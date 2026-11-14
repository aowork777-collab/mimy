# 最初のセットアップ

## 1. リポジトリを開く

必要なのは Git、Node.js **22.13以上**、ターミナルです。VS Codeを使う場合はリポジトリのフォルダを開きます。WindowsでWSLを使う場合は、以下をすべてWSL側のターミナルで実行します。

```bash
git clone https://github.com/aowork777-collab/mimy.git
cd mimy
node -v
npx --yes pnpm@11.25.0 install --frozen-lockfile
```

以降も `package.json` がある場所で実行します。すでに取得済みの場合はそのフォルダを開きます。pnpmをインストール済みなら `packageManager` のバージョンに合わせて `pnpm` を直接実行できます。

## 2. テストから確認する

外部サービスのアカウントを用意する前でも、ローカルの自動テストを実行できます。

```bash
node --test tests/*.test.mjs
npx --yes pnpm@11.25.0 exec tsc --noEmit
```

テストはSQLマイグレーションを一時SQLiteに適用します。外部サービスへの呼び出しはモックを使います。[テストの対応表](code-map.md#テストの選び方)を参照してください。

## 3. ローカルDBと開発サーバーを起動する

```bash
npx --yes pnpm@11.25.0 db:local
npx --yes pnpm@11.25.0 dev
```

ターミナルに表示されたURL（通常 `http://localhost:5173`）を開きます。終了は `Ctrl+C` です。`db:local` はローカルD1にテーブルを作成します。初期DBに会員・キャスト・空き枠は入っていません。

### ログインして画面を確認する

開発用のSupabaseプロジェクトを用意し、メール認証を設定します。リポジトリ直下に `.dev.vars` を作成し、次の例を開発用の値に置き換えてサーバーを再起動します。

```dotenv
SUPABASE_URL="https://YOUR_DEV_PROJECT.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR_DEV_PUBLISHABLE_KEY"
ADMIN_EMAILS="YOUR_VERIFIED_TEST_ADMIN_EMAIL"
```

開発用プロジェクトのSite URLを起動時に表示されたURLに合わせ、確認メールから `/auth/confirm` に進めるようテンプレートを設定します。[メール認証の手順](../email-auth-setup.md)

1. `/login` で、管理者・キャスト用・利用者用に別のテストアカウントを登録します。
2. キャスト用アカウントの「アカウント」から申請します。管理者用アカウントで承認します。
3. 承認済みキャストの「プロフィール・シフト」で、1時間以上先の毎正時に空き枠を登録します。
4. 利用者用アカウントでログインし、空き枠を予約してデモ決済を行います。別アカウントを同時に使う場合は、ブラウザーのプロファイルを分けます。

新規予約はStripe設定を追加するまでサイト内のデモ決済を使います。StripeからローカルへWebhookを届ける経路は別途必要です。公開サンドボックスで一連の動作を確認する場合は [Stripeサンドボックスの手順](../stripe-test-setup.md) を参照してください。

## 4. 変更を確認して共有する

1. [コードの地図](code-map.md)で編集先を確認し、必要なファイルを変更する。
2. DB定義を変更した場合は `pnpm db:generate` で新しいSQLを生成し、差分を確認して `pnpm db:local` で適用する。適用済みSQLは変更しない。
3. 関連するテストを実行し、アプリの変更では型チェックと `pnpm build` を確認する。
4. `git status --short` と `git diff` を確認し、必要なコード・SQL・資料をコミットしてGitHubへpushする。

| よくある症状 | 確認 |
| --- | --- |
| `No package.json` | `pwd` と `ls` で現在地を確認する |
| `EBADENGINE` | 実行中のターミナルで `node -v` を確認する。WindowsとWSLは別の環境 |
| `no such table` | `db:local` の適用結果を確認する |
| 認証が確認できない | `.dev.vars`、起動URL、Supabaseの確認メールとテストアカウントを確認する |
| キャスト一覧が空 | テストアカウントで申請し、別の管理者アカウントで承認する |

`.dev.vars`、ローカルDB、`node_modules`、ビルド結果はGit管理の対象外です。公開サイトの更新方法は [公開手順](../PRODUCTION.md) を参照してください。
