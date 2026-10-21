<div align="center">

# VINTAGE

### AIエージェント時代のターミナルワークスペース。

<br />

> _エージェントを見張り続ける必要はありません。必要なときに、向こうから知らせます。_

<br />

[![License](https://img.shields.io/badge/Apache_2.0-blue?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js_24+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron_45-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![Platforms](https://img.shields.io/badge/Linux_%7C_macOS_%7C_Windows-555?style=for-the-badge)](./)

<br />

[使い始める](#-クイックスタート) · [機能を見る](docs/FEATURES_JP.md) · [アーキテクチャ](docs/ARCHITECTURE.md) · [English](README.md)

<br />
<br />

</div>

---

<br />

<div><video controls src="https://github.com/user-attachments/assets/ec6bb6ae-c658-48bf-9b5b-416ab75839d5" muted="false"></video></div>

<br />

---

<br />

<div align="center">

## 5つのエージェントを同時に実行中。<br />それぞれが何をしているか、把握できていますか？

</div>

<br />

ターミナルを1つ開き、もう1つ、さらに3つ。それぞれ別のエージェントに別の作業を任せています。1つは完了して入力待ち、1つはいつの間にかエラーで停止、残り2つはまだ実行中。どれがどの状態でしょうか。ウィンドウを切り替え、出力をスクロールしながら、あのリファクタリングをどのペインで始めたか思い出そうとしていませんか。

**複数のエージェントを動かすには、その状況を把握できる作業環境が必要です。VINTAGEがそれを支えます。**

<br />

---

<br />

## 主な機能

|     | 機能                 | できること                                                                                                                   |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ⚡  | **Attention**        | バックグラウンドのターミナルでの完了・エラー・入力待ちを通知。クリックすると、そのターミナルへ戻れます。                     |
| 🔲  | **Spaceの分割**      | ターミナルを左右・上下に分割し、エージェントを並べて実行。各ペインは独立して動作します。                                     |
| 🎛  | **コマンドパレット** | `Ctrl+Shift+P`から、ワークスペース・Space・ターミナルへの移動や各種操作をまとめて検索できます。                              |
| 📡  | **Monitor**          | CPU・メモリと、マシン上のAIセッションをリアルタイムに確認。使用中のツール、コンテキスト使用率、残りクォータも表示します。    |
| 🗄  | **Sessions**         | Claude Code / Codex / Grok / Antigravityの過去の会話を検索・ピン留め・閲覧・再開できます。                                   |
| 📋  | **Board**            | エージェントも操作できるKanbanボード。タスクの投入、カードの更新、サブタスクの追加、完了まで、データはローカルに保存します。 |
| 🎨  | **テーマ**           | Vintage · Graphite · Ocean · Grove · Iris · Ember。ライト・ダークの配色を個別に選択でき、JSONでの入出力にも対応します。      |

<br />

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

Spaceタブとサイドバーの行に状態アイコンを表示します。マウスを合わせると状態名を確認できます。OSの「動きを減らす」設定が有効な場合、スピナーは静止します。

<br />

---

<br />

## 🚀 クイックスタート

```bash
pnpm install
pnpm dev
```

ホームディレクトリで`Space 1`と`Terminal 1`が開きます。

**`Ctrl+Shift+P`**でコマンドパレットを開き、ワークスペース・Space・ターミナルへの移動や各種操作を検索できます。

```bash
# 本番ビルドを起動
pnpm build && pnpm start

# 配布パッケージを作成
pnpm run dist:linux   # → AppImage, .deb
pnpm run dist:mac     # → .dmg, .zip
pnpm run dist:win     # → NSISインストーラー
```

<br />

---

<br />

## 必要環境

- **Node.js** 24以上
- **pnpm** 10.33.2以上
- **C/C++開発環境** — コンパイラー、`make`、Python（Linuxでの`node-pty`ビルド用）

<br />

---

<br />

## ドキュメント

- [機能と画面のガイド](docs/FEATURES_JP.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [Boardの保存形式とSkillの配布](docs/KANBAN.md)
- [English README](README.md) · [English: Features and screen guide](docs/FEATURES.md)

<br />

---

<br />

<div align="center">

**Apache 2.0** — [LICENSE](LICENSE) · [NOTICE.md](NOTICE.md)

<br />

_必要なターミナルが、あなたを呼び戻す。_

</div>
