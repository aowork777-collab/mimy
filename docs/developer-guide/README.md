# mimy. 開発者ガイド

画面を触ったことがない人でも、ローカルで確認し、目的のコードまでたどるための入口です。

| 順番 | 資料 | 読み終えるとできること |
| --- | --- | --- |
| 1 | [最初のセットアップ](local-development.md) | 起動・テスト・停止ができる |
| 2 | [コードの地図と読み方](code-map.md) | 画面の文言やボタンから編集先を見つけられる |
| 3 | [システム設計書](architecture.md) | 認証・権限・予約・決済のデータの流れを説明できる |
| 必要時 | [利用ツールと運用先](services.md) | DNS、メール、決済、公開の問題をどこで調べるか判断できる |
| 公開前 | [公開と本番決済の準備](../PRODUCTION.md) | テスト運用から実決済へ進む条件を確認できる |

## 最初に読むコード

1. [料金表の定義](../../lib/catalog.ts)の `pricingTiers` と `priceFor` を読む。
2. [料金表示のUI](../../components/pricing-section.tsx)で料金表の使い方を確認する。
3. [予約APIの処理](../../lib/workspace-service.ts)で `a.action==='reserve'` を検索する。サーバーが料金を計算し直し、予約へ保存する箇所が見つかる。
4. [決済の処理](../../lib/stripe-payment.ts)で `startStripeCheckout` を検索する。予約に保存した金額をStripeへ渡す箇所が見つかる。

この順で読むと、表示した料金が予約の確定にどう使われるかを、コードを書き換えずに追えます。

## 設定の手順書

- [メール認証と旧アカウントの引き継ぎ](../email-auth-setup.md)
- [Stripeサンドボックス](../stripe-test-setup.md)
- [通話終了Workerの接続](../call-guard-setup.md)
- [セキュリティ対策の保守](../security-maintenance.md)
- [レスポンシブUI](../responsive-ui.md)

機能を変更したら、影響する資料も同じコミットで更新してください。環境変数は名前と設定先だけを記載し、秘密値や利用者情報を資料に載せないでください。
