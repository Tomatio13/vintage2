# VINTAGE Changelog

## [0.2.18] - 2026-10-06

### Added

- **Panel visibility controls:** Enable or hide Files, Review, Notes, Board, Usage, and Browser individually in Settings → Panels. Disabled tabs cannot be opened through shortcuts or the command palette. Select another enabled tab when the active tab is hidden, and show an empty state when all tabs are off. Keep Browser tabs and running pages while hidden.
- **Panel toggle shortcuts:** Add configurable Files, Review, Usage, and Browser toggles, defaulting to Ctrl+Alt+E/G/U/B. Arrange Side pane shortcuts in Files, Review, Notes, Board, Usage, and Browser order, with each open action beside its toggle.
- **Shortcut search:** Search commands, categories, and keybindings while retaining category sections, with inline editing and conflict feedback.

### Changed

- **Settings layout:** Use a vertical category menu with a persistent Workspace return button. Restyle Appearance, Terminal, Browser, Attention, Integrations, Panels, and Usage with consistent grouped rows, rounded menus, previews, and neutral accents.
- **Automatic settings saves:** Apply and save settings as they change, removing the Discard and Save changes footer. Invalid browser URLs retain the previous saved value; Attention saves are serialized. Jev API keys retain explicit save and clear actions.
- **Panel settings:** Rename Notes to Panels and move the Usage visibility switch into the shared panel list.

### Fixed

- **Development update screen:** Show the project version instead of Electron's development version, and let development builds open GitHub Releases to check for updates. Installed builds retain their existing updater behavior.
- **Settings navigation:** Keep Updates separate from Usage and retain an enabled Workspace return action in every section.

