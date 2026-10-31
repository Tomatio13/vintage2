<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-lockup-dark.svg">
  <img src="assets/brand/vintage-lockup-light.svg" alt="VINTAGE - Visual Interface for Terminal Agents" width="440">
</picture>

**The terminal workspace built for the age of AI agents.**

## Agents run in parallel. The terminal calls you back.

**VINTAGE** runs multiple AI agents side by side on one screen.
Completion, error, input needed — the moment it matters, it comes to you.

[![Download for Linux](https://img.shields.io/badge/Download%20for%20Linux-E8641C?style=for-the-badge&labelColor=1C1E20&logo=linux&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for macOS](https://img.shields.io/badge/Download%20for%20macOS-E8641C?style=for-the-badge&labelColor=1C1E20&logo=apple&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Download%20for%20Windows-E8641C?style=for-the-badge&labelColor=1C1E20&logo=windows&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)

Linux · macOS · Windows ／ Apache 2.0 open source · [GitHub](https://github.com/Tomatio13/vintage2) · [Features guide](docs/FEATURES.md) · [日本語](README_JP.md)

https://github.com/user-attachments/assets/2b817ecc-8b04-4c2c-8a8c-d40265ad0dd3

</div>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

<div align="center">

**Why VINTAGE**

## You're running 5 agents simultaneously.<br />You have no idea what any of them are doing.

</div>

You open a terminal. Then another. Three more. Each one is running a different agent on a different task. One finishes and sits waiting for input. One crashes silently. Two are still going. Which is which? You're alt-tabbing between windows, scrolling through output, trying to remember which pane you kicked off that refactor in.

**Parallel work needs a workspace where you can see the state. VINTAGE is that workspace.**

<details>
<summary><b>One day with VINTAGE, in three panels</b></summary>
<br />

<img src="assets/manga/manga-en.png" alt="A day with VINTAGE, in three panels" width="640" />

<p align="center">
<a href="assets/manga/en/page-01.png">page 1</a> · <a href="assets/manga/en/page-02.png">page 2</a> · <a href="assets/manga/en/page-03.png">page 3</a>
</p>

</details>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

## The terminal comes to you.

### <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/attention-dark.svg"><img src="assets/brand/icons/attention.svg" height="24" alt=""></picture> Attention

When a background terminal finishes, errors, or stalls, VINTAGE fires a notification. One click takes you straight back to that exact terminal. No alt-tab archaeology.

<img src="assets/readme/vintage-attention-routing.png" alt="Attention: a failed terminal notification, with one-click routing back" width="800" />

### <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/monitor-dark.svg"><img src="assets/brand/icons/monitor.svg" height="24" alt=""></picture> Monitor

Live CPU and memory, plus every AI session on the machine — the tool in use, context usage, quota remaining. "I hit the limit without noticing" stops being a thing.

<img src="assets/readme/vintage-monitor.png" alt="Monitor: CPU, memory and AI session usage" width="800" />

### <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/board-dark.svg"><img src="assets/brand/icons/board.svg" height="24" alt=""></picture> Board

Drop tasks in. Agents update cards, add subtasks, and close tickets alongside you. Everything is stored locally.

<img src="assets/readme/vintage-board.png" alt="Board: a Kanban board shared with your agents" width="800" />

## All you need to run in parallel.

| #   | Feature                                                                                                                                                                                        | What it does                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/space-dark.svg"><img src="assets/brand/icons/space.svg" height="20" alt=""></picture> **Space splitting**     | Split your workspace horizontally or vertically and run agents pane by pane. Each pane is independent, so a heavy build never blocks the rest of your work.                    |
| 02  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/sessions-dark.svg"><img src="assets/brand/icons/sessions.svg" height="20" alt=""></picture> **Sessions**      | Browse, search, pin, read, and resume past Claude Code / Codex / OpenCode (opencode2) / Grok / Antigravity conversations. "Which session was that in?" stops being a question. |
| 03  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/palette-dark.svg"><img src="assets/brand/icons/palette.svg" height="20" alt=""></picture> **Command palette** | `Ctrl+Shift+P` jumps to any workspace, Space, terminal, or action. Your hands never leave the keyboard.                                                                        |
| 04  | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/theme-dark.svg"><img src="assets/brand/icons/theme.svg" height="20" alt=""></picture> **Themes**              | Vintage · Graphite · Ocean · Grove · Iris · Ember — independent light/dark palettes, full JSON import/export.                                                                  |

<details>
<summary><b>Sidebar and status display details</b></summary>

### Status at a glance

| State                                  | Display               |
| :------------------------------------- | :-------------------- |
| Normal terminal                        | `>_`                  |
| Agent thinking or running              | Rotating spinner      |
| Input needed                           | Message icon          |
| Waiting                                | Clock icon            |
| Completed                              | Check icon            |
| Warning or failure                     | Warning or error icon |
| Agent detected, idle or status unknown | Robot icon            |

- Drag the right edge of the left sidebar to resize it. The width is saved across restarts.
- Status icons appear in Space tabs and sidebar rows. Hover over an icon for its status label. Spinners remain still when reduced motion is enabled.
- Sidebar Space rows also show colored agent badges (such as CD for Codex and OC for OpenCode), matching Monitor Sessions. Badge outlines pulse while working, stay emphasized while waiting for input, and fade on completion.
- Monitor excludes OpenCode background servers (`serve`, including `opencode2.exe serve --service`) and their launchers; interactive OpenCode sessions remain visible.
- Gary crawls over little stairs and stops for an apple above the sidebar footer, with new positions and timing on each round trip. Toggle Gary in **Settings → Appearance → Sidebar Gary**. Reduced motion keeps the scene still.

</details>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

## Start running in parallel, today.

Installers are on GitHub Releases. Free and open source.

[![Download for Linux](https://img.shields.io/badge/Download%20for%20Linux-E8641C?style=for-the-badge&labelColor=1C1E20&logo=linux&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for macOS](https://img.shields.io/badge/Download%20for%20macOS-E8641C?style=for-the-badge&labelColor=1C1E20&logo=apple&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Download%20for%20Windows-E8641C?style=for-the-badge&labelColor=1C1E20&logo=windows&logoColor=white)](https://github.com/Tomatio13/vintage2/releases/latest)

Building from source? See the quick start below.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>
</div>

## <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/icons/rocket-dark.svg"><img src="assets/brand/icons/rocket.svg" height="24" alt=""></picture> Quick start (from source)

```bash
pnpm install
pnpm dev
```

Done. VINTAGE opens with `Space 1` and `Terminal 1` in your home directory.

**`Ctrl+Shift+P`** — command palette. One input for workspaces, Spaces, terminals, and actions.

```bash
# Production build
pnpm build && pnpm start

# Package for distribution
pnpm run dist:linux   # → AppImage, .deb
pnpm run dist:mac     # → .dmg, .zip
pnpm run dist:win     # → NSIS installer
```

## Requirements

- **Node.js** 24+
- **pnpm** 10.33.2+
- **C/C++ build tools** — compiler + `make` + Python (for `node-pty` on Linux)

## Docs

- [Features and screen guide](docs/FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Board, storage and Skill distribution](docs/KANBAN.md)
- [日本語 README](README_JP.md) · [日本語: 機能と画面のガイド](docs/FEATURES_JP.md)

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/vintage-divider-dark.svg">
  <img src="assets/brand/vintage-divider-light.svg" alt="" width="160">
</picture>

**Apache 2.0** — [LICENSE](LICENSE) · [NOTICE.md](NOTICE.md)

<br />

_The right terminal calls you back._

</div>
