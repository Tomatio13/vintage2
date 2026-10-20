# VINTAGE

English | [日本語](README_JP.md)

**The right terminal calls you back.**

VINTAGE keeps projects, Spaces, and terminals together, then brings you back when a background terminal needs attention. The command palette gives you one place to find workspaces, Spaces, terminals, and actions.

[Features and screen guide](docs/FEATURES.md) · [Architecture](docs/ARCHITECTURE.md)

## Key features

- **Project navigation**: Click a sidebar folder to expand or collapse its Spaces. Hover over a project and open the ⋯ menu to choose Remove. Running agent dots use the Codex AI Usage accent.
- **Workspaces, Spaces, and terminals**: Organize projects, create multiple Spaces, and split terminals side by side or vertically.
- **Command palette**: Press `Ctrl+Shift+P` to search actions and jump to a workspace, Space, or terminal.
- **Attention monitoring**: See command completions, errors, and input requests from background terminals in one list.
- **Agent status at a glance**: Color-coded dots in Space tabs and the sidebar surface agent activity, waits, and failures. Agent CLI processes also appear as running when shell integration is unavailable, including in Errors Only mode.
- **Files and Git Review**: Browse, copy, and rename files, edit Markdown with syntax highlighting, line numbers and line navigation, zoom documents, search and replace text, and inspect Git changes. Files renders only visible tree rows and limits concurrent folder reads. Source previews scroll continuously while rendering up to 600 lines at once; search covers the full loaded text and keeps your position when closed. Review pages large file lists and diffs, with a file-preview fallback for oversized diffs. A separate lower panel shows a read-only graph of the latest 80 repository commits, including branches, merges, and tags.
- **Notes and Board**: Keep workspace notes and organize tasks with compact Kanban cards, labels, priorities, due dates, and subtask checklists with progress. Expand Board to keep the list beside a detail drawer; search, filter, sort, or reorder by drag and keyboard. Distribute the [vintage-board Agent Skill](skills/vintage-board/SKILL.md) to let agents update cards, Notes, and subtasks through the bundled Python helper.
- **Agent Monitor**: Built-in local Claude Code / Codex / Antigravity / OpenCode / ZCode / Grok session activity, current tools, context usage in the Monitor tab. No abtop installation or external collector is required. Space status dots also reflect these sessions, even while the Monitor tab is closed. Session wait notifications reuse Attention toasts and desktop notifications when a running session changes to Waiting, including sessions without a terminal. Click Open Space to focus the session’s terminal; sessions without a terminal open in Monitor. Waiting can mean a finished response or an input request; disable this feature with Session wait notifications in notification settings.
- **Session history**: Browse and resume saved Codex, Claude Code, Grok and Antigravity conversations in a separate Sessions panel. Search by title/request preview, filter projects and agents, pin conversations, and read a chat view without replacing existing terminals. See the [Sessions guide](docs/FEATURES.md#sessions).
- **AI usage limits**: See remaining quota, reset times, and credits for AI CLIs such as Codex and Claude Code inside Monitor. Requires the optional [CodexBar CLI](https://github.com/steipete/codexbar).
- **Flexible shells**: Choose zsh, bash, fish, or the operating system’s default shell. On Windows, Command Prompt, Windows PowerShell, PowerShell 7, and Git Bash are supported.
- **Automatic text copy**: Select terminal output with the mouse to copy it to the clipboard.
- **Fast terminal rendering**: Output draws through WebGL with automatic fallback, links in terminal output open in the browser, and Sixel/iTerm2 inline images are supported.
- **Resilient terminal sessions**: Terminals survive a window reload or renderer crash and reconnect with their recent output restored. Press Ctrl+W within a terminal pane to close it.
- **Files actions**: Right-click to create files or folders, copy, rename, or move entries to the Trash with confirmation. Folder expansion is remembered per Project across switches and app restarts. See the [Files guide](docs/FEATURES.md#files-and-previews).
- **Built-in browser**: Filter and page bookmarks, and use More actions → Suspend background tabs to release their pages (they reload when reopened; unsaved page input is cleared). Open HTTP/HTTPS and local `file:///` pages with project tabs and Common tabs, restart restoration, links that request a new window opening in a new app tab, scoped bookmarks, page search, and per-tab zoom (Ctrl + wheel / + / − / 0), Ctrl+L address selection, Ctrl+W / Ctrl+Shift+T to close and reopen tabs, Ctrl+Tab switching, and middle-click to open links in background tabs or close tabs. Browser tabs extend horizontally with the panel header scrolling when needed. Right-click pages to copy selected text, edit inputs, open or copy links, copy images, navigate, and inspect elements. Toolbar shortcuts open bookmarks or the default browser; the actions menu includes responsive preview, an element picker, and developer tools. See the [Browser guide](docs/FEATURES.md#browser) for scope behavior, controls, and limits.
- **Flexible right pane**: Drag the divider to widen the right pane up to the available window width, while keeping room for terminals. The preferred width is saved and adapts when the window shrinks.
- **Customization**: Reassign shortcuts, choose independent light/dark palettes, create custom themes, import/export VINTAGE theme JSON, and adjust the interface, terminal, and shell settings.
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

## Sessions

The Sessions tab can be toggled with **Ctrl+Alt+Y** (**⌘+Option+Y** on macOS); rebind **Toggle Sessions tab** in **Settings → Shortcuts → Side pane**.

The **Sessions** tab browses saved Codex, Claude Code, Grok and Antigravity conversations separately from live Monitor activity. Search titles and requests, filter by project or agent, pin sessions, and expand the conversation view. **Resume in new Space** opens a new terminal in an already open project on Linux, macOS and Windows; existing terminals are preserved. Windows native executables and npm `.cmd` / `.bat` launchers are supported. CLI discovery checks PATH and common user, npm and Homebrew locations, with Windows path comparisons ignoring case and separator differences. The matching CLI must be installed on the target OS. Windows/macOS Sessions support is experimental; physical-device testing is pending. History is read locally from `CODEX_HOME` / `CLAUDE_CONFIG_DIR` (or their default locations), with up to 500 recently updated log files; large conversations show labeled excerpts. Grok history comes from `~/.grok/sessions`; Antigravity history comes from `~/.gemini/{antigravity-cli,antigravity,antigravity-ide}`. Grok resumes with `grok --resume`, and Antigravity CLI resumes with `agy --conversation`; Antigravity IDE history supports browsing only. Missing transcript files leave the session metadata available. Other agents are not yet included.

Session analysis is manual: choose **Codex** or **Claude Code**, an optional absolute executable path, and an optional model under **Settings → Sessions → Session analysis**, then save. **Check CLI connection** checks the installed version and login without an LLM request. Select a session and press **Analyze session** to extract its situation, response owner, and next action from recent conversation/tool excerpts. The selected CLI can analyze any supported history agent. Analysis sends these excerpts to that CLI's provider and consumes its plan allowance or API credits. Results are stored separately under VINTAGE's user-data directory; original logs and titles are untouched. Unchanged input/settings can reuse saved results; the **Reanalyze** button explicitly forces another request. Changed conversations are labeled **Outdated**, and failed analysis preserves the previous result. Successful analysis counts and token usage (when returned by the CLI) are displayed; monetary cost is not estimated. Recent CLI versions supporting Codex's `--ignore-user-config` / `--ephemeral` or Claude's `--safe-mode` / `--no-session-persistence` are required. Analysis runs in a temporary directory with custom CLI configuration disabled; saved login is retained, but custom providers/hooks/MCP configuration are not used. Explicitly select an analysis model if needed. Analysis is an inference from excerpts, not live verification of task completion or external CI/PR status. Analysis supports native Windows CLIs and standard npm `.cmd` / `.bat` installations for Codex and Claude Code; npm launchers are resolved to their Node entrypoints so JSON arguments and paths containing spaces or Japanese characters are passed without shell interpretation. Node.js must be installed for npm CLIs; arbitrary custom batch wrappers are not supported. macOS discovery covers Apple Silicon/Intel Homebrew, user installs and nvm, and passes the discovered PATH to the CLI. Windows process trees and macOS process groups are stopped on timeout or app exit. Windows/macOS analysis support is experimental; physical-device testing is pending.

## Monitor and AI Usage

**Platform status: Linux is supported. Windows Monitor is an experimental pre-release; physical-device testing is pending. A macOS implementation exists but has not been verified.**

Windows uses a bundled Rust helper for process discovery and CPU/RAM metrics. Claude Code, Codex and OpenCode are the initial targets; other agents remain unverified on Windows. Missing process information or ambiguous session ownership stays Unknown. Codex log association is inferred, and terminal detection is unavailable, so terminal-only logs may remain unmatched. Windows load average is unavailable. AI Usage depends separately on CodexBar availability. Building or developing on Windows requires the Rust toolchain (`cargo`); users of the installer do not need Rust or abtop.

The **Monitor** tab shows activity across the PC: CPU and per-core load, memory, and running Claude Code / Codex / Antigravity / OpenCode / ZCode / Grok sessions. Select a session to inspect its current tool, model, context and process-tree CPU/RAM; **Open terminal** returns to an existing VINTAGE terminal. **Expand monitor** opens a window-wide view. Monitor is enabled by default and can be hidden in **Settings → Panels**.

Local session activity refreshes approximately every two seconds while VINTAGE is running, including when Monitor is closed or its window is hidden. Exited processes disappear on the next refresh. ZCode sessions with no recorded activity for one hour are also hidden even if their worker remains running. When multiple ZCode workers share a directory, a single session updated within the last hour is shown once; multiple recent sessions remain ambiguous. AI Usage cards in Monitor always use two columns. Provider-colored name markers and quota bars help distinguish services; low quota keeps warning and critical colors. Shared ZCode workers are grouped for CPU/RAM accounting. ZCode status overrides and session selection use message/tool metadata freshness regardless of worker count, and ZCode/OpenCode tool tracking includes parallel tools in the latest message. Codex app-server, MCP server and remote-control services, along with agent probes launched by CodexBar, are hidden; local agents with ambiguous or unreadable session data remain visible as Unknown. Session associations and activity are inferred from local process and log information; ambiguous or unreadable data appears as **Unknown**, and unavailable values show **—**. Local monitoring requires no abtop installation or external collector.

Optional **AI Usage** appears directly below CPU/Memory, with compact, equally sized provider cards for quota, reset times, credits and costs. When CodexBar reports `limitResetCredits`, its available balance and next expiry replace the regular Credits display, and Today/30 days costs are hidden. Enable **Settings → Usage → Show Usage in Monitor** and configure the [CodexBar CLI](https://github.com/steipete/codexbar). Existing Usage settings are retained; there is no separate Usage tab. Usage refreshes at its own configured interval while Monitor is visible. See the [features guide](docs/FEATURES.md#monitor) for data sources and limits, and the [usage limits guide](docs/FEATURES.md#usage-limits-codexbar) for CodexBar setup.

Show or hide Files, Review, Notes, Board, Monitor, Sessions, and Browser in **Settings → Panels**. Changes save automatically; tab visibility also has configurable shortcuts. Panel tabs, sidebar controls, settings navigation, and shared action buttons have brief icon animations on hover and keyboard focus. Notes, Board, and Sessions icons also animate on selection. Animations respect the OS reduced-motion setting and leave busy indicators and disclosure arrows unchanged.

In **Settings → Appearance**, choose **System / Light / Dark** under **Color scheme**, then select separate light and dark palettes from six themes: Vintage, Graphite, Ocean, Grove, Iris, and Ember. Round previews show each palette; sun/moon badges identify light/dark and a ring marks the selected palette. Hover the palette, upload, or copy icon for **Create theme**, **Import theme**, or **Duplicate**. Custom themes support background and accent editing and VINTAGE JSON import/export. See the [theme guide](docs/FEATURES.md#appearance-and-custom-themes).

**Settings → Appearance → UI font size** supports 12–32 px. Terminal font size is configured separately.

Try the optional **Character ripple** in **Settings → Appearance**: clicks reveal a fading wave of characters, with adjustable intensity and a custom color picker (or automatic theme color). It is off by default, respects reduced motion, and does not run inside embedded browser pages.

## Board and AI agents

Open **Board** with `Ctrl+Shift+K`. Cards show labels, priority, due date, and subtask progress. Opening a card expands Board with the list beside a detail drawer while terminal sessions stay mounted. Add, edit, check, or delete subtasks below Description / Notes, then **Save changes**. Completing the checklist leaves the parent card status unchanged.

The AI icon copies five lines containing the workspace, Board JSON and Agent Skill paths, task scope, and work instructions. Paste them into your agent; it reads the Skill for Python commands. The board-wide icon covers all To do cards, including hidden cards; a card's icon targets that saved card. Python 3 is required.

Distribute the entire [`skills/vintage-board`](skills/vintage-board/SKILL.md) folder to the agent's skill directory. Copying AI instructions also exports the Skill under VINTAGE app data. Its Python helper supports card status, Notes, and subtask addition, title editing, completion/reopening, and deletion. Board data stays local to the machine. See the [Board guide](docs/FEATURES.md#board-kanban) and [storage, CLI, and Skill distribution guide](docs/KANBAN.md).

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

VINTAGE isolates the Renderer from Node.js and limits operating-system access to typed IPC exposed by the Preload process. Projects are added through the folder picker. File operations stay within registered workspaces, Markdown edits save explicitly; text replacement in source views saves immediately and rejects external changes. Shell event detection can be less accurate when shell integration is unavailable, such as in some remote SSH environments. The built-in browser does not support downloads, extensions, or saved login credentials.

For more detail, see [Architecture](docs/ARCHITECTURE.md) and the [features and screen guide](docs/FEATURES.md).

## License

This project is available under the **Apache License 2.0**. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for details.