**Full Changelog:** [v0.2.17...v0.2.18](https://github.com/Tomatio13/vintage2/compare/v0.2.17...v0.2.18)

## [0.2.17] - 2026-10-06

### Added

- **Document zoom and search:** Zoom documents from 50% to 300% with a reset to 100%. Find text with Ctrl/⌘+F, highlighted matches, match counts, and previous/next navigation.
- **Find and replace:** Markdown Preview supports search only; Edit supports single and all-match replacement in the draft until Save. Text/code and HTML, JSON, and CSV/TSV source views support immediate replacement saves for complete UTF-8 files up to 1 MB, rejecting external changes and incomplete or binary files.
- **Markdown editing tools:** Line numbers follow wrapped text, scrolling, pane resizing, and zoom. Jump to a line with the toolbar, cursor-position display, or Ctrl/⌘+G. Show the current line, column, and total line count. Highlight Markdown syntax and fenced code in supported languages. These tools are also available in Scratchpad.

### Changed

- **Editor toolbar:** Arrange Preview, Edit, Zoom in, percentage, Zoom out, Find, Go to line, Save, and Reload in that order.

### Fixed

- **Consistent zoom labels:** Use the same percentage font size across Markdown and other document types instead of inheriting different header sizes.
- **Cursor position and line navigation:** Keep cursor-position feedback synchronized with search navigation and account for CRLF line endings when selecting source offsets.

**Full Changelog:** [v0.2.16...v0.2.17](https://github.com/Tomatio13/vintage2/compare/v0.2.16...v0.2.17)

## [0.2.16] - 2026-10-04

### Added

- **Create files and folders:** Use the Files context menu to create empty files or folders inside the selected folder, alongside a selected file, or at the workspace root from empty space. Existing names and unsafe paths are rejected, and the tree refreshes after creation.
- **Delete to Trash:** Delete files or folders through a confirmation dialog, including nonempty folders. Entries move to the system Trash; failures are reported without falling back to permanent deletion.

### Fixed

- **Browser links opening new tabs:** Links using `target="_blank"` and supported `window.open()` requests now open in a new VINTAGE Browser tab instead of silently doing nothing. The original page and its project or Common scope are preserved; native popup windows remain blocked.

### Changed

- **Files menu layout:** Group New file, New folder, Delete, and Rename above Copy and Paste here, followed by name and path copying actions, with separator lines between groups.

**Full Changelog:** [v0.2.15...v0.2.16](https://github.com/Tomatio13/vintage2/compare/v0.2.15...v0.2.16)

## [0.2.15] - 2026-10-04

### Added

- **Browser restoration and project scopes:** Save the latest page URLs, titles, tab order, selected view, and per-tab zoom across restarts. Restored background tabs load when selected. Common tabs appear in every workspace, while project tabs and selections are restored per workspace. Change tab ownership through the Tab scope dropdown without reloading the page. Existing tabs and bookmarks are retained as Common; cookies and login sessions remain shared.
- **Bookmarks, search, and zoom:** Save bookmarks to Common or the current project, rename or delete them, and open them in the current or a new tab. Search pages with `Ctrl+F` (`⌘F` on macOS), match counts, and previous/next navigation. Zoom each tab from 50% to 300% in 10% steps, with a one-click reset to 100%.
- **Local file pages:** Open local `file:///` URLs with CSS, images, scripts, and relative links, including start-page settings, bookmarks, and restart restoration. Remote file hosts and automatic web-to-file navigation are rejected; sandboxing, isolation, and disabled Node.js integration remain in place.

### Changed

- **Browser controls:** Place the bookmark star, Bookmarks, and Open in default browser beside the address bar. Move Responsive preview and Pick element and copy selector into the actions menu above Developer tools. Tab and bookmark scopes use the same dropdown style as Review.
- **Wider right pane:** Drag the divider beyond the former fixed width limit when the window has room, including when maximized. Preserve the preferred width and running terminal sessions while adapting the displayed width to smaller windows.

### Documentation

- Expand the English and Japanese feature guides with Browser controls, project and Common scopes, restoration behavior, local file support, and limitations. Keep README summaries concise and link to the detailed guides.

**Full Changelog:** [v0.2.14...v0.2.15](https://github.com/Tomatio13/vintage2/compare/v0.2.14...v0.2.15)

## [0.2.14] - 2026-10-03

### Added

- **Files context menu:** Copy and paste files or folders between registered workspaces, rename entries, and copy names, relative paths, or full paths to the system clipboard. File copy/paste is internal to VINTAGE; existing names, symbolic links, and recursive copies into the source folder are rejected.
- **Board and visibility shortcuts:** Open Board with `Ctrl+Shift+K`, toggle Notes with `Ctrl+Alt+M`, and toggle Board with `Ctrl+Alt+K`. All bindings can be reassigned in Settings → Shortcuts, with matching command palette actions. Turning off the active Notes or Board tab returns to Files while preserving saved data.

### Documentation

- Keep README focused on the overview and setup, and move detailed feature descriptions and the shortcut reference into the English and Japanese feature guides.
- Refresh the three existing screenshots and add five captures covering Files actions, Markdown editing, Notes, Board, and shortcut settings. Include a repeatable Electron capture script with an isolated profile and sample workspace.
- Rewrite the architecture guide in Japanese to document current process boundaries, PTY reconnection, file operations, persistence, external integrations, and update behavior.

**Full Changelog:** [v0.2.13...v0.2.14](https://github.com/Tomatio13/vintage2/compare/v0.2.13...v0.2.14)

## [0.2.13] - 2026-10-03

### Added

- Board and per-card AI buttons copy the JSON path, task instructions, and commands to read cards and update their status or append notes through an automatically prepared Python helper. Legacy boards migrate to app-data JSON; visible boards reflect external edits and reject stale saves while preserving card drafts.

- Separate Notes and Board tabs ordered Files → Review → Notes → Board → Browser, with independent visibility settings. Workspace Kanban includes title-and-note cards, To do/Doing/Done columns, drag-and-drop moves, undoable deletion, and card creation from selected memo text. Cards persist as app-data JSON across restarts.

- Optional Notes tab visibility in Settings, retained across restarts without deleting notes.

- Markdown editing with explicit save, recoverable local drafts, and conflict detection for external file changes.
- Workspace Scratchpad with autosave, Markdown preview, export to a new workspace `.md` file, and a configurable Notes shortcut (`Ctrl+Shift+M`).

**Full Changelog:** [v0.2.12...v0.2.13](https://github.com/Tomatio13/vintage2/compare/v0.2.12...v0.2.13)

## [0.2.12] - 2026-09-30

### Added

- **Automatic Files and Review refresh:** Visible Files and Git Review tabs refresh three seconds after the previous load completes. Expanded folders and the selected diff remain open, and periodic refresh stops when the side pane is hidden or another tab is selected.
- **Live document previews:** Visible document panes check file metadata every three seconds and reload changed files. Markdown updates automatically only in Preview mode. Changes made while a pane is hidden are loaded when it becomes visible again, and manual reload remains available.

### Fixed

- **Linux restart privileges:** Restart VINTAGE through a detached shell instead of Electron's Linux relauncher, preserving sudo support in terminal sessions after restart. An already restricted process reports a message asking the user to reopen VINTAGE from the desktop.
- **Workspace persistence limits:** File panes can no longer create layouts deeper than the saved workspace format supports, and each workspace is limited to 256 Spaces. The UI and persistence layer share the same limits, with visible messages when a limit is reached or workspace state cannot be saved.

**Full Changelog:** [v0.2.11...v0.2.12](https://github.com/Tomatio13/vintage2/compare/v0.2.11...v0.2.12)

## [0.2.11] - 2026-09-27

### Fixed

- **Stable split terminal rendering:** Switching focus between terminal panes now keeps each visible pane's renderer in place, preventing terminal content from shifting horizontally. GPU rendering is limited to eight visible panes, and hidden tabs release their GPU contexts.
- **Usage refresh recovery:** Allow CodexBar up to 60 seconds to collect dashboard data. Automatic refresh waits for the current request to finish before starting its countdown, so slow requests can complete and recovered provider warnings clear correctly.

**Full Changelog:** [v0.2.10...v0.2.11](https://github.com/Tomatio13/vintage2/compare/v0.2.10...v0.2.11)

## [0.2.10] - 2026-09-27

### Added

- **Side pane keyboard shortcuts:** The right pane is now fully keyboard-operable. New reassignable shortcuts open Files (`Ctrl+Shift+E`), Review (`Ctrl+Shift+G`), Usage (`Ctrl+Shift+U`), and the Browser (`Ctrl+Shift+B`), and `Ctrl+Shift+S` toggles the side pane — they are listed in **Settings → Shortcuts** under **Side pane** and in the README shortcut table. The command palette gains matching actions (Open Files / Review / Usage / Browser pane, Toggle side pane) plus **Find in terminal**, which opens the search of the active terminal; the former "Toggle browser pane" action is now the broader "Toggle side pane".

**Full Changelog:** [v0.2.9...v0.2.10](https://github.com/Tomatio13/vintage2/compare/v0.2.9...v0.2.10)

## [0.2.9] - 2026-09-27

### Added

- **Markdown links:** Links in the Markdown preview now work. Relative paths open the target file in the file viewer, `#heading` anchors scroll within the document (headings now carry stable ids), and HTTP(S) links open in the built-in Browser — `Ctrl+Click` / `⌘+Click` opens a new Browser tab. `mailto:` links open the system email app, and unsupported schemes such as `javascript:` are ignored. Clicking a link never navigates the app window: the main window now blocks top-level navigation away from its own origin, and `window.open` popups are handed to the OS only for HTTP(S) and `mailto:` URLs.
- **Terminal session reconnection:** Terminals now survive a window reload or a renderer crash. The underlying shell keeps running, and the pane reconnects to it with its recent output restored — the terminal header shows `reconnected` when this happens. Panes are matched by their stable id, so renaming a tab or pane does not prevent reconnection. Reloads no longer leave orphaned shell processes running invisibly until the window closes. Sessions are still not restored after the app itself is closed.
- **Clickable terminal links:** URLs in terminal output are now clickable and open in the system browser. Only `http:`, `https:`, and `mailto:` URLs are followed; other schemes are ignored.
- **Inline terminal images:** The terminal renders sixel and iTerm2 inline image sequences, so tools that print images directly (such as `imgcat` or `chafa`) show them in place.

### Improved

- **GPU-rendered terminals:** The visible terminal renders through WebGL, which is much faster than the previous DOM renderer for heavy output. Rendering falls back to the DOM automatically when WebGL is unavailable, and background panes never hold a GPU context, so any number of tabs and splits stays within the browser's WebGL context limit.
- **Smoother output bursts:** Terminal output is coalesced across an ~8 ms window before it crosses the process boundary, cutting the number of messages the UI receives during large bursts such as build logs or package installs.
- **Correct character widths:** Terminals now apply the Unicode 11 width tables, fixing misaligned columns in TUI programs that use newer emoji and full-width symbols.

### Fixed

- **Markdown re-render churn:** The Markdown preview rebuilt its entire DOM on every app render because the renderer components passed to react-markdown were recreated each time. This swallowed real mouse clicks on links (the click event was lost when the mousedown target was swapped between mousedown and mouseup) and re-fetched preview images unnecessarily. The renderer components are now stable at module level and the preview is memoized, so the rendered DOM persists across renders.

**Full Changelog:** [v0.2.8...v0.2.9](https://github.com/Tomatio13/vintage2/compare/v0.2.8...v0.2.9)

## [0.2.8] - 2026-09-26

### Fixed

- **Terminal shell setting:** The "System default" entry in **Settings → Terminal → Default shell** was saved as the literal text `System default`, which made every new terminal fail with `Unsupported terminal shell` once the setting was re-saved. The entry now carries a proper value, and a stored invalid value falls back to the system default on startup, repairing affected installations without any action.

### Added

- **Windows shells:** New terminals on Windows can now use Command Prompt, Windows PowerShell, PowerShell 7 (`pwsh`), or Git Bash, selectable in **Settings → Terminal → Default shell**. PowerShell 7 and Git Bash are located from their default install locations and `PATH`; VINTAGE shows a clear message when they are not installed.

**Full Changelog:** [v0.2.7...v0.2.8](https://github.com/Tomatio13/vintage2/compare/v0.2.7...v0.2.8)

## [0.2.7] - 2026-09-26

### Improved

- **Automatic `.deb` updates:** Installing a downloaded update on Linux now asks for system authorization once (`pkexec`), applies the package directly, and offers a **Restart now** button. If system authorization is unavailable or fails, VINTAGE falls back to opening the `.deb` with the system package installer as before.

**Full Changelog:** [v0.2.6...v0.2.7](https://github.com/Tomatio13/vintage2/compare/v0.2.6...v0.2.7)

## [0.2.6] - 2026-09-26

### Added

- **Usage panel (CodexBar):** New right-pane **Usage** tab shows AI provider usage limits — remaining quota per window, reset times, credits, and recent cost — via the external [CodexBar CLI](https://github.com/steipete/codexbar) (optional; must be installed and configured separately). Which providers appear follows the enabled flags in `~/.config/codexbar/config.json`. The panel is toggled in **Settings → Usage** with a `codexbar` path setting and a configurable refresh interval, and a **Toggle usage panel** action is available in the command palette.

### Improved

- Make the command palette fully keyboard navigable: switch scopes with `Tab` / `Shift+Tab`, move through results including each section's `Show N more` row, and expand it with `Enter`.
- **Configurable terminal search shortcut:** The terminal search shortcut (`Ctrl+F`, `⌘F` on macOS) is now listed as "Find in terminal" under **Settings → Shortcuts → Terminal** and can be rebound to any Ctrl/Alt combination, such as `Ctrl+Shift+F`. It still triggers only while a terminal has focus.

**Full Changelog:** [v0.2.5...v0.2.6](https://github.com/Tomatio13/vintage2/compare/v0.2.5...v0.2.6)

## [0.2.5] - 2026-09-25

### Added

- **Agent status indicators:** Color-coded status dots in Space tabs and the sidebar show the most urgent terminal state across panes.

### Improved

- Keep completed agent turns stable through terminal redraws and avoid treating mouse, focus, or terminal protocol traffic as user input.
- Reduce Jev requests with adaptive polling, semantic deduplication, cancellation of outdated requests, and shared process monitoring.
- Return stale running or input-waiting states to idle when a shell prompt reappears, and distinguish warning output from errors more accurately.
- Mask additional credential formats in terminal output and commands sent to Jev.

**Full Changelog:** [v0.2.4...v0.2.5](https://github.com/Tomatio13/vintage2/compare/v0.2.4...v0.2.5)

## [0.2.4] - 2026-09-25

### Fixed

- **Linux `.deb` updates:** Open the downloaded package with the system installer instead of invoking `pkexec` directly. If no package handler is available, show a `sudo apt install` command.
- Report update installation errors as update failures instead of incorrectly labeling them as update check failures.

**Full Changelog:** [v0.2.3...v0.2.4](https://github.com/Tomatio13/vintage2/compare/v0.2.3...v0.2.4)

## [0.2.3] - 2026-09-25

### Added

- **Terminal search:** Find text in terminal scrollback, move between matches, and highlight results with `Ctrl+F` (`⌘F` on macOS).
- **Branch Diff:** Compare the current Git branch with a selected base branch in the read-only Git Review pane.
- **Command palette:** Search actions, workspaces, Spaces, and terminals from one palette. The default shortcut is `Ctrl+Shift+P` and can be changed in Settings.

### Improved

- Add English and Japanese feature guides with interface screenshots, keeping the READMEs focused on the main features.

**Full Changelog:** [v0.2.2...v0.2.3](https://github.com/Tomatio13/vintage2/compare/v0.2.2...v0.2.3)

## [0.2.2] - 2026-09-25

### Added

- **Workspace file previews:** Preview images, HTML, PDF, audio, and video files from Files. HTML runs in an isolated preview with scripts and external resources blocked.
- **Structured and source views:** Open Markdown with local images and tables, format JSON, browse searchable CSV/TSV tables, or switch supported formats to their source.
- **Source controls:** Search and copy source, toggle line wrapping, and view syntax highlighting for common programming and text files.

### Improved

- Render large source files progressively and cache syntax tokenizers to reduce display delay while retaining syntax highlighting as you scroll.
- Document supported preview types, controls, and file-size limits in both READMEs.

### Fixed

- Read only the actual bytes returned for workspace files, preventing padded characters from appearing after short files.

**Full Changelog:** [v0.2.1...v0.2.2](https://github.com/Tomatio13/vintage2/compare/v0.2.1...v0.2.2)

## [0.2.1] - 2026-09-25

### Added

- **Update checks:** Check for updates from Settings or the sidebar. VINTAGE reports available versions and download progress, then offers a restart to install the update.
- **GitHub Releases update feed:** Packaged builds use GitHub Releases to find updates.

### Improved

- Corrected the application homepage, author details, and Linux package maintainer metadata.

### Upgrade notes

- VINTAGE v0.2.0 does not contain the updater client. Install v0.2.1 manually once; later releases can then be detected by the app.
- macOS builds are not code signed. They can check for a newer version, but updates must be downloaded from GitHub Releases and installed manually.

**Full Changelog:** [v0.2.0...v0.2.1](https://github.com/Tomatio13/vintage2/compare/v0.2.0...v0.2.1)

## [0.2.0] - 2026-09-24

### Added

- **Workspace Git Review:** Inspect unstaged changes and untracked files, then review file-level diffs in a read-only panel.
- **Clipboard image pasting:** Paste images from the clipboard into terminal sessions with `Ctrl+V` (`Cmd+V` on macOS). VINTAGE saves each image in a workspace-specific temporary directory and inserts its path into the terminal prompt so CLI agents can inspect it. Text pasting continues to work.

### Improved

- **Markdown previews:** Render GitHub Flavored Markdown, including tables and task lists, and display local workspace images. Switch between Preview and Source, and reload the file to see updates.

### Fixed

- **Release assets:** Installer publishing now includes files only and excludes unpacked application directories.

### Release workflow

- Manually run the installer workflow to publish a release for an existing version tag.

**Full Changelog:** [v0.1.0...v0.2.0](https://github.com/Tomatio13/vintage2/compare/v0.1.0...v0.2.0)
