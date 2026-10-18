import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const profile = await mkdtemp(join(tmpdir(), "vintage-board-smoke-"));
const app = await electron.launch({
  args: [
    ...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : []),
    `--user-data-dir=${profile}`,
    resolve("dist/main/index.js"),
  ],
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1600, 1000);
    window.show();
    window.focus();
    window.webContents.setBackgroundThrottling(false);
  });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "ai-workspace-starter-ui",
      JSON.stringify({
        version: 0,
        state: {
          boardPanelEnabled: true,
          notesPanelEnabled: true,
          activeSidePaneTabId: "board",
          sidePaneOpen: true,
          sidePaneWidth: 560,
          sidebarOpen: false,
        },
      }),
    );
  });
  await page.reload();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.focus();
  });
  const board = page.getByRole("region", { name: "Kanban board", exact: true });
  await board.getByRole("button", { name: "Add card", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Add card"]').disabled);
  await page.locator('[data-pane-kind="terminal"] .xterm').waitFor();
  await page.evaluate(() => {
    window.boardSmokeTerminal = document.querySelector('[data-pane-kind="terminal"] .xterm');
    window.boardSmokePane = window.boardSmokeTerminal.closest("[data-pane-id]").dataset.paneId;
    window.boardSmokeData = [];
    window.boardSmokeExits = [];
    window.desktop.onTerminalData((event) => window.boardSmokeData.push(event));
    window.desktop.onTerminalExit((event) => window.boardSmokeExits.push(event));
  });
  const terminal = page.locator('[data-pane-kind="terminal"] .xterm-helper-textarea');
  await page.waitForFunction(() => !document.body.textContent.includes("Starting terminal…"));
  await terminal.focus();
  await page.keyboard.type("echo VINTAGE_BOARD_BEFORE");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      window.boardSmokeData
        .map((event) => event.data)
        .join("")
        .includes("VINTAGE_BOARD_BEFORE"),
    undefined,
    { polling: 100, timeout: 10000 },
  );
  const session = await page.evaluate(() => window.boardSmokeData.at(-1).sessionId);

  await board.getByRole("button", { name: "Add card to Doing", exact: true }).click();
  await board.getByRole("textbox", { name: "New card title" }).fill("Inline desktop task");
  await board.getByRole("textbox", { name: "New card title" }).press("Enter");
  await board.getByRole("article", { name: "Inline desktop task" }).waitFor();
  await board.getByRole("textbox", { name: "New card title" }).press("Escape");
  await board.getByRole("button", { name: "Inline desktop task", exact: true }).click();
  assert.equal(await board.getByRole("article").count(), 1, "detail must keep the board visible");
  await board
    .getByRole("textbox", { name: "Card notes" })
    .fill("Desktop notes\nMore requirements\nVerification results\nFourth line");
  await board.getByRole("button", { name: "Save card", exact: true }).click();
  await board.getByRole("article", { name: "Inline desktop task" }).waitFor();
  assert.equal(
    await board.getByRole("article", { name: "Inline desktop task" }).locator("p").count(),
    0,
    "notes belong in details, not cards",
  );
  await board.getByRole("button", { name: "Inline desktop task", exact: true }).click();
  await board.getByRole("combobox", { name: "Card priority" }).selectOption("high");
  await board.getByLabel("Card due date", { exact: true }).fill("2027-01-01");
  await board.getByRole("textbox", { name: "New card label" }).fill("Design");
  await board.getByRole("button", { name: "Save card", exact: true }).click();
  await page.waitForFunction(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    const snapshot = await window.desktop.readWorkspaceKanban(workspace.id);
    return snapshot.board.version === 2 && snapshot.board.cards[0].labels?.includes("Design");
  });
  await board
    .getByRole("article", { name: "Inline desktop task" })
    .getByText("Design", { exact: true })
    .waitFor();
  await board.getByRole("button", { name: "Restore board to side pane", exact: true }).click();

  await page.evaluate(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    const snapshot = await window.desktop.readWorkspaceKanban(workspace.id);
    const cards = Array.from({ length: 35 }, (_, i) => ({
      id: `card-${i}`,
      title: `Desktop card ${i}`,
      notes: "A long note\nSecond line\nThird line\nFourth line",
      status: i < 25 ? "todo" : i < 30 ? "doing" : "done",
      priority: i % 2 ? "high" : "medium",
      dueDate: "2027-01-01",
      labels: [i % 2 ? "Design" : "Frontend"],
    }));
    await window.desktop.saveWorkspaceKanban(
      workspace.id,
      { version: 2, cards },
      snapshot.revision,
    );
  });
  await board.getByRole("button", { name: "Reload board" }).click();
  await board.getByRole("article", { name: "Desktop card 0", exact: true }).waitFor();
  const separator = page.getByRole("separator", { name: "Resize browser pane", exact: true });
  const resize = async (width) => {
    const current = Number(await separator.getAttribute("aria-valuenow"));
    const rect = await separator.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + current - width, rect.y + rect.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await page.waitForFunction(
      (value) =>
        Number(
          document
            .querySelector('[aria-label="Resize browser pane"]')
            .getAttribute("aria-valuenow"),
        ) === value,
      width,
    );
  };
  const geometry = [];
  for (const width of [320, 560, 900]) {
    await resize(width);
    const dimensions = await board.evaluate((element) => {
      const scroll = element.querySelector("[data-board-scroll]");
      const column = element.querySelector('[data-kanban-column="todo"]');
      const body = column.querySelector("[data-board-body]");
      return {
        board: element.clientWidth,
        column: column.getBoundingClientRect().width,
        horizontal: scroll.scrollWidth > scroll.clientWidth,
        vertical: body.scrollHeight > body.clientHeight,
      };
    });
    assert.equal(dimensions.column, 260);
    assert.equal(dimensions.vertical, true);
    assert.equal(dimensions.horizontal, width < 900);
    geometry.push({ width, ...dimensions });
  }
  await board.getByRole("button", { name: "Collapse To do" }).click();
  assert.equal(
    await board
      .getByRole("region", { name: "To do", exact: true })
      .evaluate((element) => element.getBoundingClientRect().width),
    44,
  );
  await board.getByRole("button", { name: "Expand To do" }).click();
  await board.getByRole("textbox", { name: "Search cards" }).fill("Desktop card 0");
  assert.equal(await board.getByRole("article").count(), 1);
  await board.getByRole("button", { name: "Clear search", exact: true }).click();

  // Real mouse drag: second card before first, then verify the canonical array.
  const body = board
    .getByRole("region", { name: "To do", exact: true })
    .locator("[data-board-body]");
  await body.evaluate((element) => {
    element.scrollTop = 0;
  });
  const second = await board
    .getByRole("article", { name: "Desktop card 1", exact: true })
    .boundingBox();
  const first = await board
    .getByRole("article", { name: "Desktop card 0", exact: true })
    .boundingBox();
  await page.mouse.move(second.x + 5, second.y + second.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 5, first.y + 5, { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    const snapshot = await window.desktop.readWorkspaceKanban(workspace.id);
    return snapshot.board.cards[0].id === "card-1";
  });
  await board.getByRole("button", { name: "Desktop card 0", exact: true }).click();
  const drawer = await board.getByRole("complementary", { name: "Card details" }).boundingBox();
  const list = await board.locator(".board-list").boundingBox();
  assert(list.x + list.width <= drawer.x + 1, "list and drawer must be side by side");
  assert(await board.getByRole("article", { name: "Desktop card 0", exact: true }).isVisible());
  await page.screenshot({ path: join(profile, "board-drawer-light.png"), timeout: 10000 });
  await board.getByRole("button", { name: "Cancel card editing", exact: true }).click();
  await board.getByRole("button", { name: "Restore board to side pane", exact: true }).click();

  await page.evaluate(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    const snapshot = await window.desktop.readWorkspaceKanban(workspace.id);
    const cards = Array.from({ length: 1000 }, (_, i) => ({
      id: `large-${i}`,
      title: i === 0 ? "LongTitle".repeat(22) : `Large board card ${i}`,
      notes: "Long requirements and verification results.\n".repeat(6),
      status: ["todo", "doing", "done"][i % 3],
      priority: i % 2 ? "high" : "medium",
      labels: ["Design"],
      dueDate: "2027-01-01",
    }));
    await window.desktop.saveWorkspaceKanban(
      workspace.id,
      { version: 2, cards },
      snapshot.revision,
    );
  });
  await board.getByRole("button", { name: "Reload board" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-board-card]").length === 1000);
  const overflowing = await board.evaluate((element) =>
    [...element.querySelectorAll("[data-board-card]")].some(
      (card) => card.scrollWidth > card.clientWidth,
    ),
  );
  assert.equal(overflowing, false, "long titles and notes must wrap within cards");
  await page.screenshot({ path: join(profile, "board-light.png"), timeout: 10000 });
  // A typical-sized board for visual review after the 1,000-card stress check.
  await page.evaluate(async () => {
    const workspace = await window.desktop.getHomeWorkspace();
    const snapshot = await window.desktop.readWorkspaceKanban(workspace.id);
    const titles = [
      "Prepare design system tokens",
      "Review responsive layouts",
      "Prepare developer handoff",
      "Build hero component",
      "Weekly design sync notes",
      "Finalize navigation",
      "Design responsive navigation",
      "Design mobile onboarding",
      "Audit color contrast",
      "Document component states",
      "Review typography",
      "Polish button styles",
    ];
    const cards = titles.map((title, i) => ({
      id: `design-${i}`,
      title,
      notes:
        i === 0
          ? "Define shared color, spacing, and typography tokens.\nKeep existing terminal sessions intact and verify every theme."
          : "",
      status: i < 5 ? "todo" : i < 8 ? "doing" : "done",
      priority: i === 5 ? "high" : "medium",
      labels: i % 2 ? ["QA", "Design"] : ["Design"],
      dueDate: i % 2 ? "2027-01-01" : null,
    }));
    await window.desktop.saveWorkspaceKanban(
      workspace.id,
      { version: 2, cards },
      snapshot.revision,
    );
  });
  await board.getByRole("button", { name: "Reload board" }).click();
  await board.getByRole("article", { name: "Prepare design system tokens", exact: true }).waitFor();
  await board.getByRole("button", { name: "Prepare design system tokens", exact: true }).click();
  for (const title of ["Define colors", "Define spacing", "Verify typography", "Check keyboard"]) {
    await board.getByRole("textbox", { name: "New subtask title" }).fill(title);
    await board.getByRole("textbox", { name: "New subtask title" }).press("Enter");
  }
  await board.getByRole("checkbox", { name: "Complete subtask Define colors" }).check();
  await board.getByRole("button", { name: "Save card", exact: true }).click();
  await board.getByRole("form").waitFor({ state: "hidden" });
  assert.equal(
    await board
      .getByRole("article", { name: "Prepare design system tokens", exact: true })
      .getByRole("progressbar")
      .getAttribute("aria-valuenow"),
    "1",
  );
  await board.getByRole("button", { name: "Copy AI instructions", exact: true }).click();
  await board
    .getByText("AI instructions copied · Paste into your agent", { exact: true })
    .waitFor();
  const instructions = await app.evaluate(({ clipboard }) => clipboard.readText());
  const skillFile = JSON.parse(instructions.match(/Agent Skill: ("(?:\\.|[^"\\])*")/)[1]);
  const boardFile = JSON.parse(
    instructions
      .split("\n")
      .find((line) => line.startsWith("Board: "))
      .slice(7),
  );
  assert((await readFile(skillFile, "utf8")).includes("--subtask-done"));
  const helper = join(skillFile, "..", "scripts", "update-card.py");
  const selected = JSON.parse(
    execFileSync("python3", [helper, "--board", boardFile, "--card", "design-0", "--read"], {
      encoding: "utf8",
    }),
  );
  assert.equal(selected.subtasks.length, 4);
  execFileSync("python3", [
    helper,
    "--board",
    boardFile,
    "--card",
    "design-0",
    "--subtask",
    selected.subtasks[1].id,
    "--subtask-done",
    "true",
    "--note",
    "Agent skill verified",
  ]);
  await board.getByRole("button", { name: "Reload board", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Prepare design system tokens"] [role="progressbar"]')
        ?.getAttribute("aria-valuenow") === "2",
  );
  await board.getByRole("button", { name: "Restore board to side pane", exact: true }).click();
  for (const theme of ["Dark", "Graphite", "Light"]) {
    await page.keyboard.press("Control+Shift+P");
    await page
      .getByRole("combobox", { name: "Search actions, workspaces, Spaces, or terminals" })
      .fill("Settings");
    await page.getByRole("option", { name: /Settings/ }).click();
    await page
      .getByRole("button", {
        name: `${theme === "Light" ? "Light" : "Dark"} appearance`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: `${theme === "Graphite" ? "Graphite" : "Vintage"} ${theme === "Light" ? "light" : "dark"} palette`,
        exact: true,
      })
      .click();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Settings", exact: true }).waitFor({ state: "hidden" });
    await board.getByRole("button", { name: "Expand board", exact: true }).click();
    const columnHeights = await board.evaluate((element) =>
      [...element.querySelectorAll("[data-kanban-column]")].map(
        (column) => column.getBoundingClientRect().height,
      ),
    );
    assert(columnHeights[0] > columnHeights[1], "columns should follow their own card count");
    await board.getByRole("button", { name: "Prepare design system tokens", exact: true }).click();
    await board.getByRole("region", { name: "Subtasks", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(profile, `board-${theme.toLowerCase()}.png`),
      timeout: 10000,
    });
    await board.getByRole("button", { name: "Cancel card editing", exact: true }).click();
    await board.getByRole("button", { name: "Restore board to side pane", exact: true }).click();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  assert(
    await page.evaluate(
      () =>
        window.boardSmokeTerminal ===
          document.querySelector('[data-pane-kind="terminal"] .xterm') &&
        window.boardSmokePane ===
          window.boardSmokeTerminal.closest("[data-pane-id]").dataset.paneId,
    ),
  );
  assert.deepEqual(await page.evaluate(() => window.boardSmokeExits), []);
  await terminal.focus();
  await page.keyboard.type("echo VINTAGE_BOARD_AFTER");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) =>
      window.boardSmokeData
        .filter((event) => event.sessionId === id)
        .map((event) => event.data)
        .join("")
        .includes("VINTAGE_BOARD_AFTER"),
    session,
    { polling: 100, timeout: 10000 },
  );
  console.log(
    JSON.stringify(
      { geometry, sessionPreserved: true, largeBoardCards: 1000, screenshots: profile },
      null,
      2,
    ),
  );
} catch (error) {
  const page = await app.firstWindow();
  console.error(
    "Failure diagnostics:",
    await page
      .evaluate(() => ({
        text: document.body.innerText.slice(-1500),
        data: window.boardSmokeData?.slice(-8),
        active: document.activeElement?.tagName,
      }))
      .catch(() => null),
  );
  await page
    .screenshot({ path: join(profile, "failure.png"), timeout: 5000 })
    .then(() => console.error("Failure screenshot:", join(profile, "failure.png")))
    .catch(() => {});
  throw error;
} finally {
  await app.close();
}
