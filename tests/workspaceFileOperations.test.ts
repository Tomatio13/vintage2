import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyEntry,
  entryText,
  renameEntry,
  createEntry,
  trashEntry,
} from "../src/main/workspaceFileOperations.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vintage-files-"));
  await writeFile(join(root, "note.md"), "hello");
  await mkdir(join(root, "folder"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
describe("workspace file operations", () => {
  it("copies files and folders, keeping originals", async () => {
    await copyEntry(root, "note.md", root, "folder");
    expect(await readFile(join(root, "folder/note.md"), "utf8")).toBe("hello");
    await mkdir(join(root, "target"));
    await copyEntry(root, "folder", root, "target");
    expect(await readFile(join(root, "target/folder/note.md"), "utf8")).toBe("hello");
    expect(await readFile(join(root, "note.md"), "utf8")).toBe("hello");
  });
  it("rejects collisions without altering content", async () => {
    await writeFile(join(root, "folder/note.md"), "existing");
    await expect(copyEntry(root, "note.md", root, "folder")).rejects.toThrow("already exists");
    await expect(renameEntry(root, "note.md", "folder")).rejects.toThrow("already exists");
    expect(await readFile(join(root, "folder/note.md"), "utf8")).toBe("existing");
  });
  it("renames files and folders and supplies clipboard formats", async () => {
    await renameEntry(root, "note.md", "new.md");
    await renameEntry(root, "folder", "renamed");
    await copyEntry(root, "new.md", root, "renamed");
    expect(await entryText(root, "renamed/new.md", "name")).toBe("new.md");
    expect(await entryText(root, "renamed/new.md", "relative")).toBe("renamed/new.md");
    expect(await entryText(root, "renamed/new.md", "full")).toBe(join(root, "renamed/new.md"));
  });
  it("rejects traversal, roots, invalid names, recursive copies and links", async () => {
    await expect(renameEntry(root, "note.md", "../escape")).rejects.toThrow();
    await expect(renameEntry(root, "", "new")).rejects.toThrow();
    await expect(copyEntry(root, "../", root, "folder")).rejects.toThrow();
    await expect(copyEntry(root, "folder", root, "folder")).rejects.toThrow("itself");
    await symlink(join(root, "note.md"), join(root, "folder/link"));
    await mkdir(join(root, "target"));
    await expect(copyEntry(root, "folder", root, "target")).rejects.toThrow("regular files");
    await expect(renameEntry(root, "folder/link", "renamed")).rejects.toThrow("Symbolic links");
  });
});

it("creates empty files and folders without overwriting existing entries", async () => {
  await createEntry(root, "", "new", "directory");
  await createEntry(root, "new", "empty.txt", "file");
  expect(await readFile(join(root, "new/empty.txt"), "utf8")).toBe("");
  await expect(createEntry(root, "", "note.md", "file")).rejects.toThrow("already exists");
  expect(await readFile(join(root, "note.md"), "utf8")).toBe("hello");
});
it("rejects unsafe creation paths and entry types", async () => {
  await symlink(root, join(root, "link"));
  for (const directory of ["../", "link", "note.md"]) {
    await expect(createEntry(root, directory, "new", "file")).rejects.toThrow();
  }
  for (const name of ["../escape", ".", "..", "a/b", "", "a\\b", "bad\0name"]) {
    await expect(createEntry(root, "", name, "file")).rejects.toThrow();
  }
  await expect(createEntry(root, "", "new", "invalid")).rejects.toThrow();
});
it("trashes files and nonempty folders but rejects roots, traversal and links", async () => {
  const targets: string[] = [];
  const trash = async (path: string) => {
    targets.push(path);
    await rm(path, { recursive: true });
  };
  await writeFile(join(root, "folder/child.txt"), "child");
  await trashEntry(root, "note.md", trash);
  await trashEntry(root, "folder", trash);
  expect(targets).toEqual([join(root, "note.md"), join(root, "folder")]);
  await symlink(root, join(root, "link"));
  for (const path of ["", ".", "../", "link"])
    await expect(trashEntry(root, path, trash)).rejects.toThrow();
  expect(targets).toHaveLength(2);
});
it("propagates trash failures without deleting the file", async () => {
  await expect(
    trashEntry(root, "note.md", async () => {
      throw new Error("Trash unavailable");
    }),
  ).rejects.toThrow("Trash unavailable");
  expect(await readFile(join(root, "note.md"), "utf8")).toBe("hello");
});
