# VINTAGE

English | [日本語](README_JP.md)

**The right terminal calls you back.**

VINTAGE keeps projects, Spaces, and terminals together, then brings you back when a background terminal needs attention. The command palette gives you one place to find workspaces, Spaces, terminals, and actions.

[Features and screen guide](docs/FEATURES.md) · [Architecture](docs/ARCHITECTURE.md)

## Key features

- **Workspaces, Spaces, and terminals**: Organize projects, create multiple Spaces, and split terminals side by side or vertically.
- **Command palette**: Press `Ctrl+Shift+P` to search actions and jump to a workspace, Space, or terminal.
- **Attention monitoring**: See command completions, errors, and input requests from background terminals in one list.
- **Agent status at a glance**: Color-coded dots in Space tabs and the sidebar surface agent activity, waits, and failures.
- **Files and Git Review**: Preview common files and inspect unstaged Git changes, including untracked files.
- **AI usage limits**: See remaining quota, reset times, and credits for AI CLIs such as Codex and Claude Code in the right pane. Requires the optional [CodexBar CLI](https://github.com/steipete/codexbar).
- **Flexible shells**: Choose zsh, bash, fish, or the operating system’s default shell. On Windows, Command Prompt, Windows PowerShell, PowerShell 7, and Git Bash are supported.
- **Automatic text copy**: Select terminal output with the mouse to copy it to the clipboard.
- **Fast terminal rendering**: Output draws through WebGL with automatic fallback, links in terminal output open in the browser, and Sixel/iTerm2 inline images are supported.
- **Resilient terminal sessions**: Terminals survive a window reload or renderer crash and reconnect with their recent output restored.
- **Built-in browser**: Browse in a session separate from your terminals, with support for multiple tabs.
- **Customization**: Reassign shortcuts, choose from four themes, and adjust the interface, terminal, and shell settings.
- **Cross-platform desktop app**: Runs on Linux, Windows, and macOS.

See the [features and screen guide](docs/FEATURES.md) for the workspace layout, supported preview formats, Attention modes, Jev setup, and screenshots.

## Quick start

1. Launch VINTAGE. It opens `Space 1` and `Terminal 1` in your home directory.
2. Choose **Open folder** to add a project. New terminals use the selected workspace as their working directory.
3. Create Spaces or split the active terminal to organize your work.
4. Use the command palette or click an Attention item to return to a workspace, Space, or terminal.

## Default keyboard shortcuts

Shortcuts can be reassigned in **Settings → Shortcuts**. Press `Ctrl+S` to save settings.

| Action               | Shortcut       |
| :------------------- | :------------- |
| Open command palette | `Ctrl+Shift+P` |
| Previous Space       | `Ctrl+Shift+←` |
| Next Space           | `Ctrl+Shift+→` |
| Previous pane        | `Ctrl+Shift+↑` |
| Next pane            | `Ctrl+Shift+↓` |
| Previous workspace   | `Alt+←`        |
| Next workspace       | `Alt+→`        |
| New Space            | `Ctrl+Shift+N` |
| Split right          | `Ctrl+Shift+D` |
| Split below          | `Ctrl+Shift+T` |
| Toggle sidebar       | `Ctrl+B`       |
| Toggle side pane     | `Ctrl+Shift+S` |
| Open Files pane      | `Ctrl+Shift+E` |
| Open Review pane     | `Ctrl+Shift+G` |
| Open Usage pane      | `Ctrl+Shift+U` |
| Open Browser pane    | `Ctrl+Shift+B` |
| Find in terminal     | `Ctrl+F`       |
| Close selected pane  | `Ctrl+Shift+W` |

## Requirements

- **Node.js**: 24 or later
- **pnpm**: 10.33.2 or later
- **C/C++ build tools**: A native compiler toolchain is required to build `node-pty` (for example, a C/C++ compiler, `make`, and Python on Linux).

## Setup

```bash
pnpm install
pnpm dev
```

To build and run the production app locally:

```bash
pnpm build
pnpm start
```

## Optional Jev analysis

VINTAGE can optionally use [Jev](https://docs.typesafe.ai/sdk/javascript) to classify terminal output when local rules are not enough. The integration is configured in **Settings → Integrations**. See the [features and screen guide](docs/FEATURES.md#jev-semantic-analysis) for supported states, privacy details, and API key setup.

## Optional CodexBar usage panel

VINTAGE can show AI provider usage limits — remaining quota per window, reset times, credits, and recent cost — in a right-pane **Usage** tab for CLIs such as Codex, Claude Code, OpenCode Go, and Grok. This optional feature requires the [CodexBar CLI](https://github.com/steipete/codexbar) to be installed and configured so that the `codexbar` command runs in a terminal.

Enable it in **Settings → Usage**: turn the panel on, optionally point VINTAGE at the `codexbar` binary (it is auto-detected on `PATH` and in common install locations when the path is empty), and choose a refresh interval. Which providers appear follows the enabled flags in `~/.config/codexbar/config.json`; to add Claude Code, run `codexbar config enable --provider claude`. See the [features and screen guide](docs/FEATURES.md#usage-limits-codexbar) for details.

## Documentation

- [Features and screen guide](docs/FEATURES.md) — detailed UI and behavior, with screenshots
- [Architecture](docs/ARCHITECTURE.md) — process boundaries and design
- [日本語: 機能と画面のガイド](docs/FEATURES_JP.md)
- [日本語 README](README_JP.md)

## Verification and packaging

```bash
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs boundary checks, type checking, lint, formatting checks, unit tests, and a production build. `pnpm test:e2e` launches Electron for an end-to-end smoke test.

To build distribution packages on the target operating system:

| Target OS   | Command               | Output formats |
| :---------- | :-------------------- | :------------- |
| **Linux**   | `pnpm run dist:linux` | AppImage, deb  |
| **macOS**   | `pnpm run dist:mac`   | dmg, zip       |
| **Windows** | `pnpm run dist:win`   | NSIS installer |

Build artifacts are written to `release/`. Code signing, including macOS notarization, is not configured.

## Security and limitations

VINTAGE isolates the Renderer from Node.js and limits operating-system access to typed IPC exposed by the Preload process. Projects are added through the folder picker, and file previews are read-only. Shell event detection can be less accurate when shell integration is unavailable, such as in some remote SSH environments. The built-in browser does not support downloads, extensions, or saved login credentials.

For more detail, see [Architecture](docs/ARCHITECTURE.md) and the [features and screen guide](docs/FEATURES.md).

## License

This project is available under the **Apache License 2.0**. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for details.

## Markdown editing and notes

Markdown files opened from Files support Preview and Edit. Save explicitly with Save or `Ctrl+S` (`⌘S` on macOS). Saving rejects files changed externally; Reload reads the current file and asks before discarding a dirty draft. Files over 1 MB cannot be edited. Automatic preview refresh runs only for clean previews, never while editing or with unsaved changes.

Open the workspace Scratchpad from the Notes tab, Open Notes pane in the command palette, or `Ctrl+Shift+M` (`⌘Shift+M` on macOS), configurable in Settings. Notes autosave as you type. Save as .md exports to a new Markdown file inside the workspace; existing files are not overwritten. Notes and unfinished Markdown drafts are stored as plain text in the app’s local storage and restored after closing panes or restarting the app.

Use Settings → Notes → Show Notes tab to show or hide Notes (On by default). While Off, its shortcut does not open the pane. Saved notes are retained, and the preference persists across restarts.

Notes and Board are separate tabs, ordered Files → Review → Notes → Board → Browser. Each workspace has a Kanban board with To do, Doing, and Done columns. Create cards with a title and notes, move them by drag-and-drop, click to edit, and undo a deletion immediately afterward. Scroll horizontally in narrow panes. In Notes editing mode, select text and use Create card from note to open a card form; without a selection, it uses the current line. The original memo stays intact. Cards are saved as JSON in VINTAGE’s app data directory, keyed by the canonical workspace path. Both restore after restarting. Unsubmitted card form inputs are not restored after restarting. Settings → Notes provides separate Show Notes tab and Show Board tab switches; hiding either preserves its data.

The AI icons on the board and each card copy the JSON path, task instructions, and a parameterized Python helper command to the clipboard for pasting into your CLI agent. No files or environment variables are added to the project. Visible boards check for external edits every three seconds; an open card draft is retained and outdated saves are rejected. Legacy local cards migrate on first use, with the original local data retained as a backup. See [AI integration and storage format](docs/KANBAN.md).
