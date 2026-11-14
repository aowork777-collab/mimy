# mimy.

キャストとの会話を予約し、メッセージ・音声・ビデオ通話を利用するサービスです。

[公開サイト](https://mimy.example-jp.com/) · [利用者向けヘルプ](https://mimy.example-jp.com/help) · [開発者ガイド](docs/developer-guide/README.md)

## 初めて開いた人へ

| やりたいこと | 読む資料 |
| --- | --- |
| 自分のPCで起動・テストする | [最初のセットアップ](docs/developer-guide/local-development.md) |
| 画面や機能のコードを見つける | [コードの地図と読み方](docs/developer-guide/code-map.md) |
| GitHub・Stripe・Cloudflareなどの役割を知る | [利用ツールと運用先](docs/developer-guide/services.md) |
| 認証・権限・予約の仕組みを理解する | [システム設計書](docs/developer-guide/architecture.md) |
| 公開・実決済へ進む準備をする | [公開と本番決済の準備](docs/PRODUCTION.md) |

公開サイトはメールアドレスとパスワードでログインします。決済は **Stripeサンドボックス** で、実際の請求は発生しません。GitHubへpushした変更を公開サイトへ反映するときは、別途Sitesでデプロイします。

## 開発コマンド

Node.js 22.13以上と、`package.json` 指定のpnpmを使用します。ログインして画面を操作するには開発用の認証設定が必要です。詳しくは [最初のセットアップ](docs/developer-guide/local-development.md) を参照してください。

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 db:local
npx --yes pnpm@11.25.0 dev
```
