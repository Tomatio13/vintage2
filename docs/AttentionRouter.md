# Attention Router 設計書

## 1. 概要

Attention Router は、ターミナルアプリ内で複数の Terminal / Tab / Pane を利用している際に、各セッションの状態を自動的に把握し、ユーザーが確認すべき対象を優先的に提示する機能である。

Codex、Claude Code 等のAIエージェントが提供する Hook ベースの状態通知とは異なり、Attention Router は通常のシェルコマンド、ビルド、テスト、SSH、Docker、Terraform 等を含む任意の Terminal セッションを対象とする。

PTY、Shell Integration、プロセス情報、終了コード、Terminal 出力等をローカルで解析し、意味的判断が必要な場合のみ Jev を利用する。

主目的は以下である。

- foreground/backgroundを問わず、全Terminalの異常・完了・入力待ちを検知する
- ユーザーが「次に見るべき Terminal」を明確にする
- 不要なAI API呼び出しを抑制する
- Terminal の操作感や描画性能に影響を与えない
- AIエージェントを使用していない通常の Terminal でも状態把握を可能にする

---

## 1.1 現在の実装（2026-09-23）

現在の実装はAgent固有Hookを使わず、zsh / bash / fishのShell Integration（OSC 133）、終了コード、PTY出力、Paneのforeground/background状態を共通入力とする。カーソルがあるforeground Terminalも監視対象とし、focusだけではAttentionを解除せず、Terminalへの実入力でacknowledgeする。

ローカル側は、コマンド開始・終了・明示的な入力プロンプト・非ゼロ終了など、意味解釈を必要としない事実を優先する。ツールごとのAnalyzerは追加せず、曖昧な正常終了出力だけをTypeSafe/JevのSystem Oneへ送り、Choice（status）、Score（attention level）、Noul（action required / keep monitoring）を1リクエストで判定する。

Jev連携はSettingsで暗号化保存したAPIキー、またはTYPESAFE_API_KEY環境変数がある場合に有効になる。保存済みキーを優先し、保存・置換直後に共有evaluatorへ反映する。Rendererへキーは返さない。送信前にANSI/OSCと秘密らしい値を除去し、出力は末尾40行・最大4,000文字、cwdはbasenameのみに制限する。10秒timeout、再試行なし、毎秒2件・毎分30件の上限、Semantic Hash cacheを適用する。状態事実は確信度0.5未満で棄却し、attentionスコアの確信度が0.5未満の場合はスコアを状態の下限レベルに留める。API失敗や古くなった非同期結果は採用しない。Jevがturn完了を判定したAgent Monitorは、実入力または新しいJev判定があるまで出力だけではthinkingへ戻さない。実行中はSettingsで指定したdebounce（既定800 ms）後に出力をローカル判定し、入力待ち・警告・エラーと確定できない曖昧な出力だけを評価する。連続出力はTerminalごとに最短5秒間隔とし、正規化後のSemantic Hashが同じ候補は再送しない。Agent Monitorの定期判定は、出力が変化しない場合は間隔を2倍ずつ（上限6倍）拡大し、出力を検知した時点で次回判定を直近の基準間隔まで引き戻す（判定を後ろに延ばさない）。Semantic Hash cacheの重複判定には実行時間（duration）を含めない。`keepMonitoring` は15秒後の安全な再確認予約へ反映するが、出力が変わらなければ再送しない。新コマンド、実入力、session終了、または追加出力で古い予約・応答を無効化する。

P1では、OSC 7の`file://` URIからcwdを更新し、OSC 133 A/BでPrompt復帰を実行中状態から分離する。PTY配下のプロセス情報は1秒ごとに共通コンテキストとしてベストエフォート取得する。対応外OS、`ps`失敗、権限不足時は情報を省略し、TerminalのI/O・Attention判定は継続する。

P2ではアプリ共通のEvaluation Queueを利用する。入力待ち候補、コマンド失敗、コマンド完了、警告候補、連続出力の順で優先し、Terminalごとに1秒のクールダウンを設ける。同じTerminalに待機中の要求が複数届いた場合は、最新コンテキストへまとめ、より高い優先度を保つ。新しいコマンド、実入力、Terminal終了では該当Terminalの待機要求をキャンセルする。待機上限は64件で、上限時は最も低い優先度の待機要求だけを破棄する。API要求はアプリ全体で毎秒2件・毎分30件までに制限し、同じ評価器の設定が変更された場合は待機要求と古い評価結果を無効化する。

