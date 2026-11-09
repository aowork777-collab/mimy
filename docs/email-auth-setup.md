# メールアドレス・パスワード認証

**コードは実装済み。公開サイトへの切り替えはメール配信設定と受信テスト後に行います。**

予約・プロフィール・チャットは従来のCloudflare D1に残し、パスワード管理だけをSupabase Authへ移します。ChatGPTの登録は新しい利用者には不要です。

## 1. 作成済みの認証プロジェクト

| 項目 | 値 |
| --- | --- |
| 組織 | `haru_stoko` |
| プロジェクト | `mimy-auth` |
| リージョン | 東京 `ap-northeast-1` |
| Project ref | `nhknzkfiwglpwacecgqo` |
| URL | `https://nhknzkfiwglpwacecgqo.supabase.co` |
| 管理画面 | https://supabase.com/dashboard/project/nhknzkfiwglpwacecgqo |

既存の別サービスのSupabaseプロジェクトは変更していません。

## 2. メール配信を設定する（公開切替の前提）

Supabaseの組み込み配信はテスト用途で、送信先や回数に制限があります。一般利用者へ送信するには独自SMTPを設定します。

1. メール配信サービスと送信元ドメインを用意する。無料プランでも独自ドメインの取得費用が別途かかることがあります。
2. 配信サービス指定のDNSレコードを設定してドメイン認証を完了する。
3. Supabaseの **Authentication → Email / SMTP Settings** にホスト、ポート、ユーザー名、パスワード、送信元アドレス、送信者名 `mimy.` を入力する。
4. メールのリンク追跡は無効にする。SupabaseのEmail providerとConfirm emailは有効のままにする。
5. Supabase側でもパスワード最小長を12文字以上にする。アプリの送信回数制限は認証APIへの直接アクセスには適用されないため、Supabase側のrate limitsも設定する。

SMTPパスワードやservice_roleキーはGitやチャットに貼りません。アプリはpublishable keyのみを使用します。

公式手順: https://supabase.com/docs/guides/auth/auth-smtp

## 3. URLとメール本文を設定する

**Authentication → URL Configuration → Site URL**:

```text
https://tsukino-talk-1025.haru-stoko.chatgpt.site
```

**Email Templates → Confirm signup** のリンクを以下に変更:

```html
<h2>mimy.へようこそ</h2>
<p>ご自身で申し込んだ場合、次のリンクからメールアドレスを確認してください。</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">メールアドレスを確認する</a></p>
<p>心当たりがない場合、このメールは破棄してください。</p>
```

**Email Templates → Reset password**:

```html
<h2>mimy.のパスワード再設定</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">パスワードを再設定する</a></p>
<p>心当たりがない場合、このメールは破棄してください。</p>
```

標準の `{{ .ConfirmationURL }}` のままでは、このアプリの確認画面に接続できません。リンクは画面の「確認して進む」を押すまで消費せず、メールの自動リンク検査による誤消費を抑えます。

## 4. アプリ側の設定

ローカルではGit管理外の `.dev.vars`、公開環境ではSitesの環境変数に設定:

```dotenv
SUPABASE_URL="https://nhknzkfiwglpwacecgqo.supabase.co"
SUPABASE_PUBLISHABLE_KEY="Supabase管理画面のpublishable key"
ADMIN_EMAILS="運営者の確認済みメールアドレス"
```

ローカルではテスト専用SupabaseプロジェクトまたはローカルSupabaseを推奨します。メールテンプレートのSite URLはローカル開発用URLに合わせます。本番プロジェクトのSite URLを開発のために変更しないでください。

```bash
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

`/login` で新規登録 → メール内リンク → 確認ボタン → ログイン。設定画面からパスワード変更とログアウトができます。

## 5. 既存ユーザー・予約の引き継ぎ

旧データにはメールアドレス一覧がないため、メール文字列だけで過去の会員と自動的に結びつけることはできません。

Sitesで引き継ぐ期間のみ `LEGACY_SITES_MIGRATION=enabled` を設定します。**旧ChatGPTログイン状態を保持した同じブラウザーで、同じメールアドレスをSupabaseで確認し、初回アクセスする**と旧member IDに対応づけます。これにより予約・プロフィール・キャスト役割・停止状態・受理済み管理者招待を保持します。Sites側が検証したユーザー情報と、Supabase側で確認済みのメールの一致が必要です。

旧セッションが切れている既存ユーザーは、移行前に `/signin-with-chatgpt?return_to=%2Flogin` で旧アカウントの本人確認を一度行います。この経路は既存データの引き継ぎ専用で、新規利用者には必要ありません。通常のログインAPIはChatGPTヘッダーだけでは利用できません。

**すでに別の新member IDで利用を始めた場合は自動統合しません。** 対応表を無条件に書き換えると予約・役割が別人へ移るため、運営側で双方の所有確認とデータ確認が必要です。旧アカウントがブロックされていても、引き継ぎで解除されません。

初期管理者は確認済みメールと `ADMIN_EMAILS` の一致で決まります。利用者が登録時の属性へ `role=admin` を指定しても権限は付きません。

他社ホスティングでは `LEGACY_SITES_MIGRATION` を有効にしません。移行完了後はSitesでも無効にします。

## 6. 検証と公開

```bash
node --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

自動テストはSupabase応答を模擬します。メールの実配信・ブラウザーCookie・本番Supabaseセッションについては、次の実機確認が別途必要です。

- 新規登録、確認前の拒否、メール確認、ログイン、ログアウト、再ログイン
- 再設定メール、リンクの期限切れ・再利用拒否、新パスワードへの変更
- セッション期限後の更新、複数タブ利用
- 旧利用者・キャスト・管理者のデータ引き継ぎと、ブロック維持
- 管理者招待と予約画面への戻り先

公開時はD1へ `0007_ordinary_stryfe.sql` を適用し、環境変数を含む新バージョンをデプロイします。現在の公開版はメール配信準備が終わるまで変更しません。

## セキュリティ上の設計と限界

- パスワードはSupabase Authで管理し、D1やlocalStorageには保存しません。
- HTTPS環境では `__Host-` / HttpOnly / Secure / SameSite=Lax Cookieを使い、認証応答をキャッシュしません。
- 各APIでSupabase `getUser` により確認し、既存の予約・管理者・写真の権限判定へ接続します。
- Cookieを使う更新処理には同一Originチェックがあります。
- アプリ経由のログインはメールごとに10分間20回。登録・再設定は各5回。取得可能な接続元IPでは全操作合計100回。固定時間窓方式で、境界をまたぐ試行は別の窓に数えます。メール/IPはハッシュ化して回数のみ保存します。
- Supabaseのセッション失効やメール配信の挙動は同サービスの設定に従います。ログアウトでCookieを消去しrefresh tokenを失効させますが、流出済みaccess tokenの即時失効を保証するものではありません。
- 写真、通話、予約、決済などの機能仕様は変更していません。通話のサーバー終了用Cloudflare Workerの接続は別途必要です。
