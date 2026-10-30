# セキュリティチェックリスト

最終更新: 2026-10-31

VINTAGEのセキュリティ監査、修正、検証状況を管理するTODOリストです。

- `[x]`: 現在のコードまたは記載した環境で確認済み
- `[ ]`: 未確認、または追加検証が必要
- 実装・単体テスト・ビルド・実アプリ・インストール済みアプリ・物理端末は、それぞれ別の証拠として扱います。

## Electronの基本防御

- [x] Main rendererで`contextIsolation: true`を使用する
- [x] Main rendererで`nodeIntegration: false`を使用する
- [x] Main rendererで`sandbox: true`を使用する
- [x] Browser webviewでNode.js integrationを無効化する
- [x] Browser webviewでcontext isolationとsandboxを有効化する
- [x] Browser用sessionの権限要求を拒否する
- [x] Browserの新規ネイティブウィンドウ生成を拒否する
- [x] Main rendererのトップレベル遷移をアプリ自身のURLに限定する
- [x] Main rendererへContent Security Policyを設定する
- [x] CSP下でxterm.jsのWebAssemblyと通常UIが動作することをElectron smokeで確認する
- [ ] Electronの将来更新ごとに公式Security Checklistとの差分を再確認する

## IPC境界

- [x] IPC送信元がMain frameであることを検証する
- [x] IPC送信元URLが許可されたrenderer URLであることを検証する
- [x] 外部URL、ファイル一覧、テキスト読込、画像読込IPCに送信元検証を追加する
- [x] Terminal作成、入力、resize、clipboard、monitor mode、closeを含むPTY系IPCに送信元検証を追加する
- [x] IPCへ渡す文字列、サイズ、ID、URL protocolの入力上限と型検証を確認する
- [x] 子frameと未許可originを拒否する回帰テストを追加する
- [x] 今後IPC channelを追加するとき、送信元検証が必須であることを静的チェックで自動検査する
- [x] 不正IPC送信元を10万回連続検証し、全件拒否される負荷回帰テストを実施する

## 開発用renderer URL

- [x] パッケージ版では`VITE_DEV_SERVER_URL`を無視する
- [x] 開発版ではHTTPのloopback hostだけを許可する
- [x] 外部HTTPS URLや別hostを開発用rendererとして拒否する単体テストを追加する
- [x] IPv6 loopback `::1`へViteをbindし、Electron開発rendererの実読込を確認する

## ローカルHTML Browser

- [x] ユーザーには従来どおり`file:///...`を入力・表示させる
- [x] 内部ではランダムな`vintage-local:` capability URLへ自動変換する
- [x] capabilityをrenderer所有者とBrowser tabに関連付ける
- [x] capabilityをタブ終了時に破棄する
- [x] 再起動時に保存した`file:///` URLから新しいcapabilityを発行する
- [x] 最初に開いたHTMLの親フォルダ内だけを配信する
- [x] `..`、絶対パス、symlinkによる親フォルダ外アクセスを拒否する
- [x] リモートfile hostを拒否する
- [x] Main側で直接の`file:` webview attachとnavigationを拒否する
- [x] ローカルHTMLを通常Webとは別の非永続partitionで実行する
- [x] ローカルpartitionのHTTP/HTTPS requestと権限要求を拒否する
- [x] ローカルHTMLのCSPで外部接続、object、formを拒否する
- [x] ローカルHTML内のHTTP/HTTPSリンクを通常Browserの新規タブへ送る
- [x] アドレス欄、ブックマーク、復元データには内部capabilityではなく元の`file:///` URLを保存する
- [x] ローカルCSS、画像、JavaScript、相対リンクが動作することをElectron E2Eで確認する
- [x] ローカルHTMLからの外部fetchが失敗することをElectron E2Eで確認する
- [x] ローカル専用partitionが実際に使用されることをElectron E2Eで確認する
- [x] iframe、Web Worker、WebAssembly、動的importを使用するローカルHTML fixtureを追加する
- [x] ローカルresourceの単一byte Range requestを206/416で処理する
- [x] ES moduleと動的importをElectron E2Eで確認する
- [x] 32 MiBのローカル媒体を全量読込せずRangeで末尾4 byteだけ配信することをElectron E2Eで確認する
- [x] ローカルsource mapをJSON MIMEで配信することをElectron E2Eで確認する
- [ ] OS・codec別の大容量動画再生を実媒体で確認する
- [ ] Windowsのdrive letter、UNC拒否、macOSのaliasを実アプリで確認する
- [x] capability URLを同一タブで5,000回更新し、5,000タブ分を発行・破棄して保持数がゼロへ戻ることを確認する
- [ ] capability URLを長時間利用した場合のprocess memory推移を実アプリで測定する