---

# 2. コンセプト

従来の Terminal は、基本的に

> 「出力された文字列を表示する」

ことを役割としている。

Attention Router を搭載した Terminal では、これを

> 「複数の Terminal の中から、ユーザーが見るべきものを把握する」

へ拡張する。

例：

```text
┌─ Terminals ────────────────────────────────┐
│                                            │
│ ● api-server        Running               │
│ ✓ docker-build      Completed             │
│ ✕ unit-test         Failed                │
│ ◉ terraform         Waiting for input     │
│ ○ ssh-production    Idle                  │
│                                            │
└────────────────────────────────────────────┘
```

foreground/backgroundを問わず全Terminalを監視し、Paneの状態はJev判定の文脈として利用する。

---

# 3. 対象範囲

## 3.1 対象

以下の Terminal セッションを対象とする。

- Bash
- Zsh
- Fish
- PowerShell
- SSH セッション
- Docker / Podman
- Kubernetes CLI
- Terraform
- Git
- Build Tool
- Test Runner
- Development Server
- CLIアプリケーション
- Codex / Claude Code 等のAI Agent

AI Agentも通常のCLIアプリケーションとして扱い、Agent固有のHookには依存しない。

---

## 3.2 対象外

初期バージョンでは以下は対象外とする。

- Terminal出力内容の自動修正
- コマンドの自動実行
- AIによるコマンド生成
- エラー原因の詳細解析
- 自律的なAgent操作
- Terminal履歴全体のクラウド送信

Attention Router は原則として

**Observe → Judge → Notify**

までを担当し、

**Act**

は行わない。

---

# 4. システム構成

```text
                       Terminal Application
                               │
                               │
                              PTY
                               │
                               ▼
                  ┌──────────────────────┐
                  │ Terminal Event Layer │
                  └──────────┬───────────┘
                             │
          ┌──────────────────┼───────────────────┐
          │                  │                   │
          ▼                  ▼                   ▼
   Shell Integration    Process Monitor      Output Stream
          │                  │                   │
          └──────────────────┼───────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │ Local Event Analyzer │
                  └──────────┬───────────┘
                             │
                     interesting event?
                       │           │
                      No          Yes
                       │           │
                    Ignore         ▼
                             ┌───────────┐
                             │ Jev Judge │
                             └─────┬─────┘
                                   │
                                   ▼
                       ┌────────────────────┐
                       │ Attention State    │
                       │ Manager            │
                       └─────────┬──────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
              Tab Badge       Sidebar        Notification
```

---

# 5. Terminal Event Layer

Terminal内部で発生するイベントを統一形式へ変換する。

## 5.1 Event

```typescript
interface TerminalEvent {
  terminalId: string;
  paneId?: string;

  type:
    | "command_start"
    | "command_end"
    | "output"
    | "prompt"
    | "process_change"
    | "input_request"
    | "session_start"
    | "session_end";

  timestamp: number;

  command?: string;

  exitCode?: number;

  cwd?: string;

  foregroundProcess?: string;

  output?: string;
}
```

---

# 6. 情報取得

状態判定には以下の情報を利用する。

## 6.1 Shell Integration

Shell Integration が利用できる場合は最優先で利用する。

取得候補：

```text
command start
command finish
command line
exit code
cwd
prompt start
prompt end
```

OSC 133 等の利用を想定する。

---

## 6.2 PTY

PTYから以下を取得する。

```text
stdout
stderr相当出力
ANSI sequence
interactive prompt
```

PTY出力全量はJevへ送信しない。

---

## 6.3 Process State

可能であればTerminalのforeground processを取得する。

例：

```text
bash
pytest
cargo
npm
docker
ssh
terraform
vim
codex
claude
```

---

# 7. Local Event Analyzer

Jevを呼び出す前段として、ローカル判定を行う。

目的は以下。

- API利用料金削減
- API Call数削減
- レイテンシ削減
- 不必要なデータ送信削減

---

## 7.1 ローカルで判定可能なもの

以下は原則Jevを使用しない。

### 正常終了

```text
exitCode = 0
```

かつ特殊な警告が存在しない場合。

---

### 明確な異常終了

```text
exitCode != 0
```

ただし grep 等、一部コマンドは例外とする。

---

### Process終了

foreground processの終了。

---

### Shell Prompt復帰

Shell Integrationによりprompt復帰を検出。

---

### Outputなし

