# gr8r-studio Board 分析と VINTAGE 移植設計

作成日: 2026-10-13。対象: `/home/masato/Workspace/gr8r-studio` と VINTAGE の現在のチェックアウト。
本書の初稿は移植の設計案。Phase A の結果は第11節、参考画像を受けた最新の実装結果は第12節。

## 1. 推奨方針

VINTAGE の既存 Board を段階的に拡張する。gr8r-studio から取り込む中心は、固定幅の列、列内スクロール、簡潔なカード、列内の追加フォーム、詳細ドロワー、列の折りたたみ、挿入位置の分かるドラッグ操作。

初期移植は既存の `todo / doing / done` と version 1 JSON を維持する。Board は右ペインに置き、Notes からのカード作成、AI 指示コピー、外部更新の検知を引き継ぐ。優先度・ラベル・期限・サブタスクは後続の version 2 拡張とする。gr8r-studio の組織管理や5状態を最初から持ち込む必要はない。

## 2. 調査範囲と証拠

両プロジェクトのソース、CSS、保存処理、VINTAGE の既存テストと `docs/KANBAN.md` を確認した。両ルートに `.codegraph/` と `graphify-out/` はない。README の `docs/preview.png` は Home の画像であり、Board の実画面ではない。本書の Board UI 分析はソースと CSS に基づく。ブラウザ操作・Electron 実機確認は未実施。

参照側の主要ファイル:

| ファイル（gr8r-studio ルートから） | 分析対象                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| `src/views/board.js`               | `kcard`, `boardHtml`: カードと列                          |
| `src/styles/views/board.css`       | 列幅、スクロール、カード、ドロップ線                      |
| `src/core/constants.js`            | 状態、優先度、ラベル                                      |
| `src/shell/view-engine.js`         | `applyView`, `sortTasks`, `viewToolbar`: 検索とフィルター |
| `src/pages/project.js`             | プロジェクト Board と空状態                               |
| `src/actions/drag-drop.js`         | カード移動と順序計算                                      |
| `src/actions/actions.js`           | 入力フォーム、列操作、完了・アーカイブ                    |
| `src/overlays/context-menu.js`     | カード・列のメニュー                                      |
| `src/overlays/drawer.js`           | タスク詳細                                                |
| `src/core/store.js`                | localStorage 保存と画面状態                               |

VINTAGE の統合点:

| ファイル                                                  | 現在の役割                                        |
| --------------------------------------------------------- | ------------------------------------------------- |
| `src/renderer/components/SidePane.tsx`                    | Board タブ、Workspace ごとの NotesPane            |
| `src/renderer/components/NotesPane.tsx`                   | Notes と Board の表示切替、選択文からのカード作成 |
| `src/renderer/components/KanbanBoard.tsx`                 | CRUD、列間 DnD、Undo、AI コピー、3秒更新、下書き  |
| `src/shared/kanban.ts`                                    | version 1 型と厳密な検証                          |
| `src/shared/desktop.ts`, `src/preload/index.ts`           | 型付き read/save/copy API                         |
| `src/main/index.ts`                                       | 登録済み Workspace を解決する IPC                 |
| `src/main/kanbanStore.ts`                                 | 保存先、revision、ロック、atomic replace          |
| `src/main/kanbanCli.ts`, `src/main/kanbanInstructions.ts` | Python helper と AI 指示                          |
| `tests/KanbanBoard.test.tsx`, `tests/KanbanStore.test.ts` | UI・保存・CLI の既存回帰確認                      |

## 3. gr8r-studio Board の UI と機能

### 3.1 レイアウト

- `Backlog / To Do / In Progress / Review / Done` の固定5列。
- Board は横スクロールする flex。列幅284px、列間12px、上余白14px。
- 列は沈んだ背景・薄い境界線・角丸。カードは上に重なる surface と控えめな影。
- 列ヘッダーに状態アイコン、名称、件数、追加、列メニュー。
- 列内は縦スクロール、ヘッダーは列本体の外。スクロールバーは非表示。
- 折りたたみ列は44pxで縦書き名称と件数を表示する。
- ツールバーに検索、Filter、Sort。Board の Group 選択は表示しない。

### 3.2 カード

上からラベル、タイトル、サブタスク進捗、メタ情報の順。メタ情報はタスクキー、優先度、期限、繰り返し、コメント数、添付数、担当者。全タスク Board では所属プロジェクトの色も表示する。値がないメタ情報は省略する。

