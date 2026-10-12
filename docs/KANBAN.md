# Kanban and CLI agents

Open **Board** to organize the current workspace's tasks. The robot icon copies instructions; it does not start an agent or change a card. The board-wide button processes **all To do cards**, including cards hidden by search, filters, or collapsed columns. A card's robot button copies instructions for that saved card. Paste the result into your CLI agent.

## Board controls

Columns have a fixed width and a height that follows their content, capped at the available height. Long columns scroll vertically; the board scrolls horizontally. The double-arrow button collapses a column. The column header and bottom Add card button open a title-only composer: Enter creates a card and keeps the composer ready for the next one; Esc closes it, with confirmation for unsaved text. Enter during IME composition does not create a card.

Cards show **labels, title, task ID, priority, and due date**. Notes are shown only in details. Subtask checklists and progress are available below Notes; see Subtasks below for version 3 storage. The task key is a short display of the stable card ID, not a sequential project number; the CLI uses the full ID. Dates are calendar dates in the local timezone; Today and overdue dates are highlighted (completed cards are not marked overdue). Hover or focus reveals Complete/Reopen, Edit, and Delete controls.

Open a title or Edit to expand Board over the workspace content and open details on its right, keeping the list visible. The top Add card button and selected text from Notes open the same drawer. Edit Title, Status, Priority, Due date, Labels, and Description / Notes, then Save changes. Labels can be added with Enter or Add; pending label text is included when saving. Closing or switching cards asks before discarding changes. Use the expand/restore icon to return Board to the side pane. Underlying terminal panes and sessions stay mounted; Board expansion does not execute tasks.

Search matches Title and Notes. Filter selects a priority. Sort offers Manual, Priority, and Due date; sorting and filtering do not rewrite the cards array. Show done hides or shows the Done column. Column counts show visible/total while filtering. Manual drag and Up/Down are available only with no search/filter and Manual sorting; Move to remains available while filtering. Drag above or below a card using the insertion line, or drop into an empty column. More actions also provides Move to and Up/Down for keyboard users.

Search, scroll, and view settings stay in memory while this workspace's Board remains mounted. They are not restored after restarting. Drafts are not saved to disk; workspace changes or disabling Board may discard them.

## Storage and version migration

Boards live at `<VINTAGE userData>/kanban/<SHA-256 of canonical workspace path>/kanban.json`. AI instructions include the absolute path. The project checkout stays unchanged: no `.vintage`, Git ignore changes, or environment variables are needed. Removing and reopening the same canonical workspace path reuses its board. Moving a project to another path uses a different board. Data is local to that machine and is not automatically synchronized to remote agents.

On first opening, old `vintage:kanban:<workspace ID>` localStorage cards seed the file only if no file exists. An existing file takes priority. Old localStorage data stays as a backup and is no longer updated. The Memo scratchpad still uses localStorage.

Existing **version 1** files remain readable and can be edited without adding metadata. The first save containing Priority, Due date, or Labels upgrades the board to **version 2**. Before replacing a version 1 file, VINTAGE holds the board lock and writes its exact contents to `kanban-v1-<revision>.json` in the same directory. Backup failure stops the upgrade. Subsequent writes preserve version 2, even if metadata is cleared.

Version 2 JSON:

```json
{
  "version": 2,
  "cards": [
    {
      "id": "7ab39912-6b48-4f98-918a-b4ff370c67de",
      "title": "Prepare design system tokens",
      "notes": "Requirements and verification results",
      "status": "todo",
      "priority": "medium",
      "dueDate": "2026-10-31",
      "labels": ["Design", "Frontend"]
    }
  ]
}
```

Metadata is optional in version 2: missing Priority means `none`, missing Due date means no date, and missing Labels means none. Priority is `none|low|medium|high|urgent`. Due date is a valid `YYYY-MM-DD` (years 0001–9999) or `null`. Labels are up to 12 unique, trimmed strings of 1–32 characters. Version 1 accepts only `id`, `title`, `notes`, and `status`; Version 3 adds only the optional subtasks field described below; unknown fields are rejected in every version.