状態変化がなければ処理しない。

---

# 8. Jev Judge

ローカル判定では判断できない状態についてJevを使用する。

## 8.1 Jev入力

Jevへ送信する情報は最小限とする。

例：

```json
{
  "command": "terraform plan",
  "process": "terraform",
  "cwd": "~/workspace/project-a",
  "exit_code": 0,
  "duration_sec": 31,
  "background": true,
  "output_tail": ["Plan: 3 to add, 1 to change, 17 to destroy."]
}
```

原則としてTerminal scrollback全体は送信しない。

---

# 9. Jev判定項目

1回のリクエストで複数項目を判定する。

## Status

```text
running
completed
failed
waiting_input
warning
idle
unknown
```

---

## Attention Level

```text
NONE
LOW
MEDIUM
HIGH
CRITICAL
```

内部表現：

```text
0..4
```

---

## User Action Required

```text
true
false
```

---

## Notification

```text
none
badge
toast
system_notification
```

---

## Keep Monitoring

```text
true
false
```

---

# 10. Terminal State

各Terminalについて以下の状態を保持する。

```typescript
interface AttentionState {
  terminalId: string;

  status: "running" | "completed" | "failed" | "waiting_input" | "warning" | "idle" | "unknown";

  attentionLevel: 0 | 1 | 2 | 3 | 4;

  userActionRequired: boolean;

  lastCommand?: string;

  lastExitCode?: number;

  lastEvaluationAt?: number;

  lastActivityAt?: number;

  semanticHash?: string;

  notificationSent: boolean;
}
```

---

# 11. Attention Level

## Level 0: NONE

例：

```text
development server running
tail -f
shell idle
```

UI：

```text
表示なし
```

---

## Level 1: LOW

例：

```text
command completed normally
```

UI：

```text
✓
```

---

## Level 2: MEDIUM

例：

```text
warning
unexpected output
long running command completed
```

UI：

```text
⚠
```

---

## Level 3: HIGH

例：

```text
test failure
build failure
SSH disconnected
```

UI：

```text
✕
```

---

## Level 4: CRITICAL

例：

```text
production deployment confirmation
destructive operation waiting
credential / security warning
```

UI：

```text
!!
```

---

# 12. 監視戦略

固定間隔のPollingは基本的に行わない。

基本方針：

```text
Event Driven
+
Adaptive Polling
```

とする。

---

# 13. Jev呼び出しタイミング

## Command End

まず終了コードとローカル検知結果を反映する。正常終了したコマンドの出力が曖昧な場合は、P2としてアプリ共通Queueへ評価を依頼する。終了コードで確定する失敗やローカル検知できた入力待ちはJevを呼ばず即時反映する。

```text
command_end
    ↓
Local Analyzer
    ↓
必要ならJev
```

---

## Output Change

foreground/backgroundを問わず、実行中の出力変化をSettingsのdebounce値（既定800 ms）でdebounceしてローカル判定する。入力待ち・明確な警告やエラーでなければ、曖昧な候補をJev Queueへ送る。Paneがactiveかどうかは判定コンテキストに含める。

```text
output
 output
  output
     │
     └── configurable debounce (default 800ms)
               │
               ▼
          Local Analyzer
```

---

## Continuous Output

大量ログ等の再評価はTerminalごとに最低5秒あけ、同じSemantic Hashは再送しない。Jevが継続監視を求めた場合は15秒後に再確認するが、その間に出力が変わらなければ再送しない。

```text
Terminalごとに最低5秒間隔
keepMonitoringの再確認は15秒後
```

---

## Foreground Terminal

background Terminalと同じ規則で監視する。active状態はJevの文脈として使い、focusだけではAttentionを解除しない。

---

## Background Terminal

同じ規則で監視し、アプリが非アクティブな場合はHIGH以上をOS通知する。

---

# 14. 推奨監視周期

初期設定：

| 状態                         | 判定                                            |
| ---------------------------- | ----------------------------------------------- |
| foreground/background output | 設定可能なdebounce（既定800ms）後にローカル判定 |
| Command終了                  | ローカル即時反映、曖昧ならP2 Queue              |
| 明示的なPrompt/Input         | ローカル即時反映、曖昧な候補はP0 Queue          |
| Continuous output            | Terminalごとに最低5秒、Hash重複は再送なし       |
| keepMonitoring               | 出力変化があれば15秒後に再確認                  |
| Outputなし                   | 判定なし                                        |
| Process監視                  | ローカル1秒ごと                                 |
| 状態変化なし                 | Jevなし                                         |