完了カードはタイトルを薄くし、取り消し線と完了アイコンを付ける。ホバーで完了／再開、Quick edit、More が現れる。クリックすると詳細ドロワー。優先度・期限・担当者はカードから直接変更できる。

### 3.3 作成・移動・列操作

- 列ヘッダーと末尾の Add task から列内フォームを開く。状態とプロジェクトを引き継ぐ。
- Enter で作成、Esc でキャンセル。作成後も入力フォーカスを維持する。
- HTML DnD でカード中央より上／下を判断し、挿入線を表示する。
- 移動時は状態と `order` を更新する。間への挿入は隣接 order の平均値。
- 列メニューは追加、折りたたみ、一括完了（Done 列は完了カードのアーカイブ）、優先度順の並べ替え。
- 一括完了・アーカイブには Undo がある。

### 3.4 詳細と保存

詳細にはタイトル、状態、優先度、担当者、期限、開始日、ラベル、繰り返し、見積もり、依存タスク、説明、サブタスク、添付、コメント、活動履歴がある。説明は contenteditable の HTML。

状態は共有オブジェクトに置き、イベント委譲で変更後に HTML を再描画する。`gr8r.v2` localStorage に data / prefs / views / sidebar collapsed を150ms遅延保存する。列の折りたたみは `S.ui.collapsedCols` にあり、この保存対象には含まれない。認証・メンバー等のUIはあるが、確認した保存経路はローカルのデモデータであり、共同編集バックエンドは移植対象として確認できない。

### 3.5 そのまま移さない挙動

1. **Sort とカード順の不一致**: `applyView` は選択された Sort を適用するが、`boardHtml` は各列を再び `order` 順にする。VINTAGE は表示順を1つの selector で決定する。
2. **順序計算の範囲**: DnD の `colTs` は同状態の非アーカイブ全タスクから選ぶため、別プロジェクトも計算に入る。VINTAGE は対象 Board のスナップショットだけを使う。
3. **列一括操作の範囲**: `colTasks` は検索・フィルターを再適用しない。一覧の見えていないカードも操作され得る。移植するなら対象件数と範囲を明示する。
4. **保存失敗の扱い**: 参照側は localStorage の失敗を握りつぶす。VINTAGE の保存エラー表示と下書き保持を維持する。
5. **HTML説明と全体再描画**: VINTAGE は React と既存 Markdown を使う。DOM文字列・グローバルイベント委譲・未検証HTMLは移植しない。
6. **非表示スクロールバーとホバー操作**: VINTAGE では発見しやすいスクロールバー、focus-within、キーボード操作を用意する。

## 4. VINTAGE との差と移植範囲

| 項目               | VINTAGE 現状                                 | 推奨                                      |
| ------------------ | -------------------------------------------- | ----------------------------------------- |
| 配置               | 右ペイン Board                               | 継続                                      |
| 状態               | todo / doing / done                          | 初期は継続                                |
| 列                 | min-width 560px の3等分 grid、共通スクロール | 固定幅・列内スクロール                    |
| カード             | タイトル、notes全文、常時アクション          | notesプレビュー、詳細編集、軽いアクション |
| 作成・編集         | 上部の共通フォーム                           | 列内作成、ペイン内詳細画面                |
| 並べ替え           | 状態だけ変更、配列順は維持                   | 同列・列間の挿入位置を指定                |
| 列折りたたみ       | なし                                         | 導入                                      |
| 検索               | なし                                         | タイトル・notes検索、Done非表示           |
| 優先度・期限等     | なし                                         | version 2 で追加                          |
| AI連携             | Board／カード単位の指示コピー、CLI更新       | 継続。初期はコピー対象仕様を変えない      |
| 保存               | Main 管理の JSON と revision                 | 継続                                      |
| 外部変更           | 表示中3秒更新、競合通知                      | 継続                                      |
| メンバー・コメント | なし                                         | 初期対象外                                |

## 5. 初期移植の画面仕様

```text
┌ Board  12 ─── AI指示コピー  Reload  Add ┐
│ 検索…                  完了を表示      │
├───────────────────────────────────────┤
│ To do 5 [+][…]  Doing 3 [+][…]  Done 4 │
│ ┌────────────┐ ┌────────────┐          │
│ │タイトル    │ │タイトル    │          │
│ │notes抜粋   │ │notes抜粋   │          │
│ └────────────┘ └────────────┘          │
│ + Add card     + Add card              │
│ ← 横スクロール、各列は縦スクロール →  │
├───────────────────────────────────────┤
│ 保存中／保存済み／エラー／削除 Undo    │
└───────────────────────────────────────┘
```

