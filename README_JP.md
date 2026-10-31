<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-lockup-dark.svg">
  <img src="assets/brand/vintage-lockup-light.svg" alt="VINTAGE - Visual Interface for Terminal Agents" width="440">
</picture>

**AIエージェント時代のターミナルワークスペース**

## 動かすのはエージェント。呼び戻すのはターミナル。

VINTAGEは、複数のAIエージェントを1枚の画面で並走させるターミナルワークスペースです。
完了・エラー・入力待ち — 必要な瞬間に、向こうから知らせます。

[![Download for Linux](https://img.shields.io/badge/Linux-E8641C?style=for-the-badge&labelColor=1C1E20&logo=linux&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for macOS](https://img.shields.io/badge/macOS-E8641C?style=for-the-badge&labelColor=1C1E20&logo=apple&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Windows-E8641C?style=for-the-badge&labelColor=1C1E20&logo=windows&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)

Linux · macOS · Windows ／ Apache 2.0 オープンソース · [GitHub](https://github.com/Tomatio13/vintage2) · [機能ガイド](docs/FEATURES_JP.md) · [English](README.md)

https://github.com/user-attachments/assets/2b817ecc-8b04-4c2c-8a8c-d40265ad0dd3

</div>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

<div align="center">

**なぜVINTAGEか**

## 5つのエージェントを同時に実行中。<br />それぞれが今、何をしていますか？

</div>

ターミナルを1つ開き、もう1つ、さらに3つ。それぞれ別のエージェントに別の作業を任せています。1つは完了して入力待ち、1つはいつの間にかエラーで停止、残り2つはまだ実行中。どれがどの状態でしょうか。ウィンドウを切り替え、出力をスクロールしながら、あのリファクタリングをどのペインで始めたか思い出そうとしていませんか。

**並走には、状況が見える仕事場が必要です。VINTAGEがその仕事場です。**

<details>
<summary><b>3コマ漫画で見る、ある一日の流れ</b></summary>
<br />

<img src="assets/manga/manga-ja.png" alt="VINTAGEのある一日を3コマ漫画で紹介" width="640" />

<p align="center">
<a href="assets/manga/ja/page-01.png">page 1</a> · <a href="assets/manga/ja/page-02.png">page 2</a> · <a href="assets/manga/ja/page-03.png">page 3</a>
</p>

</details>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

## ターミナルのほうから、来る。

### <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/attention-dark.svg"><img src="assets/brand/icons/attention.svg" height="24" alt=""></picture> Attention

バックグラウンドのターミナルで完了・エラー・入力待ちを検知したら、こちらから通知します。クリックすれば、そのターミナルへ直接戻れる。ウィンドウを切り替えて探し直す日は、もう終わりです。

<img src="assets/readme/vintage-attention-routing.png" alt="Attention: 失敗したターミナルへの通知と、クリックで戻る様子" width="800" />

### <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/monitor-dark.svg"><img src="assets/brand/icons/monitor.svg" height="24" alt=""></picture> Monitor

CPU・メモリに加えて、マシン上のAIセッションをリアルタイムに表示。使用中のツール、コンテキスト使用率、残りクォータまで見えるので、「気づいたら上限」がなくなります。

<img src="assets/readme/vintage-monitor.png" alt="Monitor: CPU・メモリとAIセッションの使用状況" width="800" />

### <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/board-dark.svg"><img src="assets/brand/icons/board.svg" height="24" alt=""></picture> Board

タスクの投入から完了までを、エージェントと一緒に進められます。カードの更新もサブタスクの追加もエージェント側から。データはすべてローカルに保存されます。

<img src="assets/readme/vintage-board.png" alt="Board: エージェントと共有するカンバンボード" width="800" />

## 並走に必要なのは、これだけ。

|     | 機能                       | できること                                                                                                     |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 01  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/space-dark.svg"><img src="assets/brand/icons/space.svg" height="20" alt=""></picture> **Space分割** | ターミナルを左右・上下に分割し、エージェントをペイン単位で並走。各ペインは独立して動作するので、重いビルドもほかの作業を止めません。 |
| 02  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/sessions-dark.svg"><img src="assets/brand/icons/sessions.svg" height="20" alt=""></picture> **Sessions** | Claude Code / Codex / Grok / Antigravityの過去の会話を検索・ピン留め・閲覧・再開。「あの作業、どのセッションでやったっけ？」がなくなります。 |
| 03  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/palette-dark.svg"><img src="assets/brand/icons/palette.svg" height="20" alt=""></picture> **コマンドパレット** | `Ctrl+Shift+P` から、ワークスペース・Space・ターミナルへの移動と各種操作をまとめて検索。キーボードから手を離しません。 |
| 04  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/theme-dark.svg"><img src="assets/brand/icons/theme.svg" height="20" alt=""></picture> **テーマ** | Vintage · Graphite · Ocean · Grove · Iris · Ember。ライト・ダークの配色を個別に選択でき、JSONでの入出力にも対応します。 |

<details>
<summary><b>サイドバーとステータス表示の詳細</b></summary>

### ひと目でわかる状態表示

| 状態                                         | 表示                 |
| :------------------------------------------- | :------------------- |
| 通常ターミナル                               | `>_`                 |
| エージェント思考・実行中                     | 回転するスピナー     |
| 入力待ち                                     | メッセージアイコン   |
| 待機中                                       | 時計アイコン         |
| 完了                                         | チェックアイコン     |
| 警告・失敗                                   | 警告・エラーアイコン |
| エージェント検出済み・アイドルまたは状態不明 | ロボットアイコン     |

- 左サイドバーの右端をドラッグすると幅を変更できます。変更した幅は再起動後も保持されます。
- Spaceタブとサイドバーの行に状態アイコンを表示します。マウスを合わせると状態名を確認できます。OSの「動きを減らす」設定が有効な場合、スピナーは静止します。
- サイドバーではSpace名の右端に、MonitorのSessionsと同じ色付きAgentバッジ（CodexはCD、OpenCodeはOCなど）を表示します。実行中はバッジの枠がゆっくり明滅し、入力待ちは枠を強調、完了時は薄く表示します。
- MonitorではOpenCodeのバックグラウンドサーバー（`opencode2.exe serve --service` などの `serve` プロセス）とそのランチャーを除外し、通常の対話セッションを表示します。
- フッターの上ではGaryが小さな階段を登り降りし、りんごを食べながら左右に往復します。**Settings → Appearance → Sidebar Gary**で表示を切り替えられます。OSの「動きを減らす」設定が有効な場合は静止します。

</details>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

## 今すぐ、並走を始める。

インストーラーはGitHub Releasesから。無料・オープンソースです。

[![Download for Linux](https://img.shields.io/badge/Linux-E8641C?style=for-the-badge&labelColor=1C1E20&logo=linux&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for macOS](https://img.shields.io/badge/macOS-E8641C?style=for-the-badge&labelColor=1C1E20&logo=apple&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Windows-E8641C?style=for-the-badge&labelColor=1C1E20&logo=windows&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)

ソースからビルドする場合は、下のクイックスタートへ。

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

## <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/rocket-dark.svg"><img src="assets/brand/icons/rocket.svg" height="24" alt=""></picture> クイックスタート（ソースから）

```bash
pnpm install
pnpm dev
```

ホームディレクトリで`Space 1`と`Terminal 1`が開きます。

\*\*`Ctrl+Shift+P`\*\*でコマンドパレットを開き、ワークスペース・Space・ターミナルへの移動や各種操作を検索できます。

```bash
# 本番ビルドを起動
pnpm build && pnpm start

# 配布パッケージを作成
pnpm run dist:linux   # → AppImage, .deb
pnpm run dist:mac     # → .dmg, .zip
pnpm run dist:win     # → NSISインストーラー
```

## 必要環境

- **Node.js** 24以上
- **pnpm** 10.33.2以上
- **C/C++開発環境** — コンパイラー、`make`、Python（Linuxでの`node-pty`ビルド用）

## ドキュメント

- [機能と画面のガイド](docs/FEATURES_JP.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [Boardの保存形式とSkillの配布](docs/KANBAN.md)
- [English README](README.md) · [English: Features and screen guide](docs/FEATURES.md)

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>

**Apache 2.0** — [LICENSE](LICENSE) · [NOTICE.md](NOTICE.md)

<br />

_必要なターミナルが、あなたを呼び戻す。_

</div>