Keep IDs stable and unique. Status remains `todo|doing|done`. Limits remain 1 MB per JSON file, 1,000 cards, 128 characters per ID, 200 per title, and 200,000 per notes. Cards array order is the manual order; CLI status updates keep array position. The AI reads the latest Notes, marks Doing at work start, appends findings and verification, and marks Done only after completing work and checks. Preserve metadata, unrelated cards, notes, and document version.

Older VINTAGE versions and older already-loaded helper processes cannot read version 2. The upgrade installs the new helper at the existing command path; copying AI instructions refreshes it as well. If a running old helper rejects the file, rerun the command or copy instructions again. To use an older app, close all writers, retain the current version 2 file separately, and restore a version 1 backup; later changes and metadata will not be present in that backup. VINTAGE does not automatically downgrade a version 2 board.

## External changes and conflicts

All writers cooperate with the same protocol:

1. Acquire the lock by creating a `kanban.lock` directory beside the JSON. A busy lock means retry later; never remove another writer's lock.
2. Read and validate the latest JSON **after** acquiring the lock. Preserve unrelated cards, metadata, notes, and version.
3. Write to a temporary file in that directory, flush it, verify the source is unchanged, and atomically replace `kanban.json`.
4. Remove your temporary file and release your own lock in a `finally` block.

VINTAGE follows this protocol and rejects saves using an outdated hash revision. A direct editor that ignores the lock can still race with another writer. A crash may leave a lock; remove it manually only after confirming the writer has stopped.

Visible boards check every three seconds and when shown again. Hidden boards do not poll. External updates during editing preserve the draft and show a notice; stale saves are rejected. Reload asks before discarding the draft. If the edited card is externally deleted, saving is disabled and the draft remains available for copying. External changes invalidate deletion Undo. Invalid disk content blocks writes until a readable update is detected, retaining the last readable board and draft. Updates are not applied during dragging, including reads started before the drag.

## Update helper

Copying AI instructions prepares `<VINTAGE userData>/kanban/update-card.py`. Python 3 is required. The helper reads and updates versions 1–3, preserving optional metadata and subtasks. Use `--board <JSON path> --read` for all cards; add `--card <ID>` for one card. Reads do not acquire a lock or write data. Update with `--board <JSON path> --card <ID>` and `--status todo|doing|done` and/or `--note <text to append>`. Busy writes fail immediately; retry later. On Windows use `python` or `py -3` if `python3` is unavailable, and adapt shell quoting.

## Board・AI連携（日本語）

Boardのカードはラベル・タイトル・短縮ID・優先度・期限を表示し、説明文は詳細側に置きます。列はカード量に応じた高さで、長い列だけ縦スクロールします。列の矢印で折りたたみ、追加ボタンでEnterによる連続追加ができます。IME変換中のEnterでは作成しません。

カードを開くとBoardを作業領域に広げ、左の一覧を残したまま右に詳細を表示します。タイトル・状態・優先度・期限・ラベル・Description / Notesを編集し、Save changesで保存します。ラベルはEnter／Addで追加し、入力途中のラベルも保存に含めます。変更した下書きを閉じたり別カードを開いたりする場合は破棄を確認します。拡大／復帰ボタンで右ペインへ戻れます。背後の端末は作り直さず、セッションを維持します。

検索対象はタイトルとNotes、Filterは優先度、Sortは手動・優先度・期限です。これらは表示だけを変更し、保存済みの手動順を変えません。ドラッグ／Up・Downは検索・Filterなし＋Manual時だけ有効です。状態変更は検索中も使えます。全体のAIボタンは隠れたカードを含むすべてのTo doが対象で、カードごとのボタンはその保存済みカードの指示をコピーします。AIへの送信や実行は行いません。

既存version 1を読み込めます。優先度・期限・ラベルの最初の保存時にversion 2へ移行し、元ファイルを同じ保存先のkanban-v1-<revision>.jsonへバックアップします。旧版アプリはversion 2を読めません。旧版へ戻す場合はすべてのwriterを止め、最新ファイルを別途保持してからversion 1バックアップを復元します。そのバックアップに移行後の変更やメタ情報は含まれません。Python helperはversion 1〜3に対応し、既存Notes・メタ情報・無関係なカード・versionを保持します。実行中の古いhelperが拒否した場合はコマンドを再実行するかAI指示をコピーし直します。