- 列幅は初期値260px（参照284pxを右ペインに調整）、列間12px、折りたたみ44px。狭いペインで3列を無理に縮めない。CSS変数で微調整可能にする。
- 列ヘッダーとBoardツールバーは固定。カード領域のみ縦スクロール。
- カードの notes は3行程度に制限し、全文は詳細で読む。AI の結果追記が増えても一覧を維持する。
- 状態アイコンと名称を併用し、Done はチェックと低い強調度で識別する。色・フォント・角丸はVINTAGEの既存テーマを使う。
- カードタイトルのボタンから詳細へ。カード全体をbuttonにして内側にbuttonを入れない。
- AI は常に到達できる。編集・削除等はhover/focus-withinで表示し、タッチ相当では常時表示する。
- 列末尾の作成フォームはタイトル中心。Enter送信はIME変換中を除外、Escで閉じる。Shift+Enterは改行にせず、必要なら詳細へ移る。連続作成後は空の入力に戻す。
- Notes選択文からの `CardRequest` は、タイトルとnotesを保持して詳細の新規作成へ渡す。空notesの列内追加と経路を分ける。
- 狭い右ペインでは詳細をペイン内の置換画面にする。戻ると列のスクロール・検索・選択を復元する。初期はアプリ全体を覆うドロワーや中央端末置換を導入しない。
- タイトル・notes・状態を詳細で編集し、明示的に保存する。下書きがある間は別カードへの遷移に破棄確認を用意する。
- 列メニューは初期に追加と折りたたみ。全件完了・アーカイブは後続へ回す。
- 件数はフィルター時「表示件数 / 全件数」。検索結果ゼロと元々空の列を区別する。
- Board全体のAIコピーは既存どおり全todoを対象とし、検索結果に限定しない。ツールチップで対象を明示する。

## 6. version 1 を維持した並べ替え

既存 `cards` 配列を順序の正本にする。`order` を追加せず、列表示は配列をstatusでfilterした順を使う。

`moveCard(cards, cardId, targetStatus, beforeCardId | null)` を純粋関数として shared に置く。

1. IDと対象状態を検証。beforeCardIdがあれば対象列の別カードであることを確認する。
2. 移動カードを除外し、状態を変更する。
3. beforeCardIdの直前に挿入する。nullなら対象列の最終カード直後、空列なら配列末尾へ挿入する。
4. その他のカードの相対順、ID、notesを保持する。同位置への移動は書き込みを省く。
5. 保存は既存 `saveWorkspaceKanban` と読み込み時revisionを使い、成功したスナップショットを画面へ反映する。

CLI はカードの状態とnotesだけを変更し配列順を維持する。CLIによる列変更は元配列位置に従って現れる仕様にする。UIで移動した場合の挿入指定と区別する。

検索中はドラッグによる手動並べ替えを無効にし、状態変更メニューは利用可能にする。見えないカードを挟む位置の曖昧さを避ける。検索解除後に並べ替えられる案内を表示する。

挿入線・対象列の強調を表示し、drop時の実際の列を再検証する。Board外drop、外部text/file、無効ID、ドラッグ中のWorkspace切替は変更を起こさない。列の端では縦横オートスクロールを行う。キーボードには状態変更と同列「上へ／下へ」を提供する。

## 7. 状態とコンポーネント設計

新規ファイル名は提案:

```text
KanbanBoard.tsx             Board全体の組み立て
  useKanbanBoard.ts         read/save/poll、revision、競合、busy、Undo
  BoardToolbar.tsx         検索、Done表示、AI、Reload
  BoardColumn.tsx          列ヘッダー、scroll、折りたたみ、drop
    BoardCard.tsx          プレビューと操作
    BoardComposer.tsx      列内追加
  BoardCardDetail.tsx       タイトル・notes・状態と保存
shared/kanbanOrder.ts       version 1 配列操作の純粋関数
```

データ状態（snapshot/cards/revision）は1か所が所有する。UI状態（検索、列折りたたみ、scroll、選択、composer、draft）は分離する。保存中は他の変更を直列化する。自動更新は active Board だけで行い、編集中・ドラッグ中は一覧を置き換えない。

