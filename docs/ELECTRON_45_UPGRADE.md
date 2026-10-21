# Electron 45 upgrade

VINTAGE now pins Electron **45.0.0**, replacing **41.0.3**. The lockfile updates Electron and its download/extraction dependencies; application dependencies are unchanged.

## Compatibility impact

- **Clipboard:** Electron 44 removed `readImage()` and made clipboard reads/writes asynchronous. Terminal paste now reads image blobs, converts them to PNG, and retains image priority and the 25 MiB image / 1 MiB text limits. Copy IPC waits for writes to complete; browser context-menu actions handle rejected writes.
- **macOS:** Electron 44+ requires macOS 13 (Ventura). Electron 42+ native notifications require code signing, so the current unsigned macOS distribution cannot display OS notifications. In-app attention remains available.
- **Linux windows and graphics:** Electron 43 changed frameless-window corner defaults; Electron 44 statically links ANGLE. Existing custom chrome and xterm rendering passed the Linux smoke tests.
- **File dialogs:** Electron 43 defaults dialogs without an explicit `defaultPath` to Downloads (or Home when Downloads is unavailable). This affects executable and project folder pickers that previously used the platform default.
- **Sandboxed preload:** Electron 45 removed several Node globals/modules from sandboxed preload scripts. VINTAGE's preload does not use the removed `Buffer`, `setImmediate`, `clearImmediate`, `events`, `timers`, or `url` features.
- **Binary acquisition:** Electron 42+ downloads its binary on first use instead of npm postinstall. The existing dev launcher imports Electron, which initializes the binary automatically. The first launch requires network access; `pnpm exec install-electron` can prefetch it.
- **Native modules and packaging:** `node-pty` remains at 1.1.0. The existing `npmRebuild: true` and `asarUnpack` configuration works with Electron 45 on Linux x64. CI already uses Node 24 and 64-bit Linux, Windows, and macOS runners.

## Verification

- Boundary checks, TypeScript, lint, formatting, production build: passed.
- Unit tests: 540 passed, 1 skipped.
- Linux Electron smoke tests: clipboard, terminal/session reattachment, settings, browser controls, browser persistence, local-resource security, and Sessions history/analysis/resume passed.
- Linux directory package: native rebuild and packaging passed; the packaged app launched with Electron 45.0.0, Node 24.22.0, Chromium 156.0.8078.48 and displayed a terminal.
- Board E2E: timed out waiting for a mouse drag to resize the pane from 560 to 320 pixels. The same timeout reproduced using the retained Electron 41.0.3 binary with the same app build; the Board suite is not counted as passing.
- Windows/macOS builds and runtime, installed-app updater/restart: not verified in this change. Existing experimental platform labels remain in the README.

Run `pnpm test:e2e:clipboard` for the clipboard regression test. It uses an isolated app profile and restores the previous clipboard contents.

## Upstream references

- [Electron 45.0.0 release](https://github.com/electron/electron/releases/tag/v45.0.0)
- [Electron 44.9.3 upstream backports](https://github.com/electron/electron/releases/tag/v44.9.3)
- [Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes)