---

# 15. Semantic Hash

同じ状態について繰り返しJevを呼ばない。

以下を元にHashを生成する。

```text
command
process
exitCode
normalizedOutputTail
statusHints
```

例：

```text
SHA256(
  "pytest"
  + "pytest"
  + "1"
  + "FAILED test_auth"
)
```

前回と一致した場合：

```text
SKIP
```

---

# 16. Output Normalization

時刻やprogress情報によって毎回Hashが変わることを防ぐ。

例：

```text
Downloading 37%
Downloading 38%
Downloading 39%
```

を、

```text
Downloading <PERCENT>
```

へ正規化する。

その他：

```text
timestamp
PID
progress %
transfer speed
spinner
ANSI escape sequence
```

等を可能な範囲で除去する。

---

# 17. 状態遷移

```text
                 ┌───────────┐
                 │   IDLE    │
                 └─────┬─────┘
                       │ command
                       ▼
                 ┌───────────┐
                 │  RUNNING  │
                 └─────┬─────┘
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
      COMPLETED      FAILED     WAITING_INPUT
          │            │             │
          │            │             │
          └────────────┴─────────────┘
                       │
                 user inputs
                       │
                       ▼
                 ACKNOWLEDGED
                       │
                       ▼
                      IDLE
```

---

# 18. Acknowledge

Attention状態は通知しただけでは解除しない。

以下のタイミングでacknowledgeする。

```text
Terminalに入力
```

ただしマウス報告（DECSET 1003/1006）・フォーカス報告（1004）・デバイス属性等のクエリ応答は、TUIアプリが有効化した追跡モードにより発生するプロトコル通信であり実入力として扱わない。acknowledge・turn完了ラッチの解除・Jev評価のキャンセルは実打鍵のみで行う。

PaneのfocusやTabの選択だけでは解除しない。別作業中にカーソルが残っているTerminalも監視を継続する。

---

# 19. UI

## Agent Status Circle

各Workspace(Space)とTerminalの実行状態は、色付きのサークルで常時表示する。SidebarのWorkspace行・Tab行と、Spaceタブに表示され、どの画面からでもAIエージェントの実行状況がわかる。色はテーマトークン(`--color-agent-*`)で定義し、ライト/ダーク両テーマに追従する。

```text
Thinking       青（点滅）
Running        緑（点滅）
Waiting        黄（中空）
Input needed   黄（塗り・点滅）
Completed      緑
Warning        赤橙（中空）
Failed         赤橙（塗り）
Idle           表示なし
```

SpaceやSidebarの行に複数のPaneがある場合は、最も緊急度の高い状態を1つ表示する。優先度は waiting_input > failed > warning > thinking > waiting > running > completed で、attention levelとaction requiredで加算する。

## Tab

例：

```text
API Server

✓ Docker

✕ pytest

◉ terraform
```

---

## Sidebar

```text
ATTENTION

◉ terraform
  Waiting for input

✕ pytest
  Test failed

⚠ backend
  Warning detected

✓ docker
  Build completed
```

Attention Level順に並べる。

---

# 20. Notification Policy

通知疲れを避ける。

## NONE / LOW

OS通知：

```text
なし
```

Tab badgeのみ。

---

## MEDIUM

Terminal内通知。

---

## HIGH

Terminal内Toast。

バックグラウンドアプリの場合：

```text
OS Notification
```

---

## CRITICAL

CRITICAL専用の色・Octagon iconを使ったアプリ内Toastを表示し、DismissまたはOpen terminalまで表示を維持する。OS通知もプラットフォームのcritical urgency / timeout設定を使って目立たせる。

HIGHのToastは8秒で自動的に閉じる。ToastとSidebarは判定元、Jev confidence / modelを表示し、LOW / MEDIUM / HIGH / CRITICALは色・ラベル・アイコンを組み合わせて区別する。ToastのOpen terminal、Sidebar項目、OS通知クリックはいずれも対象Workspace / Tab / Paneを選択する。

Attentionは実入力によるacknowledge、解決、または手動Dismissで現在一覧から外れ、SidebarのAttention Historyに結果と時刻を残す。DismissはAttention状態をクリアするだけで、実行中コマンドやPTYを停止しない。履歴はアプリの実行中だけ保持し、直近100件まで表示する。現在一覧と履歴一覧は↑ / ↓で循環移動し、Home / Endで先頭・末尾へ移動できる。