初期の画面状態はWorkspace単位のメモリに保持する。アプリ再起動後の検索・折りたたみ復元は初期対象外。将来永続化するならBoard JSONと分離した表示設定にする。

下書きの外部変更通知・保存失敗時の保持・古い非同期結果の破棄を既存実装から引き継ぐ。外部更新で選択中カードが消えたら保存を止め、入力内容を保持して「カードが削除された」と表示する。削除Undoは直前成功revisionに対して実行し、外部変更後は無効化する。新規composerも下書きとして扱う。

`SidePane → NotesPane → KanbanBoard` と既存型付きIPCを維持する。Rendererへファイルアクセスを持ち込まない。中央端末のDOM、pane ID、PTYセッションはBoardの表示切替で作り直さない。

## 8. 後続のデータ拡張

優先度、期限、ラベル、サブタスクを導入する場合のみ version 2 を追加する。現行validatorは未知キーを拒否し、Python helperも厳密に同じ4フィールドを要求するため、型だけ拡張して保存することはできない。

候補フィールド:

| フィールド | 方針                                                |
| ---------- | --------------------------------------------------- |
| `priority` | none / low / medium / high / urgent、初期値none     |
| `dueDate`  | YYYY-MM-DD またはnull。時刻を持たない日付として扱う |
| `labels`   | 文字列配列。個数・文字数の上限をsharedで定義        |
| `subtasks` | 安定ID、title、done。上限と重複検証を追加           |
| `archived` | アーカイブを導入する時に追加。削除とは別扱い        |

`notes` はAIへの入力と結果の既存契約を維持する。gr8rのHTML `desc` へ置き換えない。優先度Sortは表示上の並べ替えとし、手動並べ替えはManual時だけ許可する。

導入時はshared validator、store、IPC型、UI、Python helper、AI指示、テスト、英日ドキュメントを一体で更新する。移行はロック取得→最新版read→v1バックアップ→v2変換→atomic replace。既存のローカルv1カード初期移行も対応させる。helperはv1/v2の両方を読み、更新時に未変更フィールドを保持する。すでに起動済みの旧helperはv2を拒否するため、指示の再コピーが必要なことを案内する。旧VINTAGEへのダウングレードもv2を読めないので、バックアップ復元またはv1エクスポート方針を実装前に決める。

1 MBと1,000カードの現行上限を当初維持し、拡張内容で超過した場合は保存前に明示する。バックアップ失敗時は移行を止める。複数PC同期、担当者管理、コメント、添付アップロード、依存関係、繰り返し、5状態化は別機能として扱う。

## 9. 実装順序と完了条件

### Phase A: 保存形式を変えない UI 移植（推奨する最初の実装）

1. 現行Boardのデータ処理をhookへ分離。既存回帰テストを維持。
2. 固定幅列・列内スクロール・カードプレビュー・折りたたみを実装。
3. 列内composer・詳細編集を実装。Notes経路と下書き競合を確認。
4. 配列順の並べ替え、挿入線、キーボード代替、オートスクロールを実装。
5. 検索・Done非表示・対象件数・ゼロ結果案内を実装。
6. Electronで寸法・フォーカス・端末継続を確認し、英日READMEと `docs/KANBAN.md` を更新。

完了条件: 既存version 1 JSONとAI指示がそのまま使え、右ペインで読みやすく、作成・編集・順序変更・外部更新が衝突してもデータや下書きを失わない。

### Phase B: メタ情報

version 2移行とhelperの互換対応を先に用意し、優先度・ラベル・期限を追加。続いてフィルター・Sortを導入する。サブタスクとアーカイブは必要性を見て追加する。

### Phase C: 任意の拡張

ペイン内拡大表示、保存ビュー、状態5段階化、エージェント実行状況のリンク。Board状態とMonitorのエージェント状態は別概念として扱い、MonitorのcompletedだけでカードをDoneへ変えない。

## 10. 検証計画

