import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveMarkdown } from "../src/main/markdownSave.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "vintage-markdown-"));
  directories.push(directory);
  const path = join(directory, "note.md");
  await writeFile(path, "# Original\n");
  return path;
}
describe("Markdown saves", () => {
  it("saves UTF-8 and truncates the old tail", async () => {
    const path = await fixture();
    await saveMarkdown(path, "メモ", "# Original\n");
    expect(await readFile(path, "utf8")).toBe("メモ");
  });
  it("rejects stale and competing saves without overwriting", async () => {
    const path = await fixture();
    const results = await Promise.allSettled([
      saveMarkdown(path, "first", "# Original\n"),
      saveMarkdown(path, "second", "# Original\n"),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(await readFile(path, "utf8")).toBe("first");
  });
  it("rejects oversized files and non-Markdown writes", async () => {
    const path = await fixture();
    await writeFile(path, "x".repeat(1_000_001));
    await expect(saveMarkdown(path, "short", "x")).rejects.toThrow();
    expect((await readFile(path)).length).toBe(1_000_001);
    await expect(saveMarkdown(path.replace(".md", ".env"), "secret", "")).rejects.toThrow(
      "Only Markdown",
    );
  });
});
