import { cp, lstat, mkdir, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

function inside(root: string, path: string) {
  const rel = relative(root, path);
  if (isAbsolute(rel) || /^\.\.(?:[\\/]|$)/u.test(rel))
    throw new Error("Path is outside the workspace");
}

async function entry(rootPath: string, raw: unknown, allowRoot = false): Promise<string> {
  if (typeof raw !== "string" || raw.includes("\0") || (!raw && !allowRoot) || isAbsolute(raw))
    throw new Error("Invalid workspace path");
  const root = await realpath(rootPath);
  const path = resolve(root, raw);
  inside(root, path);
  if (path === root && !allowRoot) throw new Error("Cannot modify the workspace root");
  // Do not follow links for mutations, including links in parent directories.
  let current = root;
  for (const part of relative(root, path).split(/[\\/]/u).filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error("Symbolic links are not supported for file operations");
  }
  inside(root, await realpath(path));
  return path;
}

async function absent(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("An entry with that name already exists");
}

async function validateTree(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
    throw new Error("Only regular files and folders can be copied");
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await validateTree(join(path, name));
  }
}

export async function copyEntry(
  sourceRoot: string,
  sourcePath: unknown,
  targetRoot: string,
  directoryPath: unknown,
): Promise<void> {
  const source = await entry(sourceRoot, sourcePath);
  const directory = await entry(targetRoot, directoryPath, true);
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Paste destination must be a folder");
  const target = join(directory, basename(source));
  if ((await lstat(source)).isDirectory()) {
    const rel = relative(source, target);
    if (!isAbsolute(rel) && !/^\.\.(?:[\\/]|$)/u.test(rel))
      throw new Error("Cannot copy a folder into itself");
  }
  await absent(target);
  await validateTree(source);
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
}

function validateName(name: unknown): asserts name is string {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name === "." ||
    name === ".." ||
    /[\\/\0]/u.test(name)
  )
    throw new Error("Enter a name without path separators");
}

export async function renameEntry(root: string, rawPath: unknown, name: unknown): Promise<void> {
  validateName(name);
  const source = await entry(root, rawPath);
  const target = join(dirname(source), name);
  if (source === target) return;
  await absent(target);
  await rename(source, target);
}

export async function entryText(root: string, rawPath: unknown, kind: unknown): Promise<string> {
  const path = await entry(root, rawPath);
  if (kind === "name") return basename(path);
  if (kind === "relative")
    return relative(await realpath(root), path)
      .split("\\")
      .join("/");
  if (kind === "full") return path;
  throw new Error("Invalid clipboard format");
}

export async function createEntry(
  root: string,
  directoryPath: unknown,
  name: unknown,
  kind: unknown,
): Promise<void> {
  validateName(name);
  if (kind !== "file" && kind !== "directory") throw new Error("Invalid entry type");
  const directory = await entry(root, directoryPath, true);
  if (!(await lstat(directory)).isDirectory()) throw new Error("Destination must be a folder");
  const target = join(directory, name);
  await absent(target);
  if (kind === "directory") await mkdir(target);
  else await writeFile(target, "", { flag: "wx" });
}

export async function trashEntry(
  root: string,
  rawPath: unknown,
  trash: (path: string) => Promise<void>,
): Promise<void> {
  const path = await entry(root, rawPath);
  const info = await lstat(path);
  if (!info.isFile() && !info.isDirectory())
    throw new Error("Only regular files and folders can be deleted");
  await trash(path);
}