| 層           | 必要な確認                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| 純粋関数     | 同列上下移動、列間先頭/末尾/空列、不正ID、他カード相対順の保持               |
| UI           | Enter連続作成、IME、Esc、詳細復帰、Notes選択文、検索中操作、フォーカス復帰   |
| 保存・CLI    | 現行JSON互換、同時writer、stale revision、破損JSON、ロック、AI notes保持     |
| 外部更新     | 表示時だけpoll、隠した後の再表示、draft/drag中変更、対象カード削除、Undo競合 |
| Electron     | 右ペイン幅320/560/900px、横/列内縦scroll、長いタイトル/notes、1000カード     |
| テーマ・操作 | 既存各テーマ、reduced-motion、Tab操作、状態変更・上/下メニュー               |
| 端末回帰     | Board開閉・カード詳細・ペインresizeでPTY/session/pane identityが継続         |
| v2導入時     | v1移行、バックアップ失敗、旧helper拒否、新helper互換、日付境界、上限         |

コード実装時はプロジェクト指定Node 24と `corepack pnpm` を使い、formatter、型・境界・lint・関連テストを確認する。製品変更の完了前に `corepack pnpm verify`。静的チェックとElectron上の実操作を区別して結果を報告する。初稿の設計時点では製品コードを変更していない。Phase A 実装後の検証結果は末尾に記載。

## 11. Phase A 実装結果（2026-10-13）

既存 version 1 JSON、3状態、保存IPCとPython helperを維持して実装した。主な構成は `KanbanBoard`、`useKanbanBoard`、`BoardCard`、`BoardComposer`、`BoardCardDetail`、shared の `kanbanOrder`。ツールバーと列は当初 `KanbanBoard` 内に置いている。

固定幅260pxの列・列内縦スクロール・横スクロール・44pxの折りたたみ、Notesの3行プレビュー、列内連続作成、詳細編集、タイトル／Notes検索、Done非表示、挿入線とドラッグ時のオートスクロール、More actionsの状態変更／Up・Downを導入した。同位置の移動は保存を省く。外部読み込みがドラッグ開始前に走っていた場合も、ドラッグ中は反映を止める。破損JSONの復旧・外部で削除された編集中カードの保存停止・Undo無効化も検証した。

英日READMEと `docs/KANBAN.md` を更新。画面設定と下書きはマウント中のメモリに保持するため、Workspace切替・Board無効化・再起動後の復元は対象外。優先度・期限・ラベル等のPhase Bは未実装。

検証: 全体verifyは400件成功・1件スキップ、境界・型・lint・書式・ビルド成功。隔離したLinux Electronで320／560／900pxの右ペイン幅、260px列と44px折りたたみ、列内スクロール、実マウスドラッグによる配列順変更、詳細編集、1000カードと長文の折り返しを確認。Light／Dark／Graphiteは実際のSettingsから切り替え、画面を確認した。リサイズ・詳細編集・Notes切替後に同じ端末DOM・pane ID・セッションで入出力が継続した。再実行は `pnpm test:e2e:board`（ビルドを含む）。macOS／Windowsでの実機確認は未実施。参照側gr8r-studioの実画面操作は未実施で、参照分析の証拠は引き続きソースとCSS。

## 12. 参考画像に合わせた再設計・実装（2026-10-13）

ユーザーが提示したgr8r-studioのBoard実画面を確認し、初期実装の詳細画面への置き換えを修正した。カードを開くとBoardを作業領域へ拡大し、左の一覧を残したまま右に詳細ドロワーを表示する。拡大は固定位置のBoard表示で実現し、背後の端末DOM・pane ID・PTYを作り直さない。復帰ボタンで右ペインへ戻る。ドロワー幅は360px〜640px、基準は画面幅の40%。狭い画面では一覧とドロワーの横スクロールで対応する。

列は上揃え、カード量に応じた自然な高さ、利用可能な高さを超えた場合だけ列内スクロールする。カードからNotesの抜粋を外し、ラベル→タイトル→短縮ID・優先度・期限へ変更。タイトルは3行まで、全文は詳細で編集する。状態は形の異なるアイコン、完了は取り消し線、カード操作はhover／focus中心とし、タッチでは表示する。画像にない架空の担当者・コメント・添付数は追加していない。状態は既存AI契約を維持するtodo／doing／doneの3段階。

詳細のプロパティ行でPriority・Due date・Labelsを編集でき、未確定のラベル入力もSaveに含める。Priorityは5種類、ラベルは最大12個・各32文字、期限は日付のみ。Filterは優先度、Sortは手動・優先度・期限を実装。表示Sortは配列順を変更せず、手動DnDは検索／Filterなし＋Manual時だけ有効。

