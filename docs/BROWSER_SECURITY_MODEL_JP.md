# 組み込みBrowserのセキュリティモデル

VINTAGEの組み込みBrowserは通常Webページを作業画面内に表示するための機能です。信頼できないWebコンテンツがMain process、Node.js、Preload bridge、Workspace fileへ直接アクセスできないことを境界とします。

## 実装済みの境界

- 通常Webページは専用の永続partition `persist:starter-browser`で実行する
- Node.js integrationとPreloadを無効化し、sandbox、context isolation、web securityを有効にする
- camera、microphone、notificationなどのpermission要求を拒否する
- `javascript:`、`data:`、直接の`file:`遷移を拒否する
- popupをネイティブwindowとして作らず、許可URLだけをVINTAGEの新しいBrowser tabへ送る
- ページ起点のdownloadを拒否する
- certificate errorを例外扱いせず拒否する
- HTTP Basic/Digest認証とproxy認証challengeを拒否する
- ローカルHTMLは通常Webとは別の非永続partitionで実行する

## HTTPページ

HTTPは既存機能として許可しています。通信内容、Cookie、入力情報はネットワーク上で盗聴・改ざんされる可能性があり、ページ内容の完全性も保証できません。HTTPSへの自動upgradeは、HTTPだけで提供されるローカル機器や開発serverを壊すため実施していません。

HTTPページではアドレス欄の横へ非暗号化通信の警告を常時表示します。ローカル機器と開発serverとの互換性を維持するため、初回確認やHTTPSへの強制upgradeは行いません。機密情報やcredentialはHTTPページへ入力しない前提です。

## Cookieとproxy

通常BrowserのCookieとlogin状態はMain rendererから分離されていますが、project単位では分離せず、全Workspaceの通常Browserで共有します。Browser tabはCommonとprojectの間を移動でき、同じsiteへのloginを引き継ぐことが現行の利用モデルです。projectごとのpartitionへ変更すると移動時のsessionと表示状態が変わるため、Private Browserなど明示的な隔離機能を設計するまでは共有を維持します。local HTMLのpartitionとは共有しません。

通信にはChromium/ElectronとOSのproxy・名前解決・証明書storeが関与します。VINTAGEはproxy credential promptを拒否しますが、OS側に事前設定されたproxy、root certificate、VPN、traffic inspectionの信頼性までは検証しません。

## 対応外

- Webページからのファイルdownload
- Browser拡張機能
- certificate errorの手動override
- HTTP/proxy認証dialogへのcredential入力
- projectごとのCookie partition

これらを将来追加する場合は、保存先、所有Browser tab、Workspace境界、credential保存、再起動後の状態を個別に設計します。
