---
name: vintage-board
description: Read and update VINTAGE Board cards, notes, and subtask checklists while carrying out tasks from a user-selected Board. Use when an agent receives VINTAGE Board AI instructions or is asked to work on its cards.
---

# VINTAGE Board

Use the workspace, Board JSON path, and optional card ID supplied by the user or VINTAGE's copied AI instructions. Board files live in VINTAGE application data, not in the project. If no Board path is supplied, ask for it or for the copied instructions; do not select another workspace's board.

Python 3 is required. Run the bundled `scripts/update-card.py` relative to this skill folder. Quote paths and titles for the agent's actual shell. On Windows use `python` or `py -3` when `python3` is unavailable.

## Work on cards

Read the latest data before acting:

```sh
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --read
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --read
```

Use the full stable IDs returned in JSON, never the shortened UI task key or a row number. Treat the selected card's latest Notes as its task description and its subtasks as the checklist. Carry out the scope authorized by the user. For an all-todo request, process todo cards in their stored order. Mark a card doing when starting; append progress, results, and actual verification to Notes. Mark a subtask done only after its work and verification succeed. Mark the parent done only when its requested work and verification are complete; subtask checks do not automatically change parent status.

## Mutate through the helper

```sh
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --status doing --note 'Progress and verification'
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --subtask-add 'Verify keyboard navigation'
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --subtask '<subtask-id>' --subtask-title 'Verify keyboard and focus'
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --subtask '<subtask-id>' --subtask-done true --note 'Keyboard check passed'
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --subtask '<subtask-id>' --subtask-done false
python3 <skill-folder>/scripts/update-card.py --board '<board-json>' --card '<card-id>' --subtask '<subtask-id>' --subtask-delete
```

Addition prints the generated subtask ID. Re-read to confirm changes and obtain current IDs. Title and done edits may be combined; each command supports one subtask operation, optionally with parent status/Notes updates in the same atomic write. Delete only obsolete checklist items within the requested scope. Parent notes are appended, not replaced.

The helper validates versions 1–3, keeps unrelated cards, metadata, notes, IDs, and array order, and uses the app's shared lock and atomic replacement. Adding a subtask to version 1/2 backs up the exact previous file beside it as `kanban-v<version>-<revision>.json` before upgrading to version 3. It never downgrades. Limits: 100 subtasks per card, 200 characters per title, and 1 MB per board.

Do not rewrite the full JSON, bypass validation, or remove another writer's lock. A busy write fails without changing the board: re-read and retry later; if it remains busy, report the blocker instead of looping. Missing IDs, invalid data, or backup failures stop the operation; inspect the latest data and correct the request. If external edits occur while a UI draft is open, VINTAGE retains that draft and requires reload before saving.