## ファイル操作とWorkspace境界

- [x] 読み込み対象を`realpath`でWorkspace内へ限定する
- [x] 書き込み、rename、copy、Trashで絶対パスとWorkspace脱出を拒否する
- [x] mutation対象の親directoryにあるsymlinkを拒否する
- [x] Markdown/Text編集を1 MiB以下の完全なUTF-8 regular fileへ限定する
- [x] 画像読込、HTML preview、Workspace state、Kanbanにサイズ上限を設定する
- [x] Kanban fileでsymlink、複数hard link、不正revisionを拒否する
- [x] 検証直後に親directoryをsymlinkへ差し替えるTOCTOU競合を再現する
- [x] OS Trash API直前の親directory差し替え競合は同一OSユーザー内の残余リスクとして受容し、信頼境界を文書化する
- [ ] Windows junction、reparse point、case-insensitive path境界を実機確認する
- [ ] macOS aliasとcase-insensitive filesystem上の境界を実機確認する
- [ ] ネットワークfilesystem上のrename、lock、atomic writeの挙動を確認する

## コマンド・PTY・Git実行

- [x] Session analysisを`shell: false`とargv配列で起動する
- [x] Git Reviewを`execFile`と固定引数で実行する
- [x] Git filter、pager、prompt、fsmonitorを無効化または制限する
- [x] Session resume commandのCLI名と引数文字種を制限する
- [x] Windows npm shimの起動経路で入力をcommand文字列へ直接補間しない
- [x] Terminal input、clipboard text/image、analysis outputにサイズ上限を設定する
- [x] TypeSafe API keyをPTY環境へ引き継がない
- [x] ユーザー指定のCodexBar/Agent CLIは同一OSユーザーの信頼対象とし、一律の所有者・権限拒否を行わない方針を文書化する
- [x] PATH先頭に配置した実行可能な偽Agent CLIが選択されることを攻撃fixtureで確認する
- [x] PATH検索CLIのpermission bit検査は一般的なユーザー管理CLIを壊すため導入せず、将来のopt-in allowlist/hash pin候補として記録する
- [x] PTY ReplayBufferへ約100 MiBを連続投入し、保持1 MiB、5秒未満、heap増加128 MiB未満を回帰試験する

## 秘密情報と外部サービス

- [x] TypeSafe API keyをElectron safeStorageで暗号化する
- [x] 安全なsecret storage backendが利用できない場合は保存を拒否する
- [x] credential fileを`0600`、保存directoryを`0700`で作成する
- [x] 設定statusからAPI key本体をrendererへ返さない
- [x] Git追跡対象を秘密情報らしいpatternで走査し、テストfixture以外が検出されないことを確認する
- [x] Jev debug logへAPI key本体を出力しないことを確認する
- [x] Jevへ送信するterminal outputの範囲、redaction対象、残余リスクを文書化する
- [x] credential変数、既知token、Bearer、JWT、private key、URL userinfoを送信前に除去する
- [ ] crash report、OS log、Updater logへの秘密情報混入を実機確認する
- [x] このLinux環境の`gnome_libsecret`でsafeStorage暗号化round-tripと安全判定を確認する
- [x] `basic_text`強制時にsafeStorageを利用不可・保存拒否対象と判定することを確認する
- [ ] Linux KWallet系backendの保存・拒否挙動を該当desktop環境で確認する