UIイベントIDとMain processの重複キーで同一Attentionの重複通知を抑止し、通知は毎秒2件・毎分30件を上限とする。

---

# 21. Rate Limit

アプリ全体で制御する。現在の値は次のとおり。

```text
最大 2 Jev requests / second

最大 30 requests / minute

Terminal単位:
Queue cooldown: 1 sec

Continuous output: 最低5 sec間隔
```

P0 Waiting Input、P1 Command Failed、P2 Command End、P3 Warning Candidate、P4 Continuous Outputの順で処理する。同じTerminalの待機要求は最新コンテキストへ統合する。

---

# 22. Evaluation Queue

```text
Terminal Events
      │
      ▼
┌───────────────┐
│ Priority Queue│
└───────┬───────┘
        │
        ├─ P0 Waiting Input
        ├─ P1 Command Failed
        ├─ P2 Command End
        ├─ P3 Warning Candidate
        └─ P4 Continuous Output
```

待機上限は64件。上限時に新しい要求が既存要求より優先度が高ければ最低優先度の待機要求を破棄し、同等以下なら新しい要求を破棄する。評価器の設定変更時は待機中の要求と旧設定で開始した結果を無効化する。

---

# 23. Privacy

Jevへの送信情報は最小限にする。

送信対象：

```text
command
process
exit code
必要なoutput tail
状態メタデータ
```

除外候補：

```text
環境変数
secret
password
token
SSH key
大量のscrollback
```

以下の形式はローカルでmaskする。

```text
AWS_ACCESS_KEY_ID
Authorization:
Bearer ...
password=
token=
secret=
```

---

# 24. Attention Settings

SettingsのAttentionで次のアプリ共通設定を編集できる。保存後、Main processが開いている全Terminalへ変更を直ちに配信する。

| 設定                           | 範囲          | 既定値 | 適用                                                  |
| ------------------------------ | ------------- | ------ | ----------------------------------------------------- |
| Output debounce                | 100〜5,000 ms | 800 ms | 実行中出力のローカル判定とJev候補の待ち時間           |
| Attention threshold            | LOW〜CRITICAL | LOW    | Sidebar、Tab badge、Terminal attention表示の下限      |
| Desktop notification threshold | LOW〜CRITICAL | HIGH   | OS通知の下限。Integrationsの通知全体OFFは引き続き優先 |

設定とTerminal mode overrideはElectron `userData/attention-settings.json`へ保存する。これは秘密情報を含まない設定ファイルで、modeの照合にはworkspace path・tab title・pane titleから作成したSHA-256識別子だけを記録する。Terminal出力や平文パスは保存しない。保存するprofile数には上限2,000件を設ける。

---

# 25. Terminal単位の監視モード

各Terminal headerのmenuから個別に切り替え、modeを前述のsettings fileへ保存する。

| モード             | 挙動                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Monitor            | アプリ共通のthreshold・notification thresholdに従う通常監視                                                      |
| Ignore             | Attentionを抑止し、保留中のJev評価を破棄する。PTYの入出力とShell Integrationは継続                               |
| Mute               | 検知・表示は継続し、native OS notificationだけを抑止                                                             |
| Always Notify      | Attention thresholdとnative notification threshold、アプリfocus条件をbypassする。Integrationsの通知全体OFFは尊重 |
| Ignore until error | 通常の完了・warningは抑止し、non-zero終了または明確なerror outputを表示する                                      |

これにより開発サーバーのような長時間プロセスはIgnore / Muteで調整できる。MuteはPTY、Shell、Terminal renderingを停止・変更しない。モード選択は現在のworkspace/tab/pane構成が再起動後に復元されない制限下で、同じworkspace path・tab title・pane titleの組み合わせに適用される。

---

# 26. Agent-independent Operation

Attention RouterはCodexやClaude Code等のAgent固有Hookを使用しない。

AI Agentも通常のCLIアプリケーションとして扱い、Shell Integration、PTY output、Process State、Exit Code、Local Pattern Matching、Jev Semantic Judgmentという共通信号だけで監視する。

この制約により、AgentのバージョンやHook仕様に依存せず、通常のシェルコマンドと同じ監視経路を利用できる。

---

# 27. 優先順位

状態情報の信頼度は以下とする。

1. Shell Integration
2. Process State
3. Exit Code
4. Local Pattern Matching
5. Jev Semantic Judgment

