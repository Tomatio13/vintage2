# VINTAGE

**必要になったTerminalが、あなたを呼び戻す。**

VINTAGEは、複数CLIと作業文脈をSpaceにまとめるローカルデスクトップアプリです。バックグラウンドTerminalで完了・失敗・入力待ちが起きたら、Attention一覧から対象のSpace・Terminalへ戻れます。

![Space 2で作業中に、別SpaceのTerminal 2で発生した入力待ちをAttention一覧に表示するVINTAGEの画面](assets/readme/vintage-background-attention.png)

_別Spaceで作業していても、入力が必要なTerminalを見失いません。_

### Attentionから、対象のTerminalへ

![Attention一覧からTerminal 2を選び、入力待ちのSpace 1へ移動したVINTAGEの画面](assets/readme/vintage-attention-routing.png)

_Attention項目を選ぶと、対象のSpaceとTerminalへ直接移動します。両画面はVINTAGEの実UIをデモ用セッションで撮影しており、Terminalの出力はサンプルです。_

## 見に行かなくても、必要なTerminalを知らせる

複数のCLIを動かすと、処理中のTerminalを順番に巡回して、完了・失敗・入力待ちを探すことになりがちです。VINTAGEはShell IntegrationとPTY出力を見守り、Agent固有Hookに依存せず、注意が必要な結果を一か所へ集約します。曖昧な出力だけ任意でJevに判定させることもできます。結果はSpaceのBadge、アプリ内通知、Attention履歴に反映され、30秒以上のコマンド完了も強調表示。通知や一覧から該当Terminalへ一操作で戻れます。

Terminalごとに `Monitor`、`Ignore`、`Mute`、`Always Notify`、`Errors Only` を選べるので、常時稼働する開発サーバーと応答待ちのCLIを同じ設定で扱う必要もありません。

> 現在は開発版です。Workspace・Space・Terminal構成の永続化、コード署名、リリース自動配布などは未対応です。

## 主な機能

- ネイティブのフォルダー選択から複数のワークスペースを登録
- ワークスペース直下で zsh、bash、fish、またはシステム既定シェルを起動
- ワークスペース内にSpace 1/2…を作成し、SpaceごとにTerminal 1/2…を追加・分割
- SpaceとTerminalの切り替え、終了、名前変更
- 各ターミナルペインの名前変更と個別終了
- ファイルツリーからテキストファイルを読み取り専用でプレビュー
- Markdownの見出し、リスト、コードブロックを簡易表示
- ターミナル出力の範囲選択を自動コピー
- 分離されたセッションで動作する組み込みブラウザー。Browserタブは複数、Filesペインは一つ
- System、Light、Dark、Graphiteの4テーマ
- UIサイズ、ターミナルフォント、文字サイズ、スクロールバック、シェルを設定
- キーボードショートカットの再割り当て
- Linux、Windows、macOSに合わせたカスタムウィンドウフレーム

## 基本操作

1. 起動するとHomeをルートにした `Space 1` と `Terminal 1` が開きます。プロジェクトフォルダーを選ばずに使い始められます。
2. プロジェクトで作業する場合は `Open folder` から追加します。選んだフォルダーがそのWorkspaceのTerminalの作業ディレクトリになります。
3. サイドバーの `New space` またはタブ右側の `+` でSpaceを追加します。各Spaceは `Terminal 1` から始まります。
4. 上部の分割ボタンで、選択中のTerminalを右または下へ分割します（`Terminal 2`、`Terminal 3`…）。
5. 右ペインの `Files` を開き、ファイルをダブルクリックすると中央領域の右側へプレビューが開きます。
6. バックグラウンドTerminalで状態が変わると、左側のAttention一覧から対象Paneへ移動できます。

タブ名はタブのタイトルを、ターミナル名はペイン上部のタイトルをダブルクリックすると変更できます。`Enter` またはフォーカス移動で確定し、`Escape` でキャンセルします。

## 既定のキーボードショートカット

設定画面の `Shortcuts` から割り当てを変更できます。

| 操作                   | ショートカット |
| ---------------------- | -------------- |
| 前のSpace              | `Ctrl+Shift+←` |
| 次のSpace              | `Ctrl+Shift+→` |
| 前のペイン             | `Ctrl+Shift+↑` |
| 次のペイン             | `Ctrl+Shift+↓` |
| 前のワークスペース     | `Alt+←`        |
| 次のワークスペース     | `Alt+→`        |
| 新しいSpace            | `Ctrl+Shift+N` |
| 右へ分割               | `Ctrl+Shift+D` |
| 下へ分割               | `Ctrl+Shift+T` |
| サイドバー表示切り替え | `Ctrl+B`       |
| 選択中のペインを閉じる | `Ctrl+Shift+W` |

設定画面はサイドバー下部の歯車ボタンから開きます。編集中の設定は `Ctrl+S` で保存できます。

## 必要環境

- Node.js 24以上
- pnpm 10.33.2以上
- `node-pty` をビルドできるネイティブ開発環境

