import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const script = String.raw`import argparse, json, os, pathlib, stat, tempfile

parser = argparse.ArgumentParser(description="Read or update VINTAGE Kanban cards")
parser.add_argument("--board", required=True, type=pathlib.Path)
parser.add_argument("--card", help="Card ID; omit with --read to list all cards")
parser.add_argument("--read", action="store_true", help="Print the board or selected card as JSON")
parser.add_argument("--status", choices=("todo", "doing", "done"))
parser.add_argument("--note", help="Text to append to existing notes")
args = parser.parse_args()
if args.read and (args.status is not None or args.note is not None):
    parser.error("--read cannot be combined with updates")
if not args.read and (not args.card or (args.status is None and args.note is None)):
    parser.error("Updates require --card and --status or --note")
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
    if set(board) != {"version", "cards"} or type(board["version"]) is not int or board["version"] != 1 or not isinstance(board["cards"], list) or len(board["cards"]) > 1000:
        raise ValueError("Invalid board schema")
    ids = set()
    for card in board["cards"]:
        if not isinstance(card, dict) or set(card) != {"id", "title", "notes", "status"}:
            raise ValueError("Invalid card schema")
        if not isinstance(card["id"], str) or not 0 < len(card["id"]) <= 128 or card["id"] in ids:
            raise ValueError("Invalid or duplicate card ID")
        ids.add(card["id"])
        if not isinstance(card["title"], str) or not card["title"].strip() or len(card["title"]) > 200 or not isinstance(card["notes"], str) or len(card["notes"]) > 200000 or card["status"] not in ("todo", "doing", "done"):
            raise ValueError("Invalid card fields")
    target = next((card for card in board["cards"] if card["id"] == args.card), None)
    if args.card is not None and target is None:
        raise ValueError("Card ID not found")
    if args.read:
        print(json.dumps(target if args.card else board, ensure_ascii=False, indent=2))
        raise SystemExit(0)
    if args.status is not None:
        target["status"] = args.status
    if args.note:
        target["notes"] += ("\n" if target["notes"] else "") + args.note
    if len(target["notes"]) > 200000:
        raise ValueError("Notes exceed 200000 characters")
    updated = (json.dumps(board, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(updated) > 1000000:
        raise ValueError("Board exceeds 1 MB")
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
except FileExistsError:
    parser.exit(1, "Board is busy; retry later.\n")
except (OSError, ValueError, TypeError, KeyError) as error:
    parser.exit(1, str(error) + "\n")
finally:
    if temporary is not None:
        os.unlink(temporary)
    if owned:
        lock.rmdir()
`;

export async function prepareKanbanCli(boardDirectory: string): Promise<string> {
  const root = dirname(boardDirectory);
  await mkdir(root, { recursive: true });
  const path = join(root, "update-card.py");
  const temporary = join(root, `update-card-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, script, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return path;
}
