import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import script from "../../skills/vintage-board/scripts/update-card.py?raw";
import skill from "../../skills/vintage-board/SKILL.md?raw";

export async function prepareKanbanCli(boardDirectory: string): Promise<string> {
  const root = dirname(boardDirectory);
  await mkdir(root, { recursive: true });
  const skillRoot = join(root, "skills", "vintage-board");
  await mkdir(join(skillRoot, "scripts"), { recursive: true });
  await replaceResource(join(skillRoot, "scripts", "update-card.py"), script);
  await replaceResource(join(skillRoot, "SKILL.md"), skill);
  const path = join(root, "update-card.py");
  await replaceResource(path, script);
  return path;
}

async function replaceResource(path: string, content: string): Promise<void> {
  const temporary = join(dirname(path), `resource-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
