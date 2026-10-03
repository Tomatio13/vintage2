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
- **Files and Git Review**: Browse, copy, and rename files, edit Markdown, and inspect unstaged Git changes.
- **Notes and Board**: Keep workspace notes and organize tasks on a Kanban board.
- **AI usage limits**: See remaining quota, reset times, and credits for AI CLIs such as Codex and Claude Code in the right pane. Requires the optional [CodexBar CLI](https://github.com/steipete/codexbar).
- **Flexible shells**: Choose zsh, bash, fish, or the operating system’s default shell. On Windows, Command Prompt, Windows PowerShell, PowerShell 7, and Git Bash are supported.
- **Automatic text copy**: Select terminal output with the mouse to copy it to the clipboard.
- **Fast terminal rendering**: Output draws through WebGL with automatic fallback, links in terminal output open in the browser, and Sixel/iTerm2 inline images are supported.
- **Resilient terminal sessions**: Terminals survive a window reload or renderer crash and reconnect with their recent output restored.
- **Built-in browser**: Open HTTP/HTTPS and local `file:///` pages with project tabs and Common tabs, restart restoration, scoped bookmarks, page search, and per-tab zoom. Toolbar shortcuts open bookmarks or the default browser; the actions menu includes responsive preview, an element picker, and developer tools. See the [Browser guide](docs/FEATURES.md#browser) for scope behavior, controls, and limits.
- **Flexible right pane**: Drag the divider to widen the right pane up to the available window width, while keeping room for terminals. The preferred width is saved and adapts when the window shrinks.
- **Customization**: Reassign shortcuts, choose from four themes, and adjust the interface, terminal, and shell settings.
- **Cross-platform desktop app**: Runs on Linux, Windows, and macOS.

See the [features and screen guide](docs/FEATURES.md) for the workspace layout, supported preview formats, Attention modes, Jev setup, and screenshots.

## Quick start

1. Launch VINTAGE. It opens `Space 1` and `Terminal 1` in your home directory.
2. Choose **Open folder** to add a project. New terminals use the selected workspace as their working directory.
3. Create Spaces or split the active terminal to organize your work.
4. Use the command palette or click an Attention item to return to a workspace, Space, or terminal.

[Default shortcuts and customization](docs/FEATURES.md#default-keyboard-shortcuts)

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

Show AI CLI quotas and reset times in the Usage tab with the optional [CodexBar CLI](https://github.com/steipete/codexbar). See the [usage limits guide](docs/FEATURES.md#usage-limits-codexbar) for installation and configuration.

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

VINTAGE isolates the Renderer from Node.js and limits operating-system access to typed IPC exposed by the Preload process. Projects are added through the folder picker. File operations stay within registered workspaces, and previews other than Markdown are read-only. Shell event detection can be less accurate when shell integration is unavailable, such as in some remote SSH environments. The built-in browser does not support downloads, extensions, or saved login credentials.

For more detail, see [Architecture](docs/ARCHITECTURE.md) and the [features and screen guide](docs/FEATURES.md).

## License

This project is available under the **Apache License 2.0**. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for details.
