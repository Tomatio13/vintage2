import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import stat
import tempfile
import uuid

parser = argparse.ArgumentParser(description="Read or update VINTAGE Kanban cards")
parser.add_argument("--board", required=True, type=pathlib.Path)
parser.add_argument("--card", help="Card ID; omit with --read to list all cards")
parser.add_argument(
    "--read", action="store_true", help="Print the board or selected card as JSON"
)
parser.add_argument("--status", choices=("todo", "doing", "done"))
parser.add_argument("--note", help="Text to append to existing notes")
parser.add_argument(
    "--subtask-add", metavar="TITLE", help="Append a subtask with a generated ID"
)
parser.add_argument("--subtask", metavar="ID", help="Subtask ID to edit or delete")
parser.add_argument(
    "--subtask-title", metavar="TITLE", help="Replace the selected subtask title"
)
parser.add_argument(
    "--subtask-done",
    choices=("true", "false"),
    help="Complete or reopen the selected subtask",
)
parser.add_argument(
    "--subtask-delete", action="store_true", help="Delete the selected subtask"
)
args = parser.parse_args()
subtask_edit = args.subtask_title is not None or args.subtask_done is not None
subtask_mutation = args.subtask_add is not None or subtask_edit or args.subtask_delete
mutation = args.status is not None or args.note is not None or subtask_mutation
if args.read and (mutation or args.subtask is not None):
    parser.error("--read cannot be combined with updates or --subtask")
if not args.read and (not args.card or not mutation):
    parser.error("Updates require --card and a status, note, or subtask operation")
if args.subtask_add is not None and (
    args.subtask is not None or subtask_edit or args.subtask_delete
):
    parser.error("--subtask-add cannot be combined with subtask edits")
if (subtask_edit or args.subtask_delete) and not args.subtask:
    parser.error("Subtask edits require --subtask ID")
if args.subtask is not None and not (subtask_edit or args.subtask_delete):
    parser.error("--subtask requires a title, done, or delete operation")
if args.subtask_delete and subtask_edit:
    parser.error("--subtask-delete cannot be combined with title or done edits")
for title in (args.subtask_add, args.subtask_title):
    if title is not None and (
        not title.strip() or len(title.encode("utf-16-le")) // 2 > 200
    ):
        parser.error("Subtask titles must contain 1–200 characters")
