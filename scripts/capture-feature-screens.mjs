import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Capture the real Electron UI with disposable project files and app data.
// Run after pnpm build: node scripts/capture-feature-screens.mjs
const temporary = await mkdtemp(join(tmpdir(), "vintage-guide-"));
const project = join(temporary, "sample-app");
const profile = join(temporary, "profile");
const output = resolve("assets/readme");
await mkdir(join(project, "src"), { recursive: true });
await mkdir(join(project, "docs"));
await mkdir(profile);
await mkdir(output, { recursive: true });
const markdown =
  "# Release checklist\n\nKeep the release small, reviewable, and tested.\n\n## Before shipping\n\n- [x] Review the terminal layout\n- [x] Verify file operations\n- [ ] Update screenshots\n- [ ] Prepare release notes\n\n## Verification\n\n| Check | Status |\n| --- | --- |\n| Type checking | Passed |\n| Unit tests | Passed |\n| Desktop smoke | In progress |\n\n```bash\npnpm verify\n```\n";
await writeFile(join(project, "docs/release.md"), markdown);
await writeFile(
  join(project, "README.md"),
  "# Sample app\n\nA small project for the VINTAGE screen guide.\n",
);
await writeFile(
  join(project, "src/tasks.ts"),
  "export function completedTasks(tasks: { done: boolean }[]) {\n  return tasks.filter((task) => task.done);\n}\n",
);
await writeFile(join(project, "package.json"), '{"name":"sample-app","private":true}\n');
execFileSync("git", ["init", "-b", "main", project], { stdio: "ignore" });
execFileSync("git", ["-C", project, "add", "."]);
execFileSync(
  "git",
  [
    "-C",
    project,
    "-c",
    "user.name=Screen Guide",
    "-c",
    "user.email=guide@example.invalid",
    "commit",
    "-m",
    "Initial sample",
  ],
  { stdio: "ignore" },
);
await writeFile(
  join(project, "src/tasks.ts"),
  "export interface Task {\n  title: string;\n  done: boolean;\n}\n\nexport function completedTasks(tasks: Task[]): Task[] {\n  return tasks.filter((task) => task.done);\n}\n\nexport function remainingTasks(tasks: Task[]): Task[] {\n  return tasks.filter((task) => !task.done);\n}\n",
);
const space = (id, title, paneTitle) => ({
  id,
  title,
  panes: [{ id: `${id}-terminal`, title: paneTitle, kind: "terminal" }],
  layout: { type: "pane", paneId: `${id}-terminal` },
  activePaneId: `${id}-terminal`,
});
await writeFile(
  join(profile, "workspace-state.json"),
  JSON.stringify({
    version: 1,
    activeWorkspaceId: "guide-project",
    workspaces: [
      {
        id: "guide-project",
        kind: "project",
        name: "Sample app",
        path: project,
        activeTabId: "development",
        tabs: [
          space("development", "Development", "Dev server"),
          space("checks", "Checks", "Verification"),
        ],
      },
    ],
  }),
);
let app;
try {
  app = await electron.launch({
    args: [
      ...(process.platform === "linux"
        ? ["--no-sandbox", "--disable-gpu", "--disable-backgrounding-occluded-windows"]
        : []),
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
    env: { ...process.env, TYPESAFE_API_KEY: "", VINTAGE_JEV_DEBUG: "0" },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1440, 940);
    window.show();
    window.focus();
  });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "ai-workspace-starter-ui",
      JSON.stringify({
        state: {
          theme: "graphite",
          shell: "bash",
          terminalFontSize: 14,
          uiFontSize: 13,
          sidePaneWidth: 560,
          sidebarWidth: 240,
          desktopNotifications: false,
          notesPanelEnabled: true,
          boardPanelEnabled: true,
        },
        version: 0,
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Files", exact: true }).waitFor();
  const terminal = () =>
    page.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).first();
  async function command(text) {
    await terminal().click({ force: true });
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(650);
  }
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
      return image.toPNG().toString("base64");
    });
    await writeFile(join(output, name), Buffer.from(png, "base64"));
    console.log(`Captured ${name}`);
  }
  async function tab(name) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await terminal().waitFor();
  await command(
    "export PS1='$ '; clear; printf 'Sample app development server\\n\\n  Local: http://localhost:5173\\n  Ready for changes.\\n'",
  );
  await page.keyboard.press("Control+Shift+ArrowRight");
  await terminal().waitFor();
  await command(
    "export PS1='$ '; clear; sleep 2; printf 'Verification failed: update the release screenshots\\n'; false",
  );
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await page.waitForTimeout(2800);
  await capture("vintage-background-attention.png");
  // Use the real toast action so routing is exercised and the toast closes.
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await capture("vintage-attention-routing.png");
  await tab("Review");
  await page.getByRole("button").filter({ hasText: "src/tasks.ts" }).first().click();
  await capture("vintage-git-review.png");
  await tab("Files");
  await page.getByRole("button", { name: "README.md", exact: true }).click({ button: "right" });
  await page.getByRole("menu", { name: "File actions" }).waitFor();
  await capture("vintage-file-actions.png");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "docs", exact: true }).click();
  await page.getByRole("button", { name: "release.md", exact: true }).dblclick();
  await page.getByRole("button", { name: "Edit", exact: true }).filter({ visible: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown editor" })
    .fill(
      markdown + "\n## Release notes\n\nDocument the Files menu and Notes / Board shortcuts.\n",
    );
  // Give the editor enough width to read the draft and its Save controls.
  await tab("Files");
  await page.keyboard.press("Control+Shift+S");
  await capture("vintage-markdown-editing.png");
  await page
    .locator('[data-pane-kind="file"]')
    .getByRole("button", { name: /^Close / })
    .click();
  await page.keyboard.press("Control+Shift+S");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await tab("Notes");
  await page
    .getByRole("textbox", { name: "Workspace notes", exact: true })
    .fill(
      "# Workspace notes\n\n## Today\n\n- Review the new Files menu\n- Finish the screenshot guide\n- Prepare the release checklist\n\n## Next steps\n\nKeep terminals running while reviewing changes.\nTurn selected notes into Board cards.\n",
    );
  await capture("vintage-notes.png");
  await page.evaluate(async () => {
    const snapshot = await window.desktop.readWorkspaceKanban("guide-project", {
      version: 1,
      cards: [],
    });
    await window.desktop.saveWorkspaceKanban(
      "guide-project",
      {
        version: 1,
        cards: [
          {
            id: "guide-screens",
            title: "Update screen guide",
            notes:
              "Capture Files, Markdown, Notes, and Board.\nKeep English and Japanese docs aligned.",
            status: "todo",
          },
          {
            id: "guide-release",
            title: "Prepare release notes",
            notes: "Describe new file operations and shortcuts.",
            status: "todo",
          },
          {
            id: "guide-files",
            title: "Review Files menu",
            notes: "Check copy, paste, rename, and path copy.",
            status: "doing",
          },
          {
            id: "guide-checks",
            title: "Run verification",
            notes: "Type checking and unit tests passed.",
            status: "done",
          },
        ],
      },
      snapshot.revision,
    );
  });
  await tab("Board");
  await page.getByRole("button", { name: "Update screen guide", exact: true }).waitFor();
  await capture("vintage-board.png");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByRole("button", { name: "Shortcuts", exact: true }).click();
  await page.getByLabel("Set Open Board pane shortcut").scrollIntoViewIfNeeded();
  await capture("vintage-shortcuts.png");
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true });
}