## Browserと外部URL

- [x] `shell.openExternal`をHTTP、HTTPS、mailtoに限定する
- [x] Browserでjavascript、data、remote file hostなどのprivileged URLを拒否する
- [x] Webページからローカルファイルへのnavigationを拒否する
- [x] Browser sessionのCookieとログイン状態をMain rendererから分離する
- [x] ローカルHTMLのsessionを通常Web Browserから分離する
- [x] HTTPページはローカル機器・開発server互換のため許可し、アドレス欄へ常時警告を表示する
- [x] 通常BrowserのCookieはタブ移動とlogin継続のためproject間で共有し、明示的なPrivate Browser導入時に分離する
- [x] Browser pageからのdownloadをMain側で拒否する
- [x] Browserのcertificate errorとHTTP/proxy authentication challengeを拒否する
- [ ] Browserのproxy設定とOS credential integrationを実環境で攻撃テストする
- [x] HTTP、Cookie共有、OS proxy・証明書storeを含むBrowser threat modelを文書化する

## 自動更新と配布物

- [x] npm production dependency auditで既知の脆弱性が0件であることを確認する
- [x] Electron fuseで`RunAsNode`を無効化する
- [x] Electron fuseで`NODE_OPTIONS`を無効化する
- [x] Electron fuseでNode inspector引数を無効化する
- [x] Electron fuseでCookie暗号化を有効化する
- [x] Electron fuseでASAR integrity validationとASAR限定loadを有効化する
- [x] Linux unpacked packageを作成し、生成binaryからfuse状態を読み戻す
- [x] Updaterのdownload完了状態以外ではinstallを開始しない
- [x] Updaterのdowngradeを明示的に無効化する
- [x] Linux deb installをshell文字列ではなく固定commandとargvで起動する
- [ ] Windows packageを作成し、生成EXEからfuse状態を読み戻す
- [ ] macOS packageを作成し、生成appからfuse状態を読み戻す
- [ ] Windows code signingと署名検証を実リリースassetで確認する
- [ ] macOS code signing、notarization、Gatekeeperを実リリースassetで確認する
- [ ] Linux updater metadataのhash、配布元、downgrade挙動を実リリースassetで確認する
- [ ] インストール済みアプリから実際の更新を行い、再起動後のversionを確認する
- [x] GitHub Releaseまたはupdate metadataが侵害された場合のthreat modelを作成する

## 品質ゲートと実行結果

- [x] `pnpm verify:boundaries`
- [x] Main/renderer TypeScript typecheck
- [x] oxlint
- [x] oxfmt check
- [x] Vitest: 570 passed、1 skipped
- [x] Main、preload、rendererのproduction build
- [x] Electron Browser controls smoke
- [x] Electron file actions smoke
- [x] Electron Browser E2E全体
- [x] `git diff --check`
- [ ] Windows上の全unit/E2E test
- [ ] macOS上の全unit/E2E test
- [ ] WaylandとX11の両方でBrowser/local HTMLを実画面確認する
- [ ] インストール済みLinux AppImage/debでlocal HTMLを実画面確認する
- [ ] 独立した第三者によるpenetration testまたはsecurity reviewを実施する

## 次に優先する項目

- [ ] P1: Windows/macOS packageでElectron fuseと署名を検証する
- [x] P1: ローカルHTMLのiframe、Worker、ES module fixtureを追加する
- [x] P1: file operationのsymlink/TOCTOU競合を再現する
- [x] P1: OS Trash API直前のTOCTOU残余リスクを同一ユーザー信頼境界として受容する
- [x] P2: Jevへ送信するterminal outputの秘密情報redaction方針を決める
- [x] P2: Browserのdownload、certificate error、HTTP/proxy authenticationを拒否する
- [x] P2: HTTP Browserを許可し、非暗号化通信の警告を常時表示する
- [ ] P2: インストール済みアプリのupdate E2Eを実施する
