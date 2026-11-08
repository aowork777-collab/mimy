# 通話のサーバー側終了：Cloudflare接続手順

## 状態

サイトのコードと専用Workerを実装済みです。専用Workerのデプロイと、サイトの `CALL_GUARD_URL` 設定が完了するまでは、新規通話を開始しません。安全機能のない状態へ自動で戻すことはありません。

## 仕組み

1. サイトが予約ID・参加者・終了時刻を専用Workerへ登録します。
2. Durable Objectが終了時刻を永続保存し、Alarmを登録してから応答します。
3. サイトがLiveKitの参加トークンを発行します。
4. 終了時刻に、ブラウザーと独立して参加者を退出・トークン失効させ、部屋を削除します。
5. 通信障害時は再試行します。終了済みの予約は再登録・期限延長できません。

違反によるブロック、開始後の予約取消も同じWorkerへ終了指示を送ります。ネットワークやサービス障害による遅延までゼロにできる仕組みではありません。失敗ログを監視してください。公開前に実際の2端末で接続し、画面の状態確認を止めても終了することを検証します。

## 1. ローカルでCloudflareにログイン

VS CodeのWSLターミナルで、リポジトリのルートから実行します。

```bash
git pull
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 exec wrangler login
```

ブラウザーで、ご自身のCloudflareアカウントへのアクセスを許可します。

## 2. 専用Workerを作成

```bash
npx --yes pnpm@11.25.0 exec wrangler deploy --config infrastructure/call-guard/wrangler.jsonc
```

表示される `https://mimy-call-guard.…workers.dev` のURLを控えてください。`--dry-run` は公開されないので、この手順では付けません。

## 3. LiveKit設定を秘密情報として登録

サイトと**同じLiveKitプロジェクト**の値を、各コマンドの入力欄に入力します。チャットやGitHubに秘密値を書かないでください。

```bash
npx --yes pnpm@11.25.0 exec wrangler secret put LIVEKIT_URL --config infrastructure/call-guard/wrangler.jsonc
npx --yes pnpm@11.25.0 exec wrangler secret put LIVEKIT_API_KEY --config infrastructure/call-guard/wrangler.jsonc
npx --yes pnpm@11.25.0 exec wrangler secret put LIVEKIT_API_SECRET --config infrastructure/call-guard/wrangler.jsonc
```

`LIVEKIT_URL` は `wss://…livekit.cloud` のURLです。接続用の認証トークンは既存の秘密鍵から用途を分けてHMACで生成するため、追加の共有秘密を手入力する必要はありません。

## 4. mimy.へ接続

サイトのランタイム環境変数に、手順2のURLを `CALL_GUARD_URL` として設定して再デプロイします。**このURLは秘密情報ではありません。** このチャットにURLと「Workerの秘密情報設定が完了した」と伝えれば、サイト側の接続作業を続けられます。

## 5. 接続検証

- 予約開始前・他人の予約では参加できない。
- 通話開始時にWorkerへ終了時刻が登録される。
- 終了時刻に両者が退出し、古いトークンで再入室できない。
- 管理者が利用停止すると既存予約が取消になり、進行中の通話に終了指示が届く。
- Workerへ接続できない場合、新規通話のトークンを発行しない。

```bash
npx --yes pnpm@11.25.0 exec wrangler tail --config infrastructure/call-guard/wrangler.jsonc
```

SQLite Durable Objectsを使用します。利用前にCloudflare側の利用枠・課金設定を確認してください。無料枠内に収まることを保証するものではありません。

## 開発時の確認

```bash
node --test tests/*.test.mjs
npx --yes pnpm@11.25.0 exec tsc --noEmit
npx --yes pnpm@11.25.0 exec wrangler deploy --dry-run --config infrastructure/call-guard/wrangler.jsonc
```

参考：[Cloudflare Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) / [LiveKit participant management](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/)
