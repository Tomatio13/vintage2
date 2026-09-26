# VINTAGE

[English](README.md) | 日本語

**必要なターミナルが、あなたを呼び戻す。**

VINTAGEは、プロジェクト、Space、ターミナルをまとめて管理し、バックグラウンドのターミナルに対応が必要になったときに知らせるデスクトップアプリです。コマンドパレットからワークスペース、Space、ターミナルへの移動や各種操作を検索できます。

[機能と画面のガイド](docs/FEATURES_JP.md) · [アーキテクチャ](docs/ARCHITECTURE.md)

## 主な機能

- **ワークスペース、Space、ターミナル**: プロジェクトごとに複数のSpaceを作成し、ターミナルを左右または上下に分割できます。
- **コマンドパレット**: `Ctrl+Shift+P` で開き、操作やワークスペース、Space、ターミナルを検索できます。
- **Attention監視**: バックグラウンドのターミナルで起きたコマンド完了、エラー、入力待ちを一覧で確認できます。
- **エージェント状態の表示**: Spaceタブとサイドバーの色付きドットで、作業中・待機中・失敗などの状態を確認できます。
- **FilesとGit Review**: よく使われるファイルをプレビューし、未追跡ファイルを含む未ステージのGit変更を確認できます。
- **AI使用制限の表示**: CodexやClaude CodeなどのAI CLIの残りクォータ、リセット時刻、クレジットを右ペインで確認できます。任意の [CodexBar CLI](https://github.com/steipete/codexbar) が必要です。
- **複数のシェルに対応**: zsh、bash、fish、またはOSの既定シェルを選べます。Windows ではコマンドプロンプト、Windows PowerShell、PowerShell 7、Git Bash に対応しています。
- **テキストの自動コピー**: ターミナル出力をマウスで選択するとクリップボードへコピーします。
- **組み込みブラウザー**: ターミナルとは別のセッションでWebを表示でき、複数タブに対応しています。
- **カスタマイズ**: ショートカットの再割り当て、4種類のテーマ、UI・ターミナル・シェル設定に対応しています。
- **クロスプラットフォーム**: Linux、Windows、macOSで動作します。

画面構成、対応するプレビュー形式、Attentionの監視モード、Jevの設定、スクリーンショットは[機能と画面のガイド](docs/FEATURES_JP.md)をご覧ください。

## まず使ってみる

1. VINTAGEを起動すると、ホームディレクトリで `Space 1` と `Terminal 1` が開きます。
2. **Open folder** からプロジェクトを追加します。新しいターミナルは選択中のワークスペースを作業ディレクトリにします。
3. Spaceを追加したり、ターミナルを分割したりして作業環境を整理します。
4. コマンドパレット、またはAttention一覧から、目的のワークスペース、Space、ターミナルへ移動します。

## 既定のキーボードショートカット

ショートカットは **Settings → Shortcuts** から変更できます。設定は `Ctrl+S` で保存します。

| 操作                   | ショートカット |
| :--------------------- | :------------- |
| コマンドパレットを開く | `Ctrl+Shift+P` |
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

## CodexBarによるUsageパネル（任意）

右ペインの **Usage** タブに、Codex、Claude Code、OpenCode Go、GrokなどのAIプロバイダーの使用制限（ウィンドウごとの残りクォータ、リセット時刻、クレジット、取得できる場合は直近のコスト）を表示できます。この任意機能には [CodexBar CLI](https://github.com/steipete/codexbar) のインストールと設定が必要です。ターミナルで `codexbar` コマンドが実行できる状態にしてください。

**Settings → Usage** でパネルを有効にし、必要なら `codexbar` へのパスを指定します（空欄の場合は `PATH` と一般的なインストール先から自動検出します）。表示されるプロバイダーは `~/.config/codexbar/config.json` の有効フラグに従い、Claude Codeを追加するには `codexbar config enable --provider claude` を実行します。詳細は[機能と画面のガイド](docs/FEATURES_JP.md)をご覧ください。

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

RendererからNode.jsを利用できないよう分離し、OS機能へのアクセスをPreloadが公開する型付きIPCに限定しています。Projectはフォルダー選択ダイアログから追加します。ファイルプレビューは読み取り専用です。SSHなどShell Integrationが利用できない環境では、ターミナルイベントの検知精度が下がる場合があります。組み込みブラウザーはダウンロード、拡張機能、ログイン情報の保存に対応していません。

詳しくは[アーキテクチャ](docs/ARCHITECTURE.md)と[機能と画面のガイド](docs/FEATURES_JP.md)をご覧ください。

## ライセンス

本プロジェクトは **Apache License 2.0** のもとで公開されています。[LICENSE](LICENSE) と [NOTICE.md](NOTICE.md) をご確認ください。
