# VINTAGE

VINTAGE は、複数のターミナルとプロジェクトファイルを一つのウィンドウで扱うための、ローカル完結型デスクトップワークスペースです。

Electron、React、xterm.js、node-pty を使い、選択したプロジェクトフォルダーを作業ディレクトリとする本物のシェルを起動します。Chrome風のタブ、縦横のペイン分割、ファイルプレビュー、組み込みブラウザーを備えています。

> 現在は開発版です。ワークスペースやタブ構成の永続化、エージェント連携、リリース署名などは未実装です。

## 主な機能

- ネイティブのフォルダー選択から複数のワークスペースを登録
- ワークスペース直下で zsh、bash、fish、またはシステム既定シェルを起動
- ターミナルタブの追加、切り替え、終了、名前変更
- 選択中のペインを右または下へ再帰的に分割
- 各ターミナルペインの名前変更と個別終了
- ファイルツリーからテキストファイルを読み取り専用でプレビュー
- Markdownの見出し、リスト、コードブロックを簡易表示
- 分離されたセッションで動作する組み込みブラウザー
- System、Light、Dark、Graphiteの4テーマ
- UIサイズ、ターミナルフォント、文字サイズ、スクロールバック、シェルを設定
- キーボードショートカットの再割り当て
- Linux、Windows、macOSに合わせたカスタムウィンドウフレーム

## 基本操作

1. `Open folder` または `Open workspace` からプロジェクトフォルダーを選びます。
2. 選んだフォルダーをカレントディレクトリとして、最初のターミナルが開きます。
3. タブ右側の `+` で新しいターミナルタブを追加します。
4. 上部の分割ボタンで、選択中のペインを右または下へ分割します。
5. 右ペインの `Files` を開き、ファイルをダブルクリックすると中央領域の右側へプレビューが開きます。

タブ名はタブのタイトルを、ターミナル名はペイン上部のタイトルをダブルクリックすると変更できます。`Enter` またはフォーカス移動で確定し、`Escape` でキャンセルします。

## 既定のキーボードショートカット

設定画面の `Shortcuts` から割り当てを変更できます。

| 操作                   | ショートカット |
| ---------------------- | -------------- |
| 前のタブ               | `Ctrl+Shift+←` |
| 次のタブ               | `Ctrl+Shift+→` |
| 前のペイン             | `Ctrl+Shift+↑` |
| 次のペイン             | `Ctrl+Shift+↓` |
| 前のワークスペース     | `Alt+←`        |
| 次のワークスペース     | `Alt+→`        |
| 新しいターミナル       | `Ctrl+Shift+N` |
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

詳しい設計は [ARCHITECTURE.md](./ARCHITECTURE.md)、プロダクト上の境界は [SPEC.md](./SPEC.md) を参照してください。

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
- エージェントのHook通知、実行状態連携、認証、リモートワークスペースには対応していません。
- ブラウザーのダウンロード、拡張機能、認証情報の注入には対応していません。
- 自動更新、テレメトリー、リリース署名は実装していません。

## ライセンス

Apache License 2.0です。詳細は [LICENSE](./LICENSE) と [NOTICE.md](./NOTICE.md) を参照してください。