AIもロック取得→最新JSONを読む→一時ファイル→置き換え→ロック解放の順で更新します。表示中は3秒ごとに外部変更を確認します。編集中は下書きを保持し、古いrevisionでの保存を拒否します。対象カードの外部削除時は保存停止、外部変更後はUndo無効化、破損JSONは修復後に再開します。表示設定と下書きはマウント中のメモリのみで、Workspace変更・Board無効化・再起動後には復元されません。

## Subtasks

Below Description / Notes, enter a subtask and press Enter or click +. Edit titles inline, check completed items, or delete rows. Save changes persists the checklist, including text still in Add subtask. Progress appears in the drawer and on cards. Completing every subtask does not change the parent card status. Each card supports up to 100 subtasks, with titles up to 200 characters.

The first save containing `subtasks` upgrades to **version 3**. VINTAGE backs up the exact previous file as `kanban-v1-<revision>.json` or `kanban-v2-<revision>.json` before replacement; backup failure stops migration. Version 3 remains after clearing the checklist. Its optional `subtasks` array contains objects with only `id` (unique within the card, 1–128 characters), `title` (nonblank, 1–200 characters), and `done` (boolean). Older apps/helpers cannot read version 3. The current Python helper preserves subtasks during status and Notes updates. Restore a previous-version backup only after stopping writers and retaining the latest file separately; the backup lacks later changes.

Subtasks欄で入力してEnterまたは＋で追加し、タイトル編集・完了チェック・削除ができます。Save changesで未追加の入力も含めて保存します。全項目の完了は親カードのStatusを変更しません。最初の保存時は元ファイルをバックアップしてversion 3へ移行します。旧版アプリではversion 3を読めません。現在のPython helperはSubtaskを保持します。

## Agent Skill distribution

The portable [vintage-board skill](../skills/vintage-board/SKILL.md) includes `SKILL.md` and `scripts/update-card.py`. Python is the single source used by both the distributed skill and the app; the build embeds those files, so installed apps do not depend on the repository being present.

Distribute the **entire `skills/vintage-board` folder**. Place it in the receiving agent's configured skill directory (for agents using `.agents/skills`, use `.agents/skills/vintage-board`), or ask the agent to read its `SKILL.md` directly. Supply VINTAGE's copied instructions to give the agent the workspace, absolute Board path, and selected card scope. Skill installation does not transfer Board data: a remote agent needs explicit access to that Board file and workspace.

Copy AI instructions exports the same folder to `<VINTAGE userData>/kanban/skills/vintage-board` and includes its `SKILL.md` path. Copied instructions contain workspace/Board/Skill paths and task scope; command examples live in the Skill instead of the clipboard text. The existing `<VINTAGE userData>/kanban/update-card.py` command remains usable and is refreshed from the same Python source. Export does not install into an agent's global settings or modify the project.

Subtask update options (always with `--board` and `--card`):

| Operation | Arguments |
| --- | --- |
| Add | `--subtask-add 'Title'` |
| Rename | `--subtask ID --subtask-title 'Title'` |
| Complete / reopen | `--subtask ID --subtask-done true` / `false` |
| Delete | `--subtask ID --subtask-delete` |

Read with `--read` to get full subtask IDs; additions also print the new ID. A command may include `--status` and/or `--note` alongside one subtask operation. Changes are atomic. An add on v1/v2 performs the same exact-byte backup and v3 upgrade as the UI. Completing subtasks leaves parent status unchanged unless `--status` is explicitly supplied.

配布時は`skills/vintage-board`フォルダー全体をAgentのSkill保存先へコピーし、VINTAGEのAI指示と一緒に渡します。AI指示コピー時にはアプリ保存領域にも同じSkillを書き出し、SKILL.mdの場所を指示へ含めます。コピーする指示はパスと作業指示に絞り、参照・更新コマンド例はSkillにまとめています。Agentのグローバル設定やプロジェクトへ自動インストールはしません。Subtask追加・タイトル変更・完了／再開・削除は同梱Pythonで操作できます。別マシンへのSkill配布だけではBoardデータは共有されません。
