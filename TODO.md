# Attention Router TODO

更新日: 2026-09-23

## 現在の実装済み範囲

- [x] Agent Hookに依存しないTerminal監視
- [x] zsh / bash / fish向けShell Integration
- [x] OSC 133によるコマンド開始・コマンド文字列・終了コードの取得
- [x] foreground / background両方のTerminal監視
- [x] 明示的な入力待ち・Warning・Errorのローカル検知
- [x] TypeSafe/Jev System Oneによる意味判定
- [x] Choice / Score / Noulによる構造化判定
- [x] Confidence gateと低confidence時のWarning fallback
- [x] Semantic Hash cache
- [x] Jev APIのグローバルRate Limitとtimeout
- [x] ANSI / OSC除去、秘密情報redaction、送信量制限
- [x] 非同期Jev結果のstale-result rejection
- [x] Tab badge、Terminalラベル、Attention Sidebar
- [x] アプリ非アクティブ時のOS通知
- [x] SettingsからのJev APIキー暗号化保存
- [x] APIキー変更の実行中Terminalへの即時反映
- [x] Terminalへの実入力によるAttention acknowledge

## P0: 実行中Terminalの意味判定

- [x] コマンド実行中の出力変化をdebounceしてJev評価候補にする
- [x] ローカル判定で確定できない出力だけをJevへ送る
- [x] foreground Terminalも実行中評価の対象にする
- [x] 同じSemantic HashではJevを再呼び出ししない
- [x] Jevの`keepMonitoring`を再評価スケジュールへ反映する
- [x] 出力が継続する場合も最大頻度を制限する
- [x] 新しいコマンド開始・Terminal入力・session終了時に再評価をキャンセルする
- [x] 遅延したJev応答が新しい状態を上書きしないことをテストする
- [x] 入力待ちの対話CLIをコマンド終了前に検知できることをテストする
- [x] 長時間ログを出すプロセスでAPIを過剰に呼ばないことをテストする

### P0 完了条件

- [x] 終了しないAIエージェント／対話CLIの入力待ちを意味判定できる
- [x] Terminal描画と入力をJev通信がブロックしない
- [x] `pnpm verify`が成功する

## P1: Terminal状態コンテキストの拡充

- [x] foreground process名を取得する
- [x] PIDと最低限のprocess treeを取得する
- [x] process changeをTerminalイベントとして扱う
- [x] process情報をツール固有判定に使わず、共通Jevコンテキストへ追加する
- [x] OSC 133のPrompt Start / End（A/B）を状態判定へ利用する
- [x] OSC 7などから`cd`後の現在cwdを追跡する
- [x] Shell Integration非対応Shellのfallback方針を決める
- [x] process取得失敗時もTerminalが正常動作することをテストする

### P1 完了条件

- [x] Jevへ現在のcwdとforeground processを渡せる
- [x] Prompt復帰と実行中状態を明確に区別できる
- [x] ツール別Analyzerを追加していない

## P2: Evaluation Queueと負荷制御

- [x] アプリ全体のPriority Queueを実装する
- [x] P0: Waiting Input
- [x] P1: Command Failed
- [x] P2: Command End
- [x] P3: Warning Candidate
- [x] P4: Continuous Output
- [x] Terminal単位のクールダウンを追加する
- [x] 同一Terminalの重複評価を統合する
- [x] 混雑時に低Priority評価を安全に破棄する
- [x] APIキー変更時に古いevaluatorの待機処理を無効化する
- [x] 複数Terminal同時出力時のRate Limitをテストする

### P2 完了条件

- [x] 重要な入力待ち判定が通常の完了判定より優先される
- [x] Terminal数が増えてもJev API呼び出し上限を超えない

## P3: 監視設定

- [x] Terminal単位の監視モードを定義する
- [x] `Monitor`
- [x] `Ignore`
- [x] `Mute`
- [x] `Always Notify`
- [x] `Ignore until error`
- [x] SettingsまたはTerminalメニューから変更できるようにする
- [x] 設定を再起動後も復元する
- [x] debounce、Attention threshold、通知レベルのアプリ設定を追加する
- [x] 設定変更を実行中Terminalへ即時反映する

### P3 完了条件

- [x] 開発サーバーなど常時稼働Terminalをユーザーが適切に抑制できる
- [x] Mute中でもTerminal自体の動作や出力には影響しない

## P4: 通知とUI

- [x] HIGH / CRITICAL向けアプリ内Toastを追加する
- [x] CRITICAL専用の色・アイコン・永続表示を追加する
- [x] OS通知クリック時に対象Workspace / Tab / Paneへ移動する
- [x] Attentionを手動Dismissできるようにする
- [x] Attention履歴を表示する
- [x] 判定元（Shell / PTY / Jev）とconfidence / modelを詳細表示できるようにする
- [x] 同じAttentionの通知重複をUIレベルでも抑止する
- [x] キーボードだけでAttention一覧を移動できるようにする

### P4 完了条件

- [x] 通知から対象Terminalへ1操作で移動できる
- [x] LOW / MEDIUM / HIGH / CRITICALが視覚的に区別できる

## P5: 学習型最適化

- [ ] Dismiss・確認までの時間・無視をローカル特徴量として記録する
- [ ] 頻繁に無視される通知のimportanceを下げる
- [ ] 即座に確認される状態のimportanceを上げる
- [ ] Terminalごとの傾向を保存する
- [ ] 個人情報やTerminal出力本文を学習履歴へ保存しない
- [ ] 学習データをSettingsから削除できるようにする

## ドキュメント整合性

- [x] `docs/AttentionRouter.md`のForeground監視抑制に関する古い記述を更新する
- [x] Output Change / Continuous Outputの説明を実装後の挙動に合わせる
- [x] Evaluation Queue実装後に優先度と破棄条件を文書化する
- [x] Settings追加後にREADMEへ設定方法を追記する

## 意図的に実装しないもの

- [x] Agent固有Hookへの依存
- [x] SSH、Docker、Terraform、Gitなどのツール別Analyzer
- [x] Jevによる固定間隔の無条件Polling
- [x] PTY出力全量の外部送信

## 推奨する次の作業

- [x] P0〜P3の監視・Queue・Terminal別設定を実装し、自動テストで確認する
- [x] P4: app内Toast、CRITICAL表示、Attention履歴、対象Terminalへの通知遷移を実装する
- [ ] 実際の対話CLIと長時間ログで動作確認する