Linuxでは一般に、C/C++コンパイラー、`make`、PythonなどのNode.jsネイティブアドオン用ツールが必要です。

## セットアップ

```bash
pnpm install
pnpm dev
```

`pnpm dev` はMain、Renderer、Electronを監視モードで起動します。

本番ビルドをローカルで起動する場合は、次を実行します。

```bash
pnpm build
pnpm start
```

## Jev意味判定（任意）

[TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)を使い、ローカル規則だけでは意味が確定しないTerminalの出力をJevへ判定させられます。foreground/backgroundの両方を監視し、Paneの状態は判定コンテキストとして使います。Agent固有Hookやツール別Analyzerは使用しません。

Jevは現在のAgent Turnについて、失敗・入力要求・ターン終了・警告・実行中の処理・Agentの作業・外部待ちを個別に評価します。アプリ側で優先順位を適用し、「正常完了」「失敗・ブロック」「入力・承認待ち」「外部処理待ち」「確認すべき警告」「Agentの思考・作業中」「通常実行中」「不明」の状態に決めます。Agent CLIのプロセスが生きたまま通常の次回入力プロンプトに戻っていればCompletedです。出力更新だけではThinkingとせず、最後の出力内容からターンが終了したかを判定します。さらに注意度（0〜4）、ユーザーの対応が必要か、監視を続けるべきかも評価し、Attentionの表示や通知に反映します。不明瞭な場合は無理に確定せず、ローカル判定を優先します。

APIキーはSettingsのIntegrationsから保存できます。キーはElectron MainでOSのcredential storageを使って暗号化し、Rendererへ読み戻しません。保存後は再起動せず、開いているTerminalにも反映されます。安全なcredential backendが利用できない環境では保存を拒否し、TYPESAFE_API_KEY環境変数を引き続き利用できます。保存済みキーは環境変数より優先されます。

ローカルで確定できない正常終了や実行中の出力候補をQueueで評価します。Jevへ送るのは秘密らしい値をマスクしたコマンド、ワークスペース名、終了コード、実行時間、状態ヒント、末尾40行・最大4,000文字の出力だけです。完全なパス、環境変数、Terminalの全scrollbackは送信しません。APIキーはElectron Mainだけが利用し、起動するPTYには渡しません。判定は10秒でタイムアウトし、アプリ全体で毎秒2件・毎分30件を上限とします。Terminal単位のQueue cooldownは1秒、連続出力の評価間隔は最低5秒です。API障害時はTerminal操作を止めずローカル結果を維持します。

動作を診断するときは、VINTAGEを完全に終了してから次のように再起動します。ログには送信本文やAPIキーを出さず、enabled、request、response、applied、skipped理由だけを表示します。

    VINTAGE_JEV_DEBUG=1 pnpm dev

## Attentionの監視設定

各Terminal上部のメニューから監視モードを切り替えられます。`Monitor`は通常監視、`Ignore`はAttention判定を抑止、`Mute`は検知とアプリ内表示を続けてOS通知のみ抑止、`Always Notify`はAttention thresholdとアプリ非アクティブ条件を無視してOS通知、`Ignore until error`は通常の完了・警告を抑止して失敗終了または明確なエラー出力を表示します。OS通知全体がSettingsのIntegrationsで無効なら、`Always Notify`でもOS通知は出ません。

| モード          | Jevの評価タイミング                                                                                                                                          | Attentionと通知                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `Monitor`       | 出力のdebounce後やコマンド終了時に候補を評価します。出力が変わった場合は最短5秒間隔で再評価し、Jevが監視継続を返した場合は実行中に15秒後の再評価を行います。 | Attention thresholdと通知thresholdに従います。                                                      |
| `Mute`          | `Monitor`と同じです。                                                                                                                                        | アプリ内のAttentionを表示し、OS通知を抑止します。                                                   |
| `Always Notify` | `Monitor`と同じです。                                                                                                                                        | thresholdとアプリの非アクティブ状態にかかわらず通知します。OS通知全体が無効の場合は通知されません。 |
| `Agent Monitor` | Agent作業中に設定周期で評価します。既定10秒、Settingsから5〜300秒に変更できます。                                                                            | 出力中はThinkingを表示し、JevがCompleted、Waiting inputなどの状態を判定します。                     |
| `Errors Only`   | Jevは呼びません。                                                                                                                                            | ローカルで終了コードと明確なエラー出力を検知します。通常の完了や警告は抑止します。                  |
| `Ignore`        | Jevは呼びません。                                                                                                                                            | TerminalのAttentionを抑止します。                                                                   |

`Monitor`、`Mute`、`Always Notify`はJevの評価タイミングを共有し、表示と通知の扱いが異なります。通常モードでは静かな状態を定期評価しません。定期的な状態評価を行うのは`Agent Monitor`です。

SettingsのAttentionから、出力debounce（100〜5,000 ms）、Attention threshold、デスクトップ通知thresholdを変更できます。変更は保存後すぐに実行中のTerminalにも反映されます。既定値は800 ms、LOW以上、HIGH以上です。