メタ情報保存時にversion 2を使用し、version 1からの初回移行はロックとrevision確認のもと元ファイルをkanban-v1-<revision>.jsonへ完全な内容でバックアップしてからatomic replaceする。バックアップ失敗・不正なバックアップパスでは移行を止める。version 2の保存をversion 1へ戻す要求は拒否する。旧カードのID・Notes・配列順を保持し、既存localStorage移行も継続。Python helperはv1/v2を検証して読み書きし、状態／Notes更新時にメタ情報とversionを保持する。UI・保存・CLI・AI指示・英日ドキュメントを同時に更新した。

検証: 全体verifyで407件成功・1件スキップ、56テストファイル成功、境界・型・lint・書式・ビルド成功。Linux Electronでは320／560／900pxの右ペイン、自然な列高さ、一覧とドロワーの横並び、メタ情報の保存とカード反映、実ドラッグ、1000カード、Light／Dark／Graphiteを確認。拡大／復帰・詳細・リサイズ・Notes切替の前後で同じ端末DOM・pane ID・セッションが保持され、入出力が継続した。macOS／Windowsの実機確認は未実施。第11節のversion 1限定・メタ情報未実装は初期実装時点の記録で、現在の仕様は以降の節とdocs/KANBAN.mdを参照。

## 13. Subtasks実装（2026-10-13）

提示画像に合わせ、Description / Notesの下にSubtasksを配置した。Enterまたは＋で追加し、行内のタイトル編集、チェックで完了切替、削除に対応する。完了数／総数と進捗バーを詳細・カードの両方に表示し、全項目が完了しても親Statusは変更しない。Save changesは未追加の入力も保存対象に含める。未保存入力の破棄確認、保存失敗時の下書き保持、IME変換中のEnter、最大100項目・タイトル200文字を扱う。

保存はversion 3の任意subtasks配列（id、title、done）。version 1／2からの初回保存時は元ファイルの完全な内容をversion別バックアップへ保存してから置き換え、ダウングレードは拒否する。Python helperはv1〜v3を扱い、Status／Notes更新時にSubtasksを保持する。英日README・KANBANドキュメントも更新。

Linux Electronで4件のSubtask入力と保存、1/4のカード進捗、Light／Dark／Graphiteを確認。既存の幅・列・実ドラッグ・1000カード検証も成功し、同一端末DOM・pane ID・セッションで入出力が継続した。スクリーンショットは/tmp/vintage-board-smoke-h3RfpO。macOS／Windowsの実機確認は未実施。

最終検証: 全体verifyは412件成功・1件スキップ、56テストファイル成功。境界・型・lint・書式・ビルド・git diff --checkも成功。

## 14. Agent SkillとPythonのSubtask操作（2026-10-13）

配布用skills/vintage-boardを追加し、SKILL.mdとscripts/update-card.pyを正本とした。PythonはSubtask追加・タイトル変更・完了／再開・削除に対応し、ID指定で対象を選ぶ。1操作と親Status／Notes更新を同じatomic writeで処理できる。追加時はIDを生成して出力し、v1／v2は既存内容のSHA-256を使った正確なバックアップ後にv3へ移行する。親Statusは明示指定がなければ変更しない。ロック競合、不正ID・タイトル・引数、上限、バックアップ不一致やリンクを拒否する。

ビルドでSkillとPythonをテキスト資源としてMainへ同梱し、AI指示コピー時にはアプリ保存領域のkanban/skills/vintage-boardへ書き出す。従来のkanban/update-card.pyも同じ正本から更新する。AI指示はSkillの絶対パスを含み、最初に読んでSubtask操作を使うよう案内する。AgentのSkill保存先へのインストールはフォルダー全体の配布で行い、Boardパスと作業場所はコピーした指示で渡す。

検証: 全体verifyは420件成功・1件スキップ、57テストファイル成功、境界・型・lint・書式・ビルド成功。実PythonでCRUD、持ち運んだSkillからの実行、旧版バックアップ、無効操作・競合・容量上限での無変更を確認。ruffとSkill validatorも成功。ビルド済みLinux ElectronのAI指示コピーからSkillとPythonを読み、Subtask更新後にBoard進捗が2/4へ変化することを確認。既存の幅・テーマ・実ドラッグ・1000カード・端末セッション維持も成功。スクリーンショットは/tmp/vintage-board-smoke-4mjUDL。macOS／Windows実機と各Agent製品によるSkill自動検出は未検証。
