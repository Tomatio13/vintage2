import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const root = await mkdtemp(join(tmpdir(), "vintage-review-smoke-"));
const profile = await mkdtemp(join(tmpdir(), "vintage-review-profile-"));
const git = (...args) => execFileSync("git", args, { cwd: root });
let app;
try {
  git("init", "-q", "-b", "main");
  git("config", "user.name", "VINTAGE review smoke");
  git("config", "user.email", "review@example.invalid");
  await writeFile(join(root, "a-large.ts"), "export const baseline = 0;\n");
  const contextLines = Array.from(
    { length: 30000 },
    (_, i) => `${String(i).padStart(5, "0")}:${"a".repeat(90)}`,
  );
  await writeFile(join(root, "a-context.ts"), contextLines.join("\n") + "\n");
  git("add", ".");
  git("commit", "-qm", "baseline");
  git("checkout", "-qb", "feature");
  await writeFile(join(root, "a-large.ts"), "export const branchValue = 1;\n");
  git("add", ".");
  git("commit", "-qm", "feature");
  await writeFile(
    join(root, "a-large.ts"),
    Array.from({ length: 1200 }, (_, i) => `line_${i}`).join("\n") + "\n",
  );
  await writeFile(join(root, "a-huge.ts"), "x".repeat(1200000) + "\n");
  contextLines[15000] = "context_changed_15000";
  await writeFile(join(root, "a-context.ts"), contextLines.join("\n") + "\n");
  // Keep filesystem concurrency bounded too; these are real Git changes, not bridge mocks.
  for (let start = 0; start < 5000; start += 100) {
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        writeFile(
          join(root, `file-${String(start + i).padStart(5, "0")}.ts`),
          "export const changed = true;\n",
        ),
      ),
    );
  }
  app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1600, 1000);
    window.show();
    window.focus();
    window.webContents.setBackgroundThrottling(false);
  });
  await page.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const review = page.getByRole("region", { name: "Git review", exact: true });
  const branchSection = review
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Committed on branch" }) });
  await branchSection.getByRole("button", { name: /^a-large\.ts/ }).click();
  await branchSection.locator("code.whitespace-pre").filter({ hasText: "branchValue" }).waitFor();
  await review.getByRole("button", { name: "Review scope", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Local Changes", exact: true }).click();
  await review.getByRole("button", { name: /^a-large\.ts/ }).waitFor();
  assert.equal(await review.getByRole("button", { name: /^(?:a-|file-)/ }).count(), 100);
  await page.evaluate(() => {
    window.reviewSmokeData = [];
    window.reviewSmokeExits = [];
    window.reviewSmokeStreams = new Map();
    window.reviewSmokeSession = null;
    window.reviewSmokeIgnoredData = 0;
    window.reviewSmokeIgnoredExits = 0;
    window.reviewSmokeStopData = window.desktop.onTerminalData((event) => {
      if (window.reviewSmokeSession && event.sessionId !== window.reviewSmokeSession) {
        window.reviewSmokeIgnoredData++;
        return;
      }
      window.reviewSmokeData.push(event);
      window.reviewSmokeStreams.set(
        event.sessionId,
        (window.reviewSmokeStreams.get(event.sessionId) ?? "") + event.data,
      );
    });
    window.reviewSmokeStopExit = window.desktop.onTerminalExit((event) => {
      if (window.reviewSmokeSession && event.sessionId !== window.reviewSmokeSession) {
        window.reviewSmokeIgnoredExits++;
        return;
      }
      window.reviewSmokeExits.push(event);
    });
    window.reviewSmokeLast = performance.now();
    window.reviewSmokeGap = 0;
    window.reviewSmokeTimer = setInterval(() => {
      const now = performance.now();
      window.reviewSmokeGap = Math.max(window.reviewSmokeGap, now - window.reviewSmokeLast);
      window.reviewSmokeLast = now;
    }, 50);
  });
  const terminal = page
    .locator('[data-pane-kind="terminal"] .xterm-helper-textarea')
    .filter({ visible: true });
  const checkTerminal = async (suffix) => {
    await terminal.focus();
    await page.keyboard.type(`printf 'VINTAGE_REVIEW_%s\\n' ${suffix}`);
    await page.keyboard.press("Enter");
    // Output can be chunked or interleaved with a hidden Home terminal's replay.
    // Identify the visible terminal by its executed marker, never by the last event.
    const match = await page.waitForFunction(
      (marker) =>
        [...window.reviewSmokeStreams].find(
          ([sessionId, data]) =>
            (!window.reviewSmokeSession || sessionId === window.reviewSmokeSession) &&
            data.includes(marker),
        )?.[0],
      `VINTAGE_REVIEW_${suffix}`,
    );
    const sessionId = await match.jsonValue();
    await match.dispose();
    return sessionId;
  };
  // Exercise unrelated IPC traffic deterministically, including before target discovery.
  // No live session uses this test-only id, so other terminal views ignore these events.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("terminal:data", {
      sessionId: "review-smoke-unrelated",
      data: "replayed hidden terminal prompt\r\n",
    });
  });
  const session = await checkTerminal("BEFORE");
  await page.evaluate((sessionId) => {
    window.reviewSmokeSession = sessionId;
    window.reviewSmokeIgnoredData += window.reviewSmokeData.filter(
      (event) => event.sessionId !== sessionId,
    ).length;
    window.reviewSmokeIgnoredExits += window.reviewSmokeExits.filter(
      (event) => event.sessionId !== sessionId,
    ).length;
    window.reviewSmokeData = window.reviewSmokeData.filter(
      (event) => event.sessionId === sessionId,
    );
    window.reviewSmokeExits = window.reviewSmokeExits.filter(
      (event) => event.sessionId === sessionId,
    );
    window.reviewSmokeStreams = new Map([[sessionId, window.reviewSmokeStreams.get(sessionId)]]);
  }, session);
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.send("terminal:data", {
      sessionId: "review-smoke-unrelated",
      data: "late hidden terminal replay\r\n",
    });
    contents.send("terminal:exit", { sessionId: "review-smoke-unrelated", exitCode: 0 });
  });
  await page.waitForFunction(
    () => window.reviewSmokeIgnoredData >= 2 && window.reviewSmokeIgnoredExits >= 1,
  );
  const start = Date.now();
  await review.getByRole("button", { name: /^a-large\.ts/ }).click();
  await review.getByText("line_0", { exact: true }).waitFor();
  const openMs = Date.now() - start;
  assert.ok((await review.locator("code.whitespace-pre").count()) <= 200);
  const diffPages = review.getByRole("navigation", { name: "Diff pages" });
  await diffPages.getByRole("button", { name: "Next", exact: true }).click();
  await review.getByText("line_250", { exact: true }).waitFor();
  // Allow a real automatic refresh and verify the user's diff page is retained.
  await page.waitForTimeout(3800);
  await review.getByText("line_250", { exact: true }).waitFor();
  await review.getByRole("button", { name: /^a-context\.ts/ }).click();
  await review.getByText("context_changed_15000", { exact: true }).waitFor();
  for (let step = 0; step < 4; step++) {
    await review
      .getByRole("button", { name: /^\d+ unmodified lines$/ })
      .first()
      .click();
    await review.getByText("Loading more context…", { exact: true }).waitFor({ state: "hidden" });
  }
  await review
    .getByText("Additional context exceeds the display limit.", { exact: false })
    .waitFor();
  await review.getByText("context_changed_15000", { exact: true }).waitFor();
  await review.getByRole("button", { name: /^a-huge\.ts/ }).click();
  await review.getByText("Diff exceeds the display limit.", { exact: false }).waitFor();
  await review.getByRole("button", { name: /^a-huge\.ts/ }).click();
  const filePages = review.getByRole("navigation", { name: "Unstaged file pages" });
  await filePages.getByRole("button", { name: "Next", exact: true }).click();
  await review.getByRole("button", { name: /^file-00098\.ts/ }).click();
  await review.locator("code.whitespace-pre").filter({ hasText: "changed" }).waitFor();
  assert.equal(await review.getByRole("button", { name: /^(?:a-|file-)/ }).count(), 100);
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await review.getByRole("button", { name: /^file-00098\.ts/ }).waitFor();
  assert.equal(await checkTerminal("AFTER"), session, "the visible terminal must keep its session");
  const state = await page.evaluate(() => {
    clearInterval(window.reviewSmokeTimer);
    window.reviewSmokeStopData();
    window.reviewSmokeStopExit();
    return {
      ignoredDataEvents: window.reviewSmokeIgnoredData,
      ignoredExitEvents: window.reviewSmokeIgnoredExits,
      maxGapMs: Math.round(window.reviewSmokeGap),
      exits: window.reviewSmokeExits,
      sessions: [...new Set(window.reviewSmokeData.map((event) => event.sessionId))],
    };
  });
  assert.ok(state.ignoredDataEvents >= 2, "unrelated replay events must be ignored");
  assert.ok(state.ignoredExitEvents >= 1, "unrelated exit events must be ignored");
  assert.equal(state.exits.length, 0);
  assert.deepEqual(state.sessions, [session]);
  assert.ok(state.maxGapMs < 2000, `renderer stalled for ${state.maxGapMs}ms`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "/tmp/vintage-review-smoke.png" });
  console.log(
    JSON.stringify({
      changedFiles: 5003,
      openMs,
      ...state,
      result: "branch/local diffs, paging, auto-refresh, oversized fallback, tabs and live PTY OK",
    }),
  );
} finally {
  if (app) await app.close();
  await rm(root, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
