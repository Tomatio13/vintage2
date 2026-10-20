# VINTAGE Changelog

## [0.2.36] - 2026-10-20

### Added

- **Review history graph:** Show up to 80 repository commits in a separate, collapsible lower panel, with branch and merge connections, branch names, remote refs, and tags.

### Improved

- Give commit messages their full width without an inline commit hash; horizontally scroll to read long messages and refs.
- Keep changes and history independently scrollable, preserving read-only Git review and existing diff/file previews.

### Validation and limitations

- Boundaries, TypeScript, lint, formatting, 528 passing tests (one skipped), and production builds passed. Tests cover merge parents, refs, subfolder workspaces, graph connections, and collapse behavior.
- Previewed the actual Review component in Chrome using fixture changes and merge/tag history. Full Electron interaction and installed-app updater verification remain pending.
- Windows Monitor remains an experimental pre-release; Windows/macOS Sessions and analysis remain experimental with physical-device runtime testing pending. macOS Monitor remains unverified.

**Full Changelog:** [v0.2.35...v0.2.36](https://github.com/Tomatio13/vintage2/compare/v0.2.35...v0.2.36)

## [0.2.35] - 2026-10-20

### Added

- **Session analysis:** Manually analyze saved conversations using Codex or Claude Code, independently of the original agent. Show the inferred status, situation summary, and next action without changing source logs or titles.
- **Sessions settings:** Choose the analysis CLI, optional executable path and model, and check CLI availability/login under Settings → Sessions. Keep tab visibility under Panels.
- Persist analysis separately, reuse unchanged input/settings, support explicit reanalysis, mark outdated results, and show successful analysis counts and reported token usage.

### Improved

- Raise the UI font size limit from 18 px to 32 px; terminal font settings remain separate.
- Align the compact, borderless Analyze/Reanalyze and Resume actions in the session card footer.
- Support native Windows analysis CLIs and standard npm launchers using direct Node entrypoints; handle JSON arguments and spaces/Japanese characters without shell interpretation. Preserve the discovered PATH for macOS Homebrew, nvm and user installations.

### Fixed

- Hide internal Codex Guardian review sessions using their metadata while retaining source logs and ordinary conversations.
- Refresh history after an in-flight scan so simultaneous analysis and log updates do not leave a stale session list.
- Exclude analysis workers from Monitor and terminate their process groups/trees on timeout or application exit.

### Validation and limitations

- Boundaries, TypeScript, lint, formatting, 525 passing tests (one skipped), and production builds passed.
- Linux Electron smoke with a mock CLI verified settings, connection checks, analysis, caching, forced reanalysis, outdated markers, unchanged source logs, and existing terminal preservation. Real LLM analysis was not exercised by the smoke test.
- Linux Electron font smoke verified incrementing to 32 px, the upper bound, CSS application, and persistence after reload.
- Analysis uses the selected CLI's plan allowance or API credits. Recent compatible CLI versions are required; custom provider/hooks/MCP configuration and arbitrary batch wrappers are not supported.
- Windows/macOS analysis and Sessions support remain experimental; physical-device runtime testing is pending. Windows Monitor remains an experimental pre-release, macOS Monitor remains unverified, and installed-app updater verification remains pending.

**Full Changelog:** [v0.2.34...v0.2.35](https://github.com/Tomatio13/vintage2/compare/v0.2.34...v0.2.35)

## [0.2.34] - 2026-10-19

### Added

- **Sessions panel:** Browse saved Codex, Claude Code, Grok, and Antigravity conversations separately from live Monitor activity. Search titles and request previews, filter projects and agents, pin sessions, and browse date groups.
- **Chat reader:** Show user bubbles, Markdown agent replies, code blocks and tables, per-message copy actions, a compact session summary card, and an expanded list/conversation view. Keep scrolling while hiding vertical scrollbars.
- **Session resume:** Resume supported conversations in a new Space while preserving existing terminals, or return to a recognized live VINTAGE terminal. Add Open in Sessions from Monitor.
- **Cross-platform launch:** Support Windows native executables and npm command shims, common user/npm/nvm/Homebrew install locations, and Windows case/separator differences in project paths.
- **Sessions visibility shortcut:** Add configurable Toggle Sessions tab, defaulting to Ctrl+Alt+Y (Command+Option+Y on macOS), in Settings and the command palette.

### Fixed

- Preserve an unset CLAUDE_CONFIG_DIR when resuming Claude Code so the global setup/configuration file stays at its normal location.
- Reuse the Attention settings dropdown component and common button styles for Sessions controls.

### Validation

- Boundaries, TypeScript, lint, formatting, 507 passing tests (one skipped), and production builds passed.
- Linux Electron smoke verified fixture history/chat rendering, pinning, expansion/Escape, resume arguments/config root, and preservation of the existing terminal. Actual Grok/Antigravity model continuation was not exercised.

### Documentation and limits

- Synchronize English/Japanese README and feature guides for Sessions, local data sources, chat behavior, shortcuts, and platform coverage.
- Bound history discovery and transcript reads; show up to 500 recent logs/conversations and labeled excerpts from large sessions. Exclude internal reasoning and tool outputs from chat.
- Antigravity CLI supports resume; Antigravity IDE histories support browsing only. The matching agent CLI must be installed.
- Windows/macOS Sessions support is experimental and physical-device testing remains pending. Windows Monitor remains an experimental pre-release, macOS Monitor remains unverified, and installed-app updater verification remains pending.

**Full Changelog:** [v0.2.33...v0.2.34](https://github.com/Tomatio13/vintage2/compare/v0.2.33...v0.2.34)

## [0.2.33] - 2026-10-19

### Added

- Separate System / Light / Dark appearance from light and dark palette choices.
- Add Vintage, Graphite, Ocean, Grove, Iris, and Ember palettes with round gradient previews, selection rings, and sun/moon badges.
- Create and duplicate custom themes; edit names, light/dark backgrounds, and accent colors with automatically generated text and borders.
- Import and export VINTAGE theme JSON, with icon actions and hover descriptions for creation, import, and duplication.

### Improved

- Follow OS appearance changes in System mode and update existing terminal colors without recreating sessions.
- Preserve existing Vintage and dark Graphite colors and migrate saved Graphite preferences.
- Synchronize English/Japanese README and feature guides for themes, Git Review comparisons and large diffs, large file previews, Browser bookmarks and suspension, and Monitor wait notifications/background activity.

### Validation and limitations

- Boundaries, TypeScript, lint, formatting, 481 passing tests (one skipped), and production builds passed.
- Linux Electron checks verified the Appearance screen, palette selection, and round theme previews.
- Physical Windows/macOS runtime testing and installed-app updater verification remain pending. Windows Monitor remains an experimental pre-release; macOS Monitor remains unverified.

**Full Changelog:** [v0.2.32...v0.2.33](https://github.com/Tomatio13/vintage2/compare/v0.2.32...v0.2.33)

## [0.2.32] - 2026-10-19

### Added

- **Browser controls:** Zoom with Ctrl + mouse wheel or Ctrl + + / - / 0, select the address with Ctrl+L, close and reopen tabs with Ctrl+W / Ctrl+Shift+T, and cycle visible Browser tabs with Ctrl+Tab / Ctrl+Shift+Tab.
- **Mouse navigation:** Middle-click links to open background tabs in the same scope, middle-click tabs to close them, and use mouse back/forward commands on Windows and Linux.
- **Document zoom:** Use Ctrl + mouse wheel over text/source previews and Markdown preview/edit.
- **Terminal close shortcut:** Ctrl+W closes the focused terminal pane. Closing the last pane closes its Space; held-key repeats do not close additional panes. The shortcut is consumed by VINTAGE instead of being sent to the shell.

### Changed

- Keep the last 20 closed Browser tabs during the app session and restore their URL, scope, and zoom with a fresh tab identity. Form input and navigation history are not restored.
- Load a suspended/background neighbor when it becomes selected after closing a Browser tab.

### Validation and limitations

- Boundaries, TypeScript, lint, formatting, 477 passing tests (one skipped), and production builds passed.
- Linux Electron smoke tests covered guest zoom and address shortcuts, link/tab middle-click, tab switching and reopening, back/forward command routing, Ctrl-wheel zoom, terminal pane closure, sibling session continuity, held-key repeats, and final-Space closure.
- Physical mouse back/forward buttons, physical Windows/macOS runtime behavior, and installed-app updater verification remain pending. Windows Monitor remains experimental.

**Full Changelog:** [v0.2.31...v0.2.32](https://github.com/Tomatio13/vintage2/compare/v0.2.31...v0.2.32)

## [0.2.31] - 2026-10-18

### Added

- **Character ripple:** Add an optional wave of characters that spreads from each click and fades away. Enable it in Settings > Appearance; it is off by default.
- **Ripple customization:** Adjust intensity, choose a custom color, or restore automatic theme colors. Preferences are saved across restarts.

### Changed

- Keep ripple characters clear on light backgrounds with a warm accent color, stronger opacity, bolder text, and a delayed smooth fade.
- Keep the overlay transparent to input, bound simultaneous waves, stop drawing when idle or unfocused, and respect reduced motion. Embedded browser pages are excluded.

### Validation and limitations

- Boundaries, TypeScript, lint, formatting, automated tests, and production builds passed.
- Browser checks covered light-theme visibility, custom color rendering, persisted settings, reduced motion, automatic clearing, and disabling the overlay.
- Native Electron interaction and installed-app updater verification remain pending. Windows Monitor remains experimental, with physical Windows/macOS runtime testing pending.

**Full Changelog:** [v0.2.30...v0.2.31](https://github.com/Tomatio13/vintage2/compare/v0.2.30...v0.2.31)

## [0.2.30] - 2026-10-17

### Performance and fixes

- Keep Git Review responsive with large changesets through bounded file/diff rendering and oversized-diff preview fallback.
- Preserve the current diff when additional context exceeds the display budget or refresh fails, improve fold expansion positioning, and reuse pinned branch comparison revisions.
- Virtualize the Files tree and limit concurrent directory reads.
- Reduce Browser metadata updates, filter and page bookmarks, and add an explicit Suspend background tabs action. Suspended pages reload when reopened; unsaved page input is cleared.
- Keep source previews continuously scrollable with at most 600 rendered lines, search the full loaded text, preserve the reading position when search closes, and avoid duplicate JSON formatting.
- Stabilize the Review smoke test by identifying the visible terminal from its executed marker and ignoring unrelated terminal replay events.

### Validation and limitations

- Boundaries, TypeScript, lint, formatting, 466 passing tests (one skipped), and production builds passed.
- Linux Electron smoke tests covered 15,001 files, 20,000 source lines, 1,000 bookmarks, background-page suspension, source scroll/search positioning, large Review context, and a continuing live terminal session.
- The Review smoke test passed five consecutive runs with deterministic unrelated terminal events.
- Windows Monitor remains experimental. Physical Windows/macOS runtime testing and installed-app updater verification remain pending.

**Full Changelog:** [v0.2.29...v0.2.30](https://github.com/Tomatio13/vintage2/compare/v0.2.29...v0.2.30)

## [0.2.29] - 2026-10-16

### Added

- **Session wait notifications:** Notify when a Monitor session changes from Thinking or Executing to Waiting, including ZCode and other sessions without a VINTAGE terminal. Reuse Attention toasts and desktop notifications, with a Session wait notifications toggle in Settings > Attention.
- **Notification navigation:** Open the owning Space and focus its terminal from a bound session notification. Sessions without a terminal open their details in Monitor.

### Changed

- **Space status dots:** Reflect Monitor session activity using collector-provided terminal ownership, even when the Monitor tab is closed. Keep the existing terminal status as a fallback.
- **Notification behavior:** Respect terminal Monitor Mode, priority thresholds, Mute, and desktop notification settings. Collect session transitions while minimized, suppress initial/recovery notifications, and coalesce nearby terminal/session wait notifications.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 445 tests (one skipped), and the production build.
- Automated validation covers session transitions, stale metadata, failed collection, multiple sessions, notification preferences, background polling, and notification navigation.
- Waiting can mean a completed response or an input request; notifications describe both possibilities. Only observed transitions trigger notifications.
- Native OS notification display and installed-app updater verification remain pending. Windows Monitor remains experimental, with physical Windows/macOS runtime testing pending.

**Full Changelog:** [v0.2.28...v0.2.29](https://github.com/Tomatio13/vintage2/compare/v0.2.28...v0.2.29)

## [0.2.28] - 2026-10-13

### Fixed

- **Browser tabs:** Remove the 288px width cap and nested scrolling from the Browser tab strip. Added tabs extend horizontally alongside the other panel tabs, and the panel header scrolls when needed.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, tests, and the production build.
- Live Electron display and installed-app updater verification remain pending. Windows Monitor remains experimental, with physical Windows/macOS runtime testing pending.

**Full Changelog:** [v0.2.27...v0.2.28](https://github.com/Tomatio13/vintage2/compare/v0.2.27...v0.2.28)

## [0.2.27] - 2026-10-13

### Added

- **Subtasks:** Add, edit, complete, reopen, and delete checklist items below Description / Notes. Show completed/total progress in card details and on cards. Save changes includes pending subtask input; completing the checklist leaves the parent status unchanged.
- **Agent Skill:** Distribute the portable `vintage-board` Skill with its Python 3 helper. Agents can read cards, update Status/Notes, and manage subtasks by full ID. Copy AI instructions exports the Skill under app data and supplies its path in a concise five-line prompt.

### Changed

- **Board layout:** Keep the card list beside an expanded detail drawer while preserving terminal sessions. Use compact cards with labels, task IDs, priority, and due date, plus columns that follow their content height.
- **Board navigation:** Search Title/Notes, filter by priority, sort by manual order/priority/due date, hide Done, collapse columns, and reorder using drag or keyboard actions.
- **Board storage:** Support metadata in version 2 and subtasks in version 3. Back up the exact previous file before migration, retain IDs and card order, reject downgrades, and preserve unrelated data through shared locks and atomic writes.
- **Documentation:** Update English/Japanese README and feature guides, the Board/CLI guide, and the Board port design.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 420 tests (one skipped), and the production build. Python static checks and Skill validation passed.
- Linux Electron smoke testing covers narrow/wide panes, list/detail layout, subtask entry and progress, copied Skill execution and external changes, real dragging, 1,000 cards, three themes, and continuing input/output in the same terminal session.
- Windows Monitor remains experimental. Physical Windows/macOS runtime testing, installed-app updater verification, and agent-specific automatic Skill discovery remain pending.
- Older VINTAGE versions cannot read version 2/3 boards. Migration backups exclude later changes; see the Board guide before restoring an old format.

**Full Changelog:** [v0.2.26...v0.2.27](https://github.com/Tomatio13/vintage2/compare/v0.2.26...v0.2.27)

## [0.2.26] - 2026-10-13

### Changed

- **Sidebar navigation:** Click workspace folders to expand or collapse their Spaces. Reveal project actions on hover or keyboard focus and choose Remove from the menu. Remove terminal counts from Space rows.
- **Agent activity colors:** Use the Codex Usage teal accent for Running and Thinking dots across themes.
- **Monitor presentation:** Use a neutral summary card and status dot, retain the green Monitor icon and active-agent count, and shorten the headings to Live Now and Usage.

### Fixed

- **CLI activity detection:** Show detected Claude Code and other known agent CLI processes as running even without shell integration, including in Errors Only mode. Clear process activity when the CLI exits without changing notification thresholds.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 388 tests (one skipped), and the production build.
- Automated validation covers CLI detection without shell integration, process exit, workspace expansion, and the Remove menu.
- The user confirmed the Claude Code dot and sidebar/Monitor presentation in the running app.
- Windows Monitor remains experimental. Physical Windows/macOS runtime testing and installed-app updater verification remain pending.

**Full Changelog:** [v0.2.25...v0.2.26](https://github.com/Tomatio13/vintage2/compare/v0.2.25...v0.2.26)

## [0.2.25] - 2026-10-12

### Changed

- **Monitor AI Usage:** Prefer CodexBar limit reset credits over regular credits when provided, showing the available balance and next expiry. Hide Today and 30 days costs in this mode; retain the existing credits and costs display otherwise.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 383 tests (one skipped), and the production build.
- Regression coverage includes available and zero limit reset credits, hidden costs, and regular credits fallback.
- Windows Monitor remains experimental. Live app display, physical Windows/macOS runtime testing, and installed-app updater verification remain pending.

**Full Changelog:** [v0.2.24...v0.2.25](https://github.com/Tomatio13/vintage2/compare/v0.2.24...v0.2.25)

## [0.2.24] - 2026-10-12

### Fixed

- **Monitor process filtering:** Exclude Codex remote-control services and agent probes launched by CodexBar, including probes reached through intermediate parent processes. Keep ordinary agent sessions visible.
- **Grok session badge:** Use teal instead of orange to align with the green AI Usage marker. ZCode retains its rose badge.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 380 tests (one skipped), and the production build. Regression tests cover native and Node remote-control launchers, CodexBar ancestry, Windows executable names, and ordinary Codex/Claude sessions.
- Windows Monitor remains experimental. Physical Windows and macOS runtime testing, installed-app updater verification, and live reproduction of intermittent CodexBar probes remain pending.

**Full Changelog:** [v0.2.23...v0.2.24](https://github.com/Tomatio13/vintage2/compare/v0.2.23...v0.2.24)

## [0.2.23] - 2026-10-12

### Fixed

- **Monitor session visibility and activity:** Keep ambiguous local sessions visible as Unknown, account for all message and part updates when comparing ZCode task status, and combine resource usage for workers sharing a session.
- **Parallel activity and attention:** Preserve running Antigravity steps across overlapping tool activity and stop attention polling while waiting for user input.
- **Grok log tracking:** Read appended log records incrementally, retain state across long output, and keep model selection consistent across incremental reads and rebuilds.
- **ZCode discovery performance:** Stream session metadata, retain directory matches, and calculate activity only for matching sessions without a global session limit.

### Documentation

- Add a Graphite-themed Monitor screenshot with demo data to both feature guides and clarify local session visibility.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 379 tests (one skipped), and the production build. Linux-hosted Electron checks passed for Monitor lifecycle, agent fixtures, and embedded AI Usage.
- Windows Monitor remains experimental. Physical Windows and macOS runtime testing, live ZCode validation, and installed-app updater verification remain pending.

**Full Changelog:** [v0.2.22...v0.2.23](https://github.com/Tomatio13/vintage2/compare/v0.2.22...v0.2.23)

## [0.2.22] - 2026-10-11

### Fixed

- **ZCode Monitor status:** Compare desktop task metadata with session activity, message updates and completion times, and all tool updates before overriding the CLI state. Prevent stale completed tasks from masking active work and stale running tasks from reviving finished turns.
- **Parallel tool tracking:** Keep ZCode and OpenCode sessions Executing while any tool in the latest message is running or pending, even when a later tool has already finished.

### Changed

- **AI Usage colors:** Add provider-colored name markers and quota bars, using CodexBar accents where available. Keep warning and critical colors for low remaining quota, and highlight the active account badge.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 368 tests (one skipped), and the production build. Regression tests cover stale desktop metadata, message/tool update ordering, and parallel tools. Linux-hosted Electron Monitor and AI Usage integration checks passed.
- Live ZCode session validation remains pending. Windows Monitor remains experimental; Windows and macOS runtime validation and installed-app updater verification were not performed for this release.

**Full Changelog:** [v0.2.21...v0.2.22](https://github.com/Tomatio13/vintage2/compare/v0.2.21...v0.2.22)

## [0.2.21] - 2026-10-11

### Added

- **Windows Monitor (experimental pre-release):** Add a bundled Rust process collector for PID/parent relationships, command lines, working directories, process start times, CPU and memory. Initial Windows targets are Claude Code, Codex and OpenCode. No Rust or abtop installation is required for installer users.

### Fixed

- **Windows session discovery:** Recognize native `.exe` and Node launchers, handle quoted paths and Windows path comparisons, exclude Codex app-server/MCP services, and probe OpenCode database locations. Keep ambiguous session ownership Unknown instead of assigning logs by modification order.
- **Monitor display:** Keep AI Usage cards in two columns and deduplicate ZCode workers when one recent session can be inferred for their shared working directory.

### Build

- Build and bundle the Windows collector and dependency license notices with the installer. Windows development and source builds require the Rust toolchain; CI installs it automatically.

### Validation and limitations

- Automated validation passed: boundaries, TypeScript, lint, formatting, 365 tests (one skipped), and the Linux-hosted production build. The Rust collector passed Windows MSVC-target `cargo check` and a Linux-hosted protocol smoke test.
- **Windows Monitor remains an experimental pre-release feature. Physical-device testing is pending.** Windows installer generation is verified separately by the release workflow; successful packaging does not establish runtime behavior.
- Windows terminal detection is unavailable, so terminal-only Codex logs may remain unmatched. Unavailable metrics show a dash; ambiguous sessions show Unknown. Other agents remain unverified on Windows. macOS runtime verification remains pending, and AI Usage still depends separately on the optional CodexBar CLI.

**Full Changelog:** [v0.2.20...v0.2.21](https://github.com/Tomatio13/vintage2/compare/v0.2.20...v0.2.21)

## [0.2.20] - 2026-10-11

### Added

- **Local Agent Monitor:** View PC CPU, per-core load, memory, and running Claude Code, Codex, Antigravity, OpenCode, ZCode, and Grok sessions. Inspect current tools, models, context usage and process-tree resources, expand the dashboard, or return to an existing VINTAGE terminal. Local monitoring requires no abtop installation or external collector.

### Changed

- **Usage integration:** Move AI Usage directly below CPU/Memory in Monitor, with compact, equally sized provider cards. Remove the separate Usage tab and workspace filter. Configure quota visibility and refresh settings in Settings → Usage; existing CodexBar settings are retained.
- **Monitor shortcuts:** Ctrl+Shift+U opens Monitor and Ctrl+Alt+U toggles the Monitor tab. Existing custom Usage shortcut bindings migrate to the corresponding Monitor actions.
- **Live session lifecycle:** Remove exited processes on the next refresh, hide unmatched background/remote services, and hide ZCode sessions after one hour without recorded activity. Local monitoring and Usage refresh only while their view and the app document are visible.

### Limitations

- Monitor is currently supported on **Linux only**. Windows is not supported; the macOS implementation has not been verified. Ambiguous session associations appear as Unknown, and unavailable metrics are shown as a dash. AI Usage continues to require the optional CodexBar CLI.

**Full Changelog:** [v0.2.19...v0.2.20](https://github.com/Tomatio13/vintage2/compare/v0.2.19...v0.2.20)

## [0.2.19] - 2026-10-10

### Added

- **Browser context menu:** Right-click pages to copy selected text; undo, redo, cut, copy, paste, paste as plain text, and select all in editable fields; open links in new tabs and copy their addresses; and copy images or open them in new tabs. Page areas offer Back, Forward, and Reload, with Inspect element available in every context. New tabs retain the source tab's Project or Common scope.

### Fixed

- **Files folder expansion:** Remember expanded folders per Project across Project and Space switches, Files tab changes, and app restarts. Restore nested folders, preserve child expansion when their parent is collapsed, and fetch current folder contents on restoration.

**Full Changelog:** [v0.2.18...v0.2.19](https://github.com/Tomatio13/vintage2/compare/v0.2.18...v0.2.19)

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
