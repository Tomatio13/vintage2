import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { validateKanban, type KanbanDocument, type KanbanSnapshot } from "../shared/kanban.js";

const limit = 1_000_000;
function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
function hash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export async function kanbanDirectory(userData: string, workspacePath: string): Promise<string> {
  const root = await realpath(workspacePath);
  return join(userData, "kanban", hash(root));
}
async function directory(path: string, create: boolean): Promise<string> {
  if (create) await mkdir(path, { recursive: true });
  const details = await lstat(path);
  if (!details.isDirectory() || details.isSymbolicLink())
    throw new Error("Board storage must be a real directory.");
  return realpath(path);
}
async function readAt(dir: string): Promise<KanbanSnapshot | null> {
  const path = join(dir, "kanban.json");
  try {
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1)
      throw new Error("Kanban must be a regular file, not a link.");
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const buffer = Buffer.alloc(limit + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > limit || (await handle.stat()).size > limit)
        throw new Error("Kanban exceeds 1 MB.");
      const raw = buffer.toString("utf8", 0, bytesRead);
      return { board: validateKanban(JSON.parse(raw)), revision: hash(raw) };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}
async function locked<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const lock = join(dir, "kanban.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error("Board is being updated by another writer. Try again shortly.");
    throw error;
  }
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}
async function replace(
  dir: string,
  board: KanbanDocument,
  expected: string | null,
): Promise<KanbanSnapshot> {
  const raw = JSON.stringify(validateKanban(board), null, 2) + "\n";
  if (Buffer.byteLength(raw) > limit) throw new Error("Kanban exceeds 1 MB.");
  const current = await readAt(dir);
  if ((current?.revision ?? null) !== expected)
    throw new Error("Board changed on disk. Your draft is kept; reload the board before retrying.");
  const temporary = join(dir, `kanban-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const latest = await readAt(dir);
    if ((latest?.revision ?? null) !== expected)
      throw new Error(
        "Board changed on disk. Your draft is kept; reload the board before retrying.",
      );
    await rename(temporary, join(dir, "kanban.json"));
    return { board, revision: hash(raw) };
  } finally {
    await unlink(temporary).catch((error) => {
      if (!missing(error)) throw error;
    });
  }
}

export async function readKanban(root: string, initial?: unknown): Promise<KanbanSnapshot> {
  let dir: string;
  try {
    dir = await directory(root, false);
  } catch (error) {
    if (!missing(error) || initial === undefined) throw error;
    dir = await directory(root, true);
  }
  const current = await readAt(dir);
  if (current) return current;
  if (initial === undefined)
    throw new Error("Board file is missing. Restore the board JSON file before continuing.");
  const board = validateKanban(initial);
  return locked(dir, async () => {
    const existing = await readAt(dir);
    if (existing) return existing;
    return replace(dir, board, null);
  });
}
export async function saveKanban(
  root: string,
  board: unknown,
  expected: unknown,
): Promise<KanbanSnapshot> {
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected))
    throw new Error("A valid board revision is required.");
  const validated = validateKanban(board);
  const dir = await directory(root, false);
  return locked(dir, () => replace(dir, validated, expected));
}
