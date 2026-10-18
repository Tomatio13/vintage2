# VINTAGE

[English](README.md) | 日本語

**必要なターミナルが、あなたを呼び戻す。**

VINTAGEは、プロジェクト、Space、ターミナルをまとめて管理し、バックグラウンドのターミナルに対応が必要になったときに知らせるデスクトップアプリです。コマンドパレットからワークスペース、Space、ターミナルへの移動や各種操作を検索できます。

[機能と画面のガイド](docs/FEATURES_JP.md) · [アーキテクチャ](docs/ARCHITECTURE.md)

## 主な機能

- **プロジェクトの操作**: 左ペインのフォルダをクリックしてSpace一覧を開閉できます。プロジェクトにマウスを合わせ、⋯メニューからRemoveを選ぶと一覧から削除できます。実行中のドットはCodexのAI Usageと同じ青緑色です。
- **ワークスペース、Space、ターミナル**: プロジェクトごとに複数のSpaceを作成し、ターミナルを左右または上下に分割できます。 ターミナルペイン内ではCtrl＋Wでそのペインを閉じられます。
- **コマンドパレット**: `Ctrl+Shift+P` で開き、操作やワークスペース、Space、ターミナルを検索できます。
- **Attention監視**: バックグラウンドのターミナルで起きたコマンド完了、エラー、入力待ちを一覧で確認できます。
- **エージェント状態の表示**: Spaceタブとサイドバーの色付きドットで、作業中・待機中・失敗などの状態を確認できます。 シェル連携が使えない場合も、Errors Onlyを含む各モードでAI CLIの起動を検出して実行中のドットを表示します。
- **FilesとGit Review**: ファイルの閲覧・コピー・リネーム、シンタックスハイライト・行番号・行移動に対応したMarkdown編集、ドキュメントの拡大・縮小、テキストの検索・置換、Git差分確認に対応しています。Filesは画面内の行だけを描画し、フォルダの同時取得数を制限します。ソースは同時に最大600行を描画しながら連続スクロールでき、読み込んだ全文を検索して検索終了時の位置も保持します。Reviewでは大量の変更ファイルと差分をページに分けて表示し、大きすぎる差分はファイルプレビューから確認できます。
- **NotesとBoard**: WorkspaceごとのメモとKanbanボードで作業を管理。カードにラベル・優先度・期限・Subtaskの進捗を表示し、Board拡大時は一覧の横に詳細ドロワーを開きます。検索・Filter・Sort・ドラッグやキーボードでの並べ替えに対応します。 [vintage-board Agent Skill](skills/vintage-board/SKILL.md)を配布すると、Agentから同梱Pythonでカード・Notes・Subtaskを更新できます。
- **Agent Monitor**: Monitorタブで、Claude Code / Codex / Antigravity / OpenCode / ZCode / Grokの実行状態、現在のツール、コンテキスト使用率を確認できます。abtopや外部収集ツールのインストールは不要です。 Space横の状態表示にもSession情報が反映され、Monitorタブを閉じている間も更新されます。 実行中からWaitingへ変わったSessionは、ターミナルに紐付かないものも既存のAttentionトースト・デスクトップ通知で知らせ、Open Spaceから対象Space・ターミナルへ移動できます。ターミナルに紐付かないSessionはMonitorを開きます。Waitingには応答完了と入力待ちが含まれます。通知設定のSession wait notificationsで無効にできます。
- **AI使用制限の表示**: CodexやClaude CodeなどのAI CLIの残りクォータ、リセット時刻、クレジットをMonitor内で確認できます。任意の [CodexBar CLI](https://github.com/steipete/codexbar) が必要です。
- **複数のシェルに対応**: zsh、bash、fish、またはOSの既定シェルを選べます。Windows ではコマンドプロンプト、Windows PowerShell、PowerShell 7、Git Bash に対応しています。
- **テキストの自動コピー**: ターミナル出力をマウスで選択するとクリップボードへコピーします。
- **高速なターミナル描画**: 出力はWebGLで描画され(利用できない環境では自動フォールバック)、出力中のURLをクリックしてブラウザーで開け、Sixel/iTerm2のインライン画像表示にも対応しています。
- **ターミナルセッションの保護**: ウィンドウの再読み込みやレンダラーのクラッシュ後もターミナルは引き継がれ、直近の出力を復元して再接続します。
- **Filesの操作**: 右クリックでファイル・フォルダの新規作成、コピー、リネーム、確認付きのゴミ箱移動ができます。フォルダの展開状態はProjectごとに保存され、切り替えやアプリ再起動後も復元されます。[Filesガイド](docs/FEATURES_JP.md#filesとファイルプレビュー)をご覧ください。
- **組み込みブラウザー**: ブックマークの絞り込み・ページ表示に対応。More actions → Suspend background tabsで非表示ページを解放できます（再表示時に再読み込みし、未保存の入力内容は失われます）。 HTTP/HTTPSとローカルの `file:///` ページ、プロジェクト別・Commonのタブ、再起動時の復元、別ウィンドウ指定リンクの新規タブ表示、所属別のブックマーク、ページ内検索、タブごとのズーム（Ctrl＋ホイール／＋／－／0）、Ctrl＋Lによるアドレス選択、Ctrl＋W／Ctrl＋Shift＋Tによるタブの終了・復元、Ctrl＋Tabによる切り替え、ホイールクリックによるリンクのバックグラウンドタブ表示・タブの終了に対応しています。Browserタブは横に追加され、収まらない場合はパネルのヘッダー全体を横スクロールできます。ページの右クリックで選択文字のコピー、入力欄の編集、リンクの新規タブ表示・URLコピー、画像コピー、ページ移動、要素の検証ができます。ツールバーからブックマーク一覧や外部ブラウザーを開け、操作メニューにはResponsive preview、要素選択、開発者ツールがあります。所属の扱い、操作方法、制限は[Browserガイド](docs/FEATURES_JP.md#browser)をご覧ください。
- **右ペインの幅調整**: 境界をドラッグすると、ターミナル用の領域を残しながらウィンドウ幅に応じて右ペインを広げられます。指定した幅を保存し、ウィンドウ縮小時には表示幅を調整します。
- **カスタマイズ**: ショートカットの再割り当て、4種類のテーマ、UI・ターミナル・シェル設定に対応しています。
- **クロスプラットフォーム**: Linux、Windows、macOSで動作します。

画面構成、対応するプレビュー形式、Attentionの監視モード、Jevの設定、スクリーンショットは[機能と画面のガイド](docs/FEATURES_JP.md)をご覧ください。

## まず使ってみる

1. VINTAGEを起動すると、ホームディレクトリで `Space 1` と `Terminal 1` が開きます。
2. **Open folder** からプロジェクトを追加します。新しいターミナルは選択中のワークスペースを作業ディレクトリにします。
3. Spaceを追加したり、ターミナルを分割したりして作業環境を整理します。
4. コマンドパレット、またはAttention一覧から、目的のワークスペース、Space、ターミナルへ移動します。

[既定のショートカット一覧と変更方法](docs/FEATURES_JP.md#既定のキーボードショートカット)

## 必要環境

- **Node.js**: 24以上
- **pnpm**: 10.33.2以上
- **C/C++開発環境**: `node-pty` のビルドに必要です（LinuxではC/C++コンパイラー、`make`、Pythonなど）。

## セットアップ

```bash
pnpm install
pnpm dev
```

本番ビルドをローカルで起動する場合：

```bash
pnpm build
pnpm start
```

## Jevによる意味判定（任意）

ローカルルールだけでは判別しづらいターミナル出力を、[Jev](https://docs.typesafe.ai/sdk/javascript) で分類できます。連携は **Settings → Integrations** から設定します。判定される状態、プライバシー、APIキーの設定方法は[機能と画面のガイド](docs/FEATURES_JP.md)をご覧ください。

## MonitorとAI Usage

**対応OSの状況：Linuxはサポート対象です。WindowsのMonitorは試験中のプレリリース扱いで、実機試験はpendingです。macOSの実装はありますが、動作未確認です。**

Windowsでは同梱のRustヘルパーでプロセス検出とCPU／RAMを取得します。初期対象はClaude Code、Codex、OpenCodeで、他のAgentはWindows未検証です。取得できないプロセス情報や曖昧なセッションはUnknownとして扱います。Codexのログ紐付けは推定で、ターミナル判定ができないため、一部のターミナル専用ログは紐付けできません。Windowsのロードアベレージは表示しません。AI Usageは別途CodexBarの利用可否に依存します。Windowsでのビルド・開発にはRustツールチェーン（`cargo`）が必要ですが、インストーラー利用者にはRustやabtopの導入は不要です。

**Monitor**タブでは、PC全体のCPU・コア別負荷、メモリ、実行中のClaude Code / Codex / Antigravity / OpenCode / ZCode / Grokセッションを確認できます。セッションを選ぶと、現在のツール、モデル、コンテキスト、子プロセスを含むCPU・RAMを表示します。**Open terminal**でVINTAGE内の既存ターミナルへ戻り、**Expand monitor**でウィンドウ全体に拡大できます。Monitorは初期状態で有効で、**Settings → Panels**から非表示にできます。

ローカルの実行状況は、Monitorとアプリの画面が表示されている間、約2秒ごとに更新します。終了したプロセスは次の更新で除外します。ZCodeはワーカープロセスが残っていても、最終更新から1時間以上経過すると非表示になります。同じディレクトリに複数のZCodeワーカーがある場合、直近1時間のSessionが1つなら重複せず表示し、複数ある場合は紐付け不明として扱います。MonitorのAI Usageカードは常に2列で表示します。サービス名の横と残量バーをProvider別の色で表示し、残量低下時は警告色を優先します。共有ZCodeワーカーのCPU・RAMはグループで集計します。ZCodeの状態上書きとセッション選択はワーカー数によらずメッセージ・ツールの更新時刻を比較し、ZCode／OpenCodeでは最新メッセージ内の並列ツールも実行状態に反映します。Codexのapp-server・MCP server・remote-controlサービスと、CodexBarが起動するAgentの確認用プロセスは非表示にし、紐付け不明・読み取り不可のローカルAgentはUnknownとして表示を残します。状態とセッションの紐付けはローカルのプロセス・ログ情報による推定で、曖昧・読み取り不可の場合は **Unknown**、未取得の値は **—** になります。ローカル監視にabtopや外部収集ツールのインストールは不要です。

任意の **AI Usage** はCPU／Memoryの直下に表示され、サイズを揃えたコンパクトなProviderカードでクォータ、リセット時刻、クレジット、コストを確認できます。CodexBarが`limitResetCredits`を返す場合は、通常のCreditsに代えて利用可能数と次の有効期限を表示し、Today／30 daysのコストは非表示にします。**Settings → Usage → Show Usage in Monitor**で有効にし、[CodexBar CLI](https://github.com/steipete/codexbar)を設定します。既存のUsage設定は引き継がれ、独立したUsageタブはありません。UsageはMonitorの表示中、専用の更新間隔で取得します。情報源と制限は[機能ガイド](docs/FEATURES_JP.md#monitor)、CodexBarの導入方法は[Usage制限のガイド](docs/FEATURES_JP.md#usage制限codexbar)をご覧ください。

**Settings → Panels**でFiles・Review・Notes・Board・Monitor・Browserを個別にON/OFFできます。変更は自動保存され、タブ表示の切り替えにはショートカットも設定できます。

**Settings → Appearance → Character ripple**で、クリック位置から文字の波紋が広がるエフェクトを試せます。強度と色を調整でき、色はテーマ連動にも戻せます。初期状態はオフです。OSの「視差効果を減らす」設定に従い、埋め込みブラウザのページ内では動作しません。

## BoardとAI Agent

`Ctrl+Shift+K`で**Board**を開きます。カードにラベル・優先度・期限・Subtaskの進捗を表示し、カードを開くと一覧の横に詳細ドロワーを表示します。拡大中も端末セッションは維持されます。Description / Notesの下でSubtaskを追加・編集・完了チェック・削除し、**Save changes**で保存します。全Subtaskの完了は親カードのStatusを変更しません。

AIアイコンからコピーする指示は、作業場所・Board JSONとAgent Skillのパス・対象・作業指示の5行です。Agentに貼り付けると、Skillに記載したPythonの操作方法を参照して作業できます。Board全体のアイコンは非表示のカードを含むすべてのTo do、カードのアイコンはその保存済みカードが対象です。Python 3が必要です。

[`skills/vintage-board`](skills/vintage-board/SKILL.md)フォルダー全体をAgentのSkill保存先へ配布できます。AI指示コピー時にはVINTAGEのアプリ保存領域にもSkillを書き出します。同梱PythonはカードのStatus・Notes更新とSubtaskの追加・タイトル変更・完了／再開・削除に対応します。Boardデータはそのマシンに保存されます。[Boardの操作ガイド](docs/FEATURES_JP.md#boardkanban)と[保存形式・CLI・Skill配布のガイド](docs/KANBAN.md)をご覧ください。

## ドキュメント

- [機能と画面のガイド](docs/FEATURES_JP.md) — UIと各機能の説明、スクリーンショット
- [アーキテクチャ](docs/ARCHITECTURE.md) — プロセス境界と設計
- [English: Features and screen guide](docs/FEATURES.md)
- [English README](README.md)

## 検証とパッケージ作成

```bash
pnpm verify
pnpm test:e2e
```

`pnpm verify` は境界チェック、型検査、lint、フォーマット、単体テスト、本番ビルドを実行します。`pnpm test:e2e` はElectronを起動してE2Eスモークテストを行います。

配布パッケージは対象OS上で作成してください。

| 対象OS      | コマンド              | 形式               |
| :---------- | :-------------------- | :----------------- |
| **Linux**   | `pnpm run dist:linux` | AppImage, deb      |
| **macOS**   | `pnpm run dist:mac`   | dmg, zip           |
| **Windows** | `pnpm run dist:win`   | NSISインストーラー |

成果物は `release/` に出力されます。コード署名（macOSの公証を含む）は未設定です。

## セキュリティと制限事項

RendererからNode.jsを利用できないよう分離し、OS機能へのアクセスをPreloadが公開する型付きIPCに限定しています。Projectはフォルダー選択ダイアログから追加します。ファイル操作はWorkspace内に限定され、Markdown編集は明示的に保存し、ソース表示でのテキスト置換は即時保存します。外部変更との競合時は上書きしません。SSHなどShell Integrationが利用できない環境では、ターミナルイベントの検知精度が下がる場合があります。組み込みブラウザーはダウンロード、拡張機能、ログイン情報の保存に対応していません。

詳しくは[アーキテクチャ](docs/ARCHITECTURE.md)と[機能と画面のガイド](docs/FEATURES_JP.md)をご覧ください。

## ライセンス

本プロジェクトは **Apache License 2.0** のもとで公開されています。[LICENSE](LICENSE) と [NOTICE.md](NOTICE.md) をご確認ください。
