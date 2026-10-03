# Features and screens

English | [日本語](FEATURES_JP.md) | [README](../README.md)

This guide describes VINTAGE’s main screens and behavior in more detail. The [README](../README.md) has a short overview and setup instructions.

Screenshots show the current Electron development build using a sample workspace, files, terminal output, notes, and cards.

## Main window

The VINTAGE window is organized into three work areas:

- **Sidebar**: Workspace navigation, Spaces, and the Attention list for terminals that need a response.
- **Center**: Space tabs and terminal panes. Split a Space horizontally or vertically to work in multiple shells at once.
- **Right pane**: Switch between Files, Review, Notes, Board, Usage, and Browser without replacing the active terminal layout.

![VINTAGE showing the Attention list, terminal panes, and Files pane](../assets/readme/vintage-background-attention.png)

_Sample workspace with an Attention notification from another Space and the Files pane._

### Return to a background terminal

Select an Attention item to open its workspace, Space, and terminal. The Review pane can stay open while you inspect the change that prompted the notification.

![Returning to the Checks terminal from an Attention notification](../assets/readme/vintage-attention-routing.png)

_The Checks terminal after selecting Open terminal in the Attention notification._

## Workspaces, Spaces, and terminals

- VINTAGE starts in your home directory with `Space 1` and `Terminal 1` ready to use.
- Add a project with **Open folder**. The selected folder becomes the working directory for new terminals in that workspace.
- Create multiple Spaces per workspace and switch between them using tabs or keyboard shortcuts. A new Space starts with `Terminal 1`.
- Split the active terminal to the right or below. Close Spaces and panes with their close controls. Double-click a Space or terminal title to rename it; press `Enter` or move focus to save, or `Escape` to cancel.
- Choose zsh, bash, fish, or the operating system’s default shell. Selecting terminal output with the mouse copies it to the clipboard.
- Press the find shortcut (`Ctrl+F` by default, `⌘F` on macOS) to search terminal scrollback; `Enter` and `Shift+Enter` move between matches. The shortcut can be reassigned in **Settings → Shortcuts → Terminal** and only triggers while a terminal has focus.
- Terminal output draws on the GPU (WebGL) when available and falls back to the DOM renderer otherwise. URLs in terminal output open in the system browser (`http`, `https`, and `mailto` only), and sixel/iTerm2 inline images render in place.
- Terminal sessions survive a window reload or renderer crash: the pane reconnects to the still-running session with its recent output restored, and the terminal header notes `reconnected`. Sessions are not restored after the app itself closes. Workspace and pane layout information is saved separately.

## Agent status at a glance

Space tabs and sidebar Workspace/Tab rows show a dot for the most urgent recognized terminal state across their panes. When a Space contains multiple panes, the dot summarizes the highest-priority state. Blue marks `Thinking`, green marks `Running` or `Completed`, yellow marks `Waiting` or `Input needed`, and red-orange marks `Warning` or `Failed`. Hollow dots indicate `Waiting` and `Warning`; pulsing dots indicate `Thinking`, `Running`, and `Input needed`. `Idle` and unclassified `Unknown` states have no dot.

## Command palette and quick switcher