path = args.board
lock = path.parent / "kanban.lock"
temporary = None
owned = False
try:
    if not args.read:
        lock.mkdir()
        owned = True
    details = path.lstat()
    if not stat.S_ISREG(details.st_mode) or details.st_nlink != 1:
        raise ValueError("Board must be a regular file, not a link")
    if details.st_size > 1000000:
        raise ValueError("Board exceeds 1 MB")
    raw = path.read_bytes()
    board = json.loads(raw)
    if (
        set(board) != {"version", "cards"}
        or type(board["version"]) is not int
        or board["version"] not in (1, 2, 3)
        or not isinstance(board["cards"], list)
        or len(board["cards"]) > 1000
    ):
        raise ValueError("Invalid board schema")
    ids = set()
    required = {"id", "title", "notes", "status"}
    allowed = required | (
        {"priority", "dueDate", "labels"} if board["version"] >= 2 else set()
    )
    if board["version"] == 3:
        allowed |= {"subtasks"}
    for card in board["cards"]:
        if (
            not isinstance(card, dict)
            or not required <= set(card)
            or not set(card) <= allowed
        ):
            raise ValueError("Invalid card schema")
        if (
            not isinstance(card["id"], str)
            or not 0 < len(card["id"]) <= 128
            or card["id"] in ids
        ):
            raise ValueError("Invalid or duplicate card ID")
        ids.add(card["id"])
        if (
            not isinstance(card["title"], str)
            or not card["title"].strip()
            or len(card["title"]) > 200
            or not isinstance(card["notes"], str)
            or len(card["notes"]) > 200000
            or card["status"] not in ("todo", "doing", "done")
        ):
            raise ValueError("Invalid card fields")
        if "priority" in card and card["priority"] not in (
            "none",
            "low",
            "medium",
            "high",
            "urgent",
        ):
            raise ValueError("Invalid priority")
        if "dueDate" in card and card["dueDate"] is not None:
            if not isinstance(card["dueDate"], str) or not re.fullmatch(
                r"[0-9]{4}-[0-9]{2}-[0-9]{2}", card["dueDate"]
            ):
                raise ValueError("Invalid due date")
            datetime.date.fromisoformat(card["dueDate"])
        if "labels" in card:
            labels = card["labels"]
            if (
                not isinstance(labels, list)
                or len(labels) > 12
                or any(
                    not isinstance(label, str)
                    or not label.strip()
                    or label != label.strip()
                    or len(label) > 32
                    for label in labels
                )
                or len(set(labels)) != len(labels)
            ):
                raise ValueError("Invalid labels")
        if "subtasks" in card:
            subtasks = card["subtasks"]
            if not isinstance(subtasks, list) or len(subtasks) > 100:
                raise ValueError("Invalid subtasks")
            sub_ids = set()
            for sub in subtasks:
                if not isinstance(sub, dict) or set(sub) != {"id", "title", "done"}:
                    raise ValueError("Invalid subtask schema")
                if (
                    not isinstance(sub["id"], str)
                    or not sub["id"].strip()
                    or len(sub["id"]) > 128
                    or sub["id"] in sub_ids
                ):
                    raise ValueError("Invalid or duplicate subtask ID")
                sub_ids.add(sub["id"])
                if (
                    not isinstance(sub["title"], str)
                    or not sub["title"].strip()
                    or len(sub["title"]) > 200
                    or type(sub["done"]) is not bool
                ):
                    raise ValueError("Invalid subtask fields")
    target = next((card for card in board["cards"] if card["id"] == args.card), None)
    if args.card is not None and target is None:
        raise ValueError("Card ID not found")
    if args.read:
        print(json.dumps(target if args.card else board, ensure_ascii=False, indent=2))
        raise SystemExit(0)
    previous_version = board["version"]
    added_id = None
    if args.subtask_add is not None:
        subtasks = target.setdefault("subtasks", [])
        if len(subtasks) >= 100:
            raise ValueError("A card can contain at most 100 subtasks")
        added_id = str(uuid.uuid4())
        subtasks.append(
            {"id": added_id, "title": args.subtask_add.strip(), "done": False}
        )
        board["version"] = 3
    elif args.subtask is not None:
        subtasks = target.get("subtasks", [])
        subtask = next((sub for sub in subtasks if sub["id"] == args.subtask), None)
        if subtask is None:
            raise ValueError("Subtask ID not found in selected card")
        if args.subtask_delete:
            target["subtasks"] = [sub for sub in subtasks if sub["id"] != args.subtask]
        else:
            if args.subtask_title is not None:
                subtask["title"] = args.subtask_title.strip()
            if args.subtask_done is not None:
                subtask["done"] = args.subtask_done == "true"
    if args.status is not None:
        target["status"] = args.status
    if args.note:
        target["notes"] += ("\n" if target["notes"] else "") + args.note
    if len(target["notes"]) > 200000:
        raise ValueError("Notes exceed 200000 characters")
    updated = (json.dumps(board, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(updated) > 1000000:
        raise ValueError("Board exceeds 1 MB")
    if board["version"] > previous_version:
        backup = path.parent / (
            "kanban-v"
            + str(previous_version)
            + "-"
            + hashlib.sha256(raw).hexdigest()
            + ".json"
        )
        backup_owned = False
        try:
            backup_fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            backup_owned = True
            with os.fdopen(backup_fd, "wb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
        except FileExistsError:
            info = backup.lstat()
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_nlink != 1
                or info.st_size != len(raw)
                or backup.read_bytes() != raw
            ):
                raise ValueError(
                    "Migration backup is unsafe or does not match the original board"
                )
        except OSError:
            if backup_owned:
                backup.unlink()
            raise
    fd, temporary = tempfile.mkstemp(prefix="kanban-", suffix=".tmp", dir=path.parent)
    with os.fdopen(fd, "wb") as stream:
        stream.write(updated)
        stream.flush()
        os.fsync(stream.fileno())
    if path.read_bytes() != raw:
        raise ValueError("Board changed; retry with the latest content")
    os.replace(temporary, path)
    temporary = None
    print("Updated " + args.card)
    if added_id:
        print("Added subtask " + added_id)
except FileExistsError:
    parser.exit(1, "Board is busy; retry later.\n")
except (OSError, ValueError, TypeError, KeyError) as error:
    parser.exit(1, str(error) + "\n")
finally:
    if temporary is not None:
        os.unlink(temporary)
    if owned:
        lock.rmdir()
