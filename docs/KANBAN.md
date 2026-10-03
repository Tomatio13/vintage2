# Kanban and CLI agents

Open **Board**. The robot icon at the top copies instructions for processing all To do tasks in order. A card's robot icon copies instructions for that specific card. Paste the result into your CLI agent. Copying does not start an agent or change a card.

## Storage

Boards live at `<VINTAGE userData>/kanban/<SHA-256 of canonical workspace path>/kanban.json`. The AI instructions contain the actual absolute path. The project checkout stays unchanged: VINTAGE does not create `.vintage`, modify Git ignore settings, or add environment variables. Removing and reopening the same canonical workspace path reuses its board; moving the project to a different path uses a different board. The JSON is local to that machine and is not automatically synchronized to remote agents.

The first time a Board is opened, old `vintage:kanban:<workspace ID>` localStorage cards seed the new file if it does not exist. An existing JSON file takes priority. The old localStorage data remains as a backup and is no longer updated. The Memo scratchpad still uses localStorage.

## JSON format

```json
{
  "version": 1,
  "cards": [
    {
      "id": "7ab39912-6b48-4f98-918a-b4ff370c67de",
      "title": "Implement the requested feature",
      "notes": "Requirements and verification results",
      "status": "todo"
    }
  ]
}
```

Keep card IDs stable and unique. Status is `todo`, `doing`, or `done`. Only the fields shown above are supported. Limits: 1 MB per file, 1,000 cards, 128 characters per ID, 200 per title, and 200,000 per notes. The AI should read the latest card, mark work Doing at the start, append findings and verification to Notes, and mark Done only after completing the work and checks.

## External updates and conflicts

The copied instructions include the path, task, and concise update protocol with a command for the preinstalled Python helper.

All writers should cooperate with the same protocol:

1. Acquire the lock by creating a `kanban.lock` directory beside the JSON. If it exists, retry later. Never delete another writer's lock.
2. Read the latest JSON **after** acquiring the lock. Preserve unrelated cards and user notes.
3. Write the updated JSON to a temporary file in that directory, flush it, verify the source has not changed, and atomically replace `kanban.json`.
4. Remove your temporary file and release your own lock in a `finally` block.

VINTAGE follows this protocol and uses a hash of the loaded file to reject outdated saves. A writer that ignores the lock can still race with another writer; an ordinary direct editor save cannot provide the same coordination. A lock left after a crash must be removed manually only after confirming that its writer has stopped.

Visible boards check for external changes every three seconds and when shown again. Hidden boards do not poll. While a card is being edited, an external update keeps the draft intact and shows a notice. A stale save is rejected; use Reload board to load the latest file (after confirming draft discard). Invalid JSON keeps the last readable board, reports an error, and is never overwritten automatically. A later valid update recovers on the next refresh. Unsubmitted card drafts are not restored after hiding Board or restarting.

# AI連携（日本語）

Boardの上部または各カードのロボットアイコンを押すと、保存先の絶対パス・作業指示・パラメータ指定のPython更新コマンドをコピーします。AIへの送信やタスクの実行は行いません。好きなCLIエージェントへ貼り付けて使ってください。

保存先はVINTAGEのアプリ保存領域で、プロジェクト内にファイルは作りません。同じ実パスのWorkspaceを再登録しても同じBoardを使います。プロジェクトを移動した場合や別PCのAIから使う場合は、別の保存先になる点に注意してください。既存のローカル保存カードは初回に移行し、元のデータはバックアップとして保持します。

AIもロック取得→最新JSONの読み取り→一時ファイル作成→置き換え→ロック解放の順で更新します。カードIDは変えず、既存のメモと無関係なカードを保持してください。作業開始時にDoing、検証まで完了したらDoneへ移し、未確認やブロック中の内容はメモに残します。

表示中のBoardは3秒ごとに外部更新を反映します。人がカードを編集中なら下書きを保持し、古い内容での保存を拒否します。Reload boardで破棄を確認して読み直せます。無効なJSONは上書きせず、修復後に更新を再開します。

## Update helper

Copying AI instructions prepares `<VINTAGE userData>/kanban/update-card.py`. Python 3 is required. Use `--board <JSON path> --read` to list cards, or add `--card <ID>` to read one card including its notes. Reads do not acquire a lock or modify the board. For updates, run it with `--board <JSON path> --card <ID>` and `--status todo|doing|done` and/or `--note <text to append>`. It validates the board, acquires and releases the lock, and replaces the JSON atomically. A busy board fails immediately; retry later. Existing notes are preserved. On Windows use `python` or `py -3` if `python3` is unavailable, and adapt shell quoting.

AI指示をコピーすると、保存領域のkanban/update-card.pyを自動配置します。Python 3で--board <JSONパス> --readを渡すと全カード、さらに--card <ID>を渡すと指定カードのnotesを含む内容を参照できます。参照ではロック取得や書き込みを行いません。更新時は、--boardにJSONパス、--cardにカードID、--statusに状態、--noteに追記メモを渡します。状態とメモは片方だけでも更新できます。ロック取得・検証・ファイル置き換え・ロック解放はスクリプトが行います。ロック中はすぐに終了するので後で再試行してください。
