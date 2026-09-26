# VINTAGE Changelog

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
