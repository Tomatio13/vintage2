import { open } from "node:fs/promises";
import { extname } from "node:path";

const pending = new Map<string, Promise<void>>();

/** Serialize saves to a file and reject changes made since the editor read it. */
export async function saveMarkdown(
  path: string,
  content: unknown,
  expected: unknown,
): Promise<void> {
  if (![".md", ".markdown", ".mdown", ".mkd"].includes(extname(path).toLowerCase()))
    throw new Error("Only Markdown files can be edited.");
  if (
    typeof content !== "string" ||
    typeof expected !== "string" ||
    Buffer.byteLength(content) > 1_000_000 ||
    Buffer.byteLength(expected) > 1_000_000
  )
    throw new Error("Markdown must be at most 1 MB.");
  const previous = pending.get(path) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      const handle = await open(path, "r+");
      try {
        if ((await handle.stat()).size > 1_000_000 || (await handle.readFile("utf8")) !== expected)
          throw new Error(
            "File changed outside this editor. Your draft is safe; copy it or reload the file before saving.",
          );
        const bytes = Buffer.from(content);
        let offset = 0;
        while (offset < bytes.length) {
          const result = await handle.write(bytes, offset, bytes.length - offset, offset);
          if (!result.bytesWritten) throw new Error("Could not finish saving.");
          offset += result.bytesWritten;
        }
        await handle.truncate(bytes.length);
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
  pending.set(path, task);
  try {
    await task;
  } finally {
    if (pending.get(path) === task) pending.delete(path);
  }
}