Press `Ctrl+Shift+P` to open the palette. Search one input for actions, workspaces, Spaces, and terminal panes. The **All**, **Actions**, and **Locations** scopes narrow the results; use the arrow keys to move through the list (including each section's `Show N more` row, which `Enter` expands), `Tab` / `Shift+Tab` to switch scopes, `Enter` to select, and `Escape` to close.

The shortcut can be reassigned in **Settings → Shortcuts**. The palette is intended as a single entry point for navigation and app actions, so you do not need to memorize a separate shortcut for every destination.

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
| Open Notes pane      | `Ctrl+Shift+M` |
| Open Board pane      | `Ctrl+Shift+K` |
| Toggle Notes tab     | `Ctrl+Alt+M`   |
| Toggle Board tab     | `Ctrl+Alt+K`   |
| Open Files pane      | `Ctrl+Shift+E` |
| Open Review pane     | `Ctrl+Shift+G` |
| Open Usage pane      | `Ctrl+Shift+U` |
| Open Browser pane    | `Ctrl+Shift+B` |
| Find in terminal     | `Ctrl+F`       |
| Close selected pane  | `Ctrl+Shift+W` |

![Shortcut settings for Board and the Notes and Board toggles](../assets/readme/vintage-shortcuts.png)

_Open Board pane, Toggle Notes tab, and Toggle Board tab can all be reassigned in Settings → Shortcuts._

## Right pane

The right pane contains Files, Review, Notes, Board, Usage, and Browser. Show or hide Notes and Board in Settings → Notes, and enable Usage in Settings → Usage. Press `Ctrl+Shift+S` to show or hide the entire pane. Each tab is also a command palette action, and shortcuts can be reassigned in **Settings → Shortcuts**.

### Files and previews

Open **Files** to browse the selected workspace. Double-click a file to open its preview beside the terminal area.

Right-click a file or folder in Files to copy, rename, or copy its name, relative path, or full path. Paste into a folder or right-click empty space to paste into the workspace root. Copy/paste is internal to VINTAGE, supports folders and other workspaces, and rejects existing names and symbolic links.

![Files context menu with copy, rename, and path actions](../assets/readme/vintage-file-actions.png)

_The Files context menu. Paste becomes available after copying an entry within Files._

- **Markdown** supports workspace images and tables, with **Preview** and **Edit** views. Links work in the preview: relative paths open another workspace file in the viewer, `#heading` anchors scroll within the document, and HTTP(S) links open in the built-in Browser (`Ctrl+Click` / `⌘+Click` opens a new Browser tab). `mailto:` links open the system email app.
- **JSON** supports formatted preview and raw source. **CSV/TSV** supports a searchable table and source view.
- **HTML** is shown in an isolated preview that blocks scripts and external resources; source view is also available.
- **Images** have zoom controls. **PDF** uses a built-in viewer, and audio and video have playback controls.
- Common source and text files use syntax highlighting. Search, line wrapping, copy, and reload controls depend on the file type and view.
- Unsupported formats, including Office documents and ZIP archives, can be opened in the system app.

Text previews are limited to 1 MB and the first 10,000 lines. Image previews are limited to 10 MB. HTML previews and their CSS resources are limited to 5 MB. Previews other than Markdown are read-only.

Files and Review automatically refresh every three seconds after the previous load finishes while their tab is visible in the side pane. Expanded folders and the selected diff are preserved. Periodic refresh stops when the side pane is closed or another tab is selected. Manual refresh remains available.

Documents opened from Files also check for file changes every three seconds while their pane is visible and reload when changed. Markdown updates automatically only in Preview mode. Changes made while hidden are loaded when the pane is shown again. Manual Reload remains available.

#### Markdown editing

Markdown files opened from Files support Preview and Edit. Save explicitly with Save or `Ctrl+S` (`⌘S` on macOS). Saving rejects files changed externally; Reload reads the current file and asks before discarding a dirty draft. Files over 1 MB cannot be edited. Automatic preview refresh runs only for clean previews, never while editing or with unsaved changes.

![Editing a Markdown file with unsaved changes](../assets/readme/vintage-markdown-editing.png)

_Markdown in Edit view, showing unsaved changes and the Save and Reload controls._

### Git Review

**Review** lists unstaged changes and untracked files in the selected workspace. Select a file to inspect a diff with added and removed lines highlighted. Review is read-only; it does not stage or unstage changes. Git status refreshes automatically while visible; the refresh control also reloads it manually.

![A TypeScript Git diff expanded in VINTAGE’s Review tab](../assets/readme/vintage-git-review.png)

_Sample repository diff. File names have language-specific icons, and added and removed lines are highlighted._

### Notes (scratchpad)

Open the workspace Scratchpad from the Notes tab, Open Notes pane in the command palette, or `Ctrl+Shift+M`, configurable in Settings. Notes autosave as you type. Save as .md exports to a new Markdown file inside the workspace; existing files are not overwritten. Notes and unfinished Markdown drafts are stored as plain text in the app’s local storage and restored after closing panes or restarting the app.

Use Settings → Notes → Show Notes tab or `Ctrl+Alt+M` to turn Notes on or off (On by default). While Off, Open Notes pane does not open it. Turning off an active Notes tab returns to Files. Saved notes are retained, and the preference persists across restarts. Reassign the shortcut in Settings → Shortcuts.

![Workspace notes in the Scratchpad editor](../assets/readme/vintage-notes.png)

_Workspace Scratchpad with autosave, card creation, and Markdown export controls._

### Board (Kanban)

Open the workspace Kanban board from the Board tab, Open Board pane in the command palette, or `Ctrl+Shift+K`. It has To do, Doing, and Done columns. Create cards with a title and notes, move them by drag-and-drop, click to edit, and undo a deletion immediately afterward. Scroll horizontally in narrow panes.

In Notes editing mode, select text and use Create card from note to open a card form; without a selection, it uses the current line. The original memo stays intact.

Cards are saved as JSON in VINTAGE’s app data directory, keyed by the canonical workspace path. Notes and cards restore after restarting. Unsubmitted card form inputs are not restored after restarting.

Use Settings → Notes → Show Board tab or `Ctrl+Alt+K` to turn Board on or off (On by default). While Off, Open Board pane does not open it. Turning off an active Board tab returns to Files. Cards are retained, and the preference persists across restarts. Reassign the shortcut in Settings → Shortcuts.

The AI icons on the board and each card copy the JSON path, task instructions, and a parameterized Python helper command to the clipboard for pasting into your CLI agent. No files or environment variables are added to the project. Visible boards check for external edits every three seconds; an open card draft is retained and outdated saves are rejected. Legacy local cards migrate on first use, with the original local data retained as a backup. See [AI integration and storage format](KANBAN.md).

![Kanban Board with To do, Doing, Done, and AI instruction controls](../assets/readme/vintage-board.png)

_To do, Doing, and Done columns, with AI instruction copy controls for the board and individual cards._

### Browser

The built-in Browser uses a session separate from terminal sessions and supports multiple tabs. It allows `http:`, `https:`, and `about:blank` URLs. Downloads, extensions, and saved login credentials are not supported.

### Usage limits (CodexBar)

The **Usage** tab shows each AI provider's quota at a glance: usage windows with a remaining percentage, the reset time in local `YYYY/MM/DD HH:MM` format, plan and account, credits, and recent cost when a provider reports them. Bars stay neutral and only take the warning or danger color once the remaining quota drops to 40% or 10%. Hovering a reset time shows the countdown.

The tab is hidden until it is enabled in **Settings → Usage**. It requires the [CodexBar CLI](https://github.com/steipete/codexbar):

1. Install the CodexBar CLI and complete its provider setup so that the `codexbar` command runs in a terminal.
2. In **Settings → Usage**, turn the panel on. Leave **codexbar path** empty to auto-detect the binary on `PATH` and in common install locations, or pick it with **Browse…**. The detected binary and version are shown under the field.
3. Which providers appear follows the enabled flags in `~/.config/codexbar/config.json` — VINTAGE displays whatever `codexbar dashboard` reports. To add Claude Code, run `codexbar config enable --provider claude`.

While the tab is visible, VINTAGE re-runs `codexbar dashboard` at the configured interval (60–600 seconds, adjusted in 10-second steps in Settings). A refresh control is always available. A provider that fails to report shows its error in place of its usage, and windows that CodexBar marks as idle (model families without usage) are hidden. Quota data comes from the local CodexBar installation; VINTAGE does not talk to provider APIs itself.

## Attention monitoring

Choose a monitoring mode from the menu at the top of each terminal. Attention items appear in the sidebar and history; depending on the mode and notification settings, VINTAGE can also send desktop notifications. Click an item or notification to return to its terminal.

| Mode            | Behavior                                                                                                                                                                                                                                                                                                                                                                               |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Monitor`       | Typically evaluates after output settles and when a command exits; it is not a continuous polling mode.                                                                                                                                                                                                                                                                                |
| `Mute`          | Monitors like `Monitor` and shows Attention items, but suppresses desktop notifications.                                                                                                                                                                                                                                                                                               |
| `Always Notify` | Sends desktop notifications regardless of severity thresholds or app activity. App-level notifications must still be enabled.                                                                                                                                                                                                                                                          |
| `Agent Monitor` | With Jev configured, evaluates active agent work (10-second base interval by default; configurable from 5 to 300 seconds). If output stays unchanged, the interval doubles up to six times the configured value and resets when output resumes. Shows `Thinking` while output streams and detects completed turns and input requests. The `Thinking` indicator also works without Jev. |
| `Errors Only`   | Does not call Jev. Detects non-zero command exits and clear error output; ordinary completion and warnings do not trigger Attention.                                                                                                                                                                                                                                                   |
| `Ignore`        | Stops monitoring and Attention notifications for this terminal.                                                                                                                                                                                                                                                                                                                        |

In `Monitor`, `Mute`, and `Always Notify`, output is evaluated after it settles (default debounce: 800 ms) and when a command exits. While output continues, Jev reevaluations are rate-limited to at least five seconds apart. Thresholds for Attention items and desktop notifications can be adjusted in **Settings → Attention**.

## Jev semantic analysis

Jev is an optional integration with the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript). It classifies recent terminal output when local rules cannot confidently determine what a command is doing. VINTAGE can report:

- `Completed`, `Failed`, `Waiting input`, and `Waiting external`
- `Warning`, `Thinking / Busy`, and `Running / Unknown`

Jev also estimates severity from 0–4 and whether action is needed. If the result is ambiguous, VINTAGE prefers a reliable local result. If the service is unavailable, terminal interaction remains unblocked and local classification is used.

### Data and privacy

Jev requests include a command name with values that appear secret masked, the workspace name, exit code, elapsed time, and the last 40 lines of terminal output (up to 4,000 characters). Full paths, environment variables, and the full terminal scrollback are not sent. Requests are limited to 2 per second and 30 per minute across the app, with a 10-second timeout.

### Configure Jev

1. Open **Settings → Integrations**.
2. Enter and save a Jev API key.

The key is encrypted using the operating system’s secure credential store, such as Keychain or Secret Service, and is not passed to the Renderer process. If secure storage is unavailable, set `TYPESAFE_API_KEY`; a saved key takes precedence. Changes take effect in running terminals without restarting the app.

For classification logs, fully quit VINTAGE and run `VINTAGE_JEV_DEBUG=1 pnpm dev`. Logs show whether the integration is enabled, classification reasons, and skipped evaluations; they do not include the request body or API key.

## Settings and saved data

Settings cover appearance and UI size, terminal font and scrollback, shell, browser, Attention, shortcuts, Jev integration, the usage panel (CodexBar), and updates. Four themes are available: System, Light, Dark, and Graphite.

On Linux, VINTAGE applies AppImage updates directly. For `.deb` installs, installing a downloaded update asks for system authorization once (`pkexec`) and applies it, then VINTAGE offers to restart; if authorization is unavailable or fails, it opens the downloaded package with the system package installer — complete the installation there and restart VINTAGE. If no package installer is available, Settings shows a `sudo apt install` command for the downloaded package.

Attention thresholds, monitoring intervals, and per-terminal modes are stored in `attention-settings.json` in the operating system’s user data directory. A terminal’s monitoring mode is matched using a hash derived from its workspace path, Space title, and terminal title; project paths and logs are not stored there as plain text. Other interface preferences are stored separately.

Workspace and Space details, pane layouts, and open file paths are stored separately in `workspace-state.json`. It contains project paths and relative file paths needed for restoration. If a project folder is missing, its Space information is retained so you can locate the folder again or remove the project. Terminal processes and output are not saved.