Terminal上部の監視モードで`Agent Monitor`を選ぶと、ログが流れている間はThinkingを表示し、Jevも設定した周期で状態を判定します。Agent CLIが次の依頼を受け付けるプロンプトに戻った場合は、そのターンをCompletedとします。作業途中で具体的な質問や承認を求めている場合だけWaiting inputとし、出力停止中は外部処理待ちなども判定します。複数Terminalはそれぞれ独立した状態と評価キューで監視します。Codex・Claude Code・OpenCodeはシェルの開始イベントが取れない場合もプロセス監視から検出します。SettingsのAttentionで監視周期（5〜300秒、既定10秒）を設定できます。Jevを設定していない場合もログ流入中はThinkingを表示しますが、周期的な状態判定は行いません。

アプリ設定とTerminalモードはElectronのuserData内の`attention-settings.json`に保存されます。Terminalモードの照合にはワークスペースの場所・タブ名・Terminal名から作成したハッシュのみを保存し、プロジェクトのパスやTerminal出力はこの設定ファイルへ記録しません。現在ワークスペース／タブ／ペイン構成自体は再起動後に復元されないため、Terminalモードの復元には同じワークスペースとタブ／Terminal名でTerminalを開き直す必要があります。

## 検証

```bash
# 境界チェック、型検査、Lint、フォーマット、単体テスト、ビルド
pnpm verify

# Electronを実際に起動するスモークテスト
pnpm test:e2e
```

個別のコマンドも利用できます。

| コマンド                 | 内容                                 |
| ------------------------ | ------------------------------------ |
| `pnpm typecheck`         | MainとRendererのTypeScript型検査     |
| `pnpm lint`              | oxlintによる静的検査                 |
| `pnpm fmt`               | oxfmtによる自動整形                  |
| `pnpm fmt:check`         | フォーマット差分の検査               |
| `pnpm test`              | Vitestの単体・コンポーネントテスト   |
| `pnpm build`             | Main、Preload、Rendererの本番ビルド  |
| `pnpm verify:boundaries` | Electronプロセス境界の依存関係を検査 |

## パッケージ作成

インストール前の展開済みアプリは次のコマンドで生成できます。

```bash
pnpm run package:dir
```

プラットフォーム別の配布物は、それぞれの対象OS上で生成してください。

| 対象    | コマンド              | 出力形式      |
| ------- | --------------------- | ------------- |
| Linux   | `pnpm run dist:linux` | AppImage、deb |
| macOS   | `pnpm run dist:mac`   | dmg、zip      |
| Windows | `pnpm run dist:win`   | NSIS          |

成果物は `release/` に出力されます。コード署名、macOSのnotarization、リリースへの自動アップロードは設定されていません。

## アーキテクチャ

```text
Renderer UI
  ├─ typed IPC → Preload allowlist → Electron Main → OS / filesystem
  ├─ Terminal UI → TerminalManager → node-pty → local shell
  └─ Browser UI → isolated webview session → web
```

- `src/main` — ウィンドウ、PTY、ファイル検証、WebViewセキュリティを管理
- `src/preload` — Rendererへ型付きの最小限なAPIだけを公開
- `src/renderer` — React UI、タブ・ペインレイアウト、設定状態を管理
- `src/shared` — Main、Preload、Renderer間のシリアライズ可能な契約
- `tests` — コンポーネント、状態制御、URL処理、Electronスモークテスト

プロセス境界の詳細は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。

## セキュリティ

- RendererではNode.js統合を無効にし、context isolationとsandboxを有効化しています。
- OS操作はPreloadの許可リストを通る型付きIPCに限定しています。
- ワークスペースは、そのアプリセッション中にフォルダー選択ダイアログで登録した場所だけを扱います。
- ファイル読み取りではパストラバーサル、シンボリックリンクによる外部参照、通常ファイル以外を拒否します。
- ファイルプレビューは最大1 MBです。
- 各PTYは作成元のElectronウィンドウに所有権を限定し、ウィンドウ終了時に破棄します。
- 組み込みブラウザーは `http:`、`https:`、`about:blank` のみを許可し、権限要求を拒否します。

VINTAGEはエージェントCLIの認証情報を管理しません。CodexなどのCLIを起動した場合も、ログイン、権限、設定は各CLI側で管理されます。

## 現在の制限

- ワークスペース、タブ、ペイン構成はアプリ再起動後に復元されません。
- 分割境界のドラッグリサイズには対応していません。
- ファイルプレビューは読み取り専用で、コード編集機能はありません。
- Attention RouterはAgent固有Hookを使用しません。SSH先などShell Integrationが届かない処理は、PTY出力による推定になります。
- ブラウザーのダウンロード、拡張機能、認証情報の注入には対応していません。
- 自動更新、テレメトリー、リリース署名は実装していません。

## ライセンス

Apache License 2.0です。詳細は [LICENSE](./LICENSE) と [NOTICE.md](./NOTICE.md) を参照してください。