Jevは既知の明確な事実を置き換えるものではなく、曖昧なTerminal状態を意味的に判断する補助レイヤーとして利用する。

---

# 28. Failure Handling

Jev APIが利用できない場合でもTerminal自体は正常動作する。

```text
Jev timeout
Jev server error
network unavailable
rate limit
```

の場合：

```text
Local Analyzerのみで継続
```

Attention RouterはTerminal描画・入力を絶対にblockしない。

---

# 29. 非同期処理

Attention RouterはUI Threadとは完全に分離する。

```text
PTY
 │
 ▼
UI Thread

     Events
       │
       ▼
Attention Worker
       │
       ▼
Jev Worker
       │
       ▼
State Store
       │
       ▼
UI Update
```

---

# 30. 性能要件

Attention Router追加によるTerminal性能への影響を最小化する。

目標：

```text
PTY描画遅延:
実質ゼロ

Local Analyzer:
< 5ms / event

UI更新:
< 16ms

Jev:
完全非同期
```

---

# 31. MVP

最初の実装では以下に限定する。

## Phase 1

対応：

```text
Shell Integration
Command Start / End
Exit Code
Output Tail
Background判定
```

Jev判定：

```text
running
completed
failed
waiting_input
warning
```

UI：

```text
Tab Badge
```

---

## Phase 2

追加：

```text
Attention Sidebar
Semantic Hash
Rate Limiting
System Notification
```

---

## Phase 3

追加：

- TypeSafe/Jev System One integration
- Choice / Score / Noulによる構造化判定
- 送信前redactionと最小コンテキスト化
- Confidence gate
- 非同期stale-result rejection

SSH、Docker、Terraform、Git等のツール別Analyzerは追加しない。すべて同じTerminal状態契約でJevへ意味判定を委ねる。

---

## Phase 4

学習型最適化。

例：

```text
ユーザーが毎回無視する通知
    ↓
importanceを下げる

ユーザーが即座に確認する通知
    ↓
importanceを上げる
```

Jevには個人情報ではなく、Terminalイベントの特徴量のみを利用する。

---

# 32. MVPで最初に検証するケース

最低限以下のテストを実施する。

### 成功

```bash
npm run build
```

期待：

```text
Completed
```

---

### Build Failure

```bash
cargo build
```

期待：

```text
Failed
HIGH
```

---

### Test Failure

```bash
pytest
```

期待：

```text
Failed
HIGH
```

---

### Interactive

```bash
terraform apply
```

期待：

```text
Waiting for input
HIGH
```

---

### Development Server

```bash
npm run dev
```

期待：

```text
Running
NONE
```

---

### SSH切断

```bash
ssh server
```

期待：

```text
Warning
HIGH
```

---

### Long Log

```bash
docker compose up
```

期待：

```text
頻繁にJevを呼ばない
異常発生時のみAttentionを上げる
```

---

# 33. 設計上の重要原則

Attention Routerでは以下を原則とする。

### 1. AI-firstにしない

まずローカル情報を利用する。

```text
Rule first
Semantic judgment second
```

---

### 2. foreground/backgroundを問わず監視する

Attention Routerの価値は、

```text
foreground Terminalも含めて全Terminalの状態を把握し、background Terminalは通知でユーザーへ伝えること
```

にある。

---

### 3. JevをPolling Engineにしない

Jevは定期監視ではなく、

```text
meaningful event classifier
```

として使用する。

---

### 4. Terminalを止めない

Jevが停止してもTerminalは動作し続ける。

---

### 5. 「何が起きたか」より「見る必要があるか」

Attention Routerの最終目的は、

```text
Which terminal needs my attention?
```

への回答である。

---

# 34. 将来構想

将来的にはTerminal全体に、

```text
Attention Score
```

を持たせる。

例：

```text
┌────────────────────────────────────┐
│ Attention                          │
│                                    │
│ 94  terraform-prod                 │
│ 81  unit-tests                     │
│ 36  docker-build                   │
│  5  dev-server                     │
└────────────────────────────────────┘
```

ユーザーがTerminalを探すのではなく、

**Terminal側から重要なセッションを浮かび上がらせる**

UIを目指す。

Attention RouterはAIチャット機能ではなく、

**Semantic Terminal Infrastructure**

としてTerminalの基盤機能に位置付ける。

# 35. 参照

https://docs.typesafe.ai/sdk/javascript
