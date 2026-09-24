# VINTAGE

English | [日本語](README_JP.md)

**The right terminal calls you back.**

VINTAGE is a desktop app for organizing multiple CLI tools and work contexts into “Spaces.” When a background terminal finishes a command, reports an error, or waits for input, return to the relevant Space or terminal from the Attention list. The Review pane on the right lets you inspect workspace Git changes file by file.

![A background terminal error in Space 1 shown in the Attention list while working in Space 2, with language-specific file icons visible in Files](assets/readme/vintage-background-attention.png)

_Sample workspace. See an Attention from another Space, and identify files by their language-specific icons in Files._

### Go straight from Attention to the terminal that needs you

![The Attention list is used to open the terminal that needs attention, while the Review pane on the right shows workspace Git changes](assets/readme/vintage-attention-routing.png)

_Sample workspace. Click an Attention item to open its Space and terminal. The Review pane on the right shows unstaged Git changes._

## Get notified when a terminal needs you

When you run several CLI tools at once—such as AI agents, build tools, and development servers—you can end up repeatedly checking which terminal has finished, encountered an error, or is waiting for input.

VINTAGE monitors shell integration and terminal output (PTY output) to collect events that need your attention in one place, without relying on tool-specific settings. If local rules cannot confidently interpret ambiguous output, you can optionally ask the external AI service Jev to classify it.

Detected events appear as Space badges, in-app notifications, and in the Attention history. Long-running commands that take at least 30 seconds to complete are highlighted. Click a notification or list item to return to the relevant terminal in one action.

Set a monitoring mode for each terminal, such as `Monitor`, `Ignore`, `Mute`, `Always Notify`, or `Errors Only`. This lets you avoid noisy notifications from a continuously running development server while still hearing about a CLI that is waiting for your response.

## Features

- **Multiple workspaces**: Add projects with the native folder picker
- **Flexible shells**: Launch zsh, bash, fish, or the operating system’s default shell in each workspace directory
- **Spaces and split terminals**: Create multiple Spaces in a workspace, then arrange terminals side by side or vertically within each Space
- **Tabs and panes**: Switch between, close, and rename Spaces and terminal panes
- **File preview**: Read text files; switch Markdown between Preview and Source, with support for local images and tables
- **Git Review**: List unstaged changes, including untracked files, and inspect added and removed lines for each file
- **Automatic text copy**: Select terminal output with the mouse to copy it to the clipboard
- **Built-in browser**: Use a separate session from the terminal, with support for multiple tabs
- **Four themes**: System, Light, Dark, and Graphite
- **Extensive customization**: Configure UI size, terminal font and text size, scrollback length, and shell settings
- **Keyboard shortcuts**: Reassign the main shortcuts
- **Cross-platform support**: Custom window frames adapted for Linux, Windows, and macOS

## Getting started

1. **Launch the app**: VINTAGE opens `Space 1` and `Terminal 1` in your home directory, so you can start working without first selecting a folder.
2. **Open a project**: Choose **Open folder** to add a workspace. The selected folder becomes the terminal’s working directory.
3. **Add a Space**: Click **New space** in the sidebar or the `+` button to the right of the tabs. Each new Space starts with `Terminal 1`.
4. **Split a terminal**: Use the split buttons at the top to split the active terminal to the right or below. The new panes are named `Terminal 2`, `Terminal 3`, and so on.
5. **Preview a file**: Open **Files** in the right pane and double-click a file to open its preview beside the central pane. For Markdown, switch between **Preview** and **Source**, or reload the file.
6. **Review Git changes**: Open **Review** in the right pane and select a changed file to see its diff. Use the refresh button to reload the Git status.
7. **Return from Attention**: When a background terminal finishes or reports an error, it appears in the Attention list on the left. Click it to open the relevant pane.

> **Tip:** Double-click a tab title or terminal pane title to rename it. Press `Enter` or move focus to save, or press `Escape` to cancel.

### Review Git changes

`Review` lists unstaged changes and untracked files in the selected workspace. Select a file to view a diff with added and removed lines highlighted. Review is read-only; it does not stage or unstage changes.

![A TypeScript Git diff expanded in VINTAGE’s Review tab](assets/readme/vintage-git-review.png)

_Sample repository diff. File names have language-specific icons, and added and removed lines are highlighted._

## Default keyboard shortcuts

You can reassign shortcuts in **Settings → Shortcuts**.

| Action              | Shortcut       |
| :------------------ | :------------- |
| Previous Space      | `Ctrl+Shift+←` |
| Next Space          | `Ctrl+Shift+→` |
| Previous pane       | `Ctrl+Shift+↑` |
| Next pane           | `Ctrl+Shift+↓` |
| Previous workspace  | `Alt+←`        |
| Next workspace      | `Alt+→`        |
| New Space           | `Ctrl+Shift+N` |
| Split right         | `Ctrl+Shift+D` |
| Split below         | `Ctrl+Shift+T` |
| Toggle sidebar      | `Ctrl+B`       |
| Close selected pane | `Ctrl+Shift+W` |

Open Settings with the gear icon at the bottom left of the sidebar. Press `Ctrl+S` to save changes.

## Requirements

- **Node.js**: 24 or later
- **pnpm**: 10.33.2 or later
- **C/C++ build tools**: A native compiler toolchain is required to build `node-pty` (for example, a C/C++ compiler, `make`, and Python on Linux)

## Setup

Install dependencies:

```bash
# Install dependencies
pnpm install

# Start in development mode (watches Main, Renderer, and Electron)
pnpm dev
```

To build and run the production app locally:

```bash
pnpm build
pnpm start
```

## Optional semantic analysis with Jev

VINTAGE can use the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) to analyze terminal output with Jev and determine the current state of a command. This can help identify the state of interactive CLIs and AI agents when exit codes or simple local regular-expression rules are not enough. It works across CLI tools without relying on tool-specific hooks.

### States Jev can detect

Jev analyzes recent terminal output and reports states in the Attention list and notifications:

- **Completed**: A command or AI agent turn has finished and returned to its next input prompt
- **Failed**: A command failed or was interrupted
- **Waiting input**: The tool is waiting for user confirmation, approval, or a key press
- **Waiting external**: The tool is waiting for an external API or another process
- **Warning**: A warning needs attention, though processing may continue
- **Thinking / Busy**: An AI agent is thinking or other background work is in progress
- **Running / Unknown**: A command is running normally, or its state cannot be determined

Jev also estimates attention severity on a scale of 0–4 and whether action is needed. If the result is ambiguous, VINTAGE avoids forcing a classification and prefers a reliable local result.

### Privacy and security

VINTAGE limits the data sent to the external AI service:

- **Sent**: A command name with values that appear to be secrets masked, the workspace name, exit code, elapsed time, and the last 40 lines of terminal output (up to 4,000 characters)
- **Not sent**: Full paths, environment variables, or the full terminal scrollback
- **Rate limits**: Up to 2 requests per second and 30 per minute across the app, with a 10-second timeout. If the API is unavailable, terminal interaction remains unblocked and VINTAGE falls back to local classification.

### Set an API key

1. Open **Settings → Integrations**.
2. Enter and save your Jev API key.
   - The key is encrypted using the operating system’s secure credential store (such as Keychain or Secret Service) and is never passed to the Renderer process.
   - If secure storage is unavailable, you can set the key with the `TYPESAFE_API_KEY` environment variable. A saved key takes precedence.
   - Changes take effect in running terminals without restarting VINTAGE.

### Debug logging

To inspect classification logs, fully quit VINTAGE and start it as follows. The logs do not include the request body or API key; they show only whether the integration is enabled, the reason for a classification, and why an evaluation was skipped.

```bash
VINTAGE_JEV_DEBUG=1 pnpm dev
```

## Attention monitoring settings

Use the menu at the top of each terminal to select its monitoring mode.

| Mode            | When Jev evaluates                                                                                                                       | Attention list and notification behavior                                                                                 |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `Monitor`       | After output settles (after the debounce period) and when a command exits. If output continues, reevaluates as often as every 5 seconds. | Adds Attention items and sends OS notifications according to the configured thresholds.                                  |
| `Mute`          | Same as `Monitor`.                                                                                                                       | Shows Attention items but does not send OS desktop notifications.                                                        |
| `Always Notify` | Same as `Monitor`.                                                                                                                       | Always sends OS notifications regardless of thresholds or app activity. Notifications must still be enabled for the app. |
| `Agent Monitor` | Periodically while an AI agent is working (10 seconds by default; configurable from 5 to 300 seconds).                                   | Shows “Thinking” while output is streaming and detects completed turns and requests for input.                           |
| `Errors Only`   | Jev is not called.                                                                                                                       | Detects non-zero command exits and clear error output; ordinary completion and warnings do not trigger Attention.        |
| `Ignore`        | Jev is not called.                                                                                                                       | Stops monitoring and Attention notifications for this terminal.                                                          |

- **`Monitor` / `Mute` / `Always Notify`**: Usually evaluate after output stops or a command exits. In regular `Monitor` mode, quiet terminals are not evaluated periodically.
- **`Agent Monitor`**: Intended for AI agent CLIs such as Claude Code, Codex, and OpenCode. Process monitoring detects when an agent is running. VINTAGE shows “Thinking” while output is streaming, “Waiting input” when the agent asks a question or requests approval, and “Completed” when it returns to its prompt. The “Thinking” indicator works while Jev is not configured.

### Customize advanced settings

Open **Settings → Attention** to adjust:

- **Output settle time (debounce)**: 100–5,000 ms (default: 800 ms)
- **Attention list threshold**: For example, LOW severity and above
- **Desktop notification threshold**: For example, HIGH severity and above
- **Agent Monitor interval**: 5–300 seconds (default: 10 seconds)

Changes take effect in running terminals as soon as you save them.

### Where settings are stored

Terminal monitoring modes and app settings are stored in `attention-settings.json` in the operating system’s user data directory. VINTAGE matches a terminal’s monitoring mode using a hash derived from its workspace path, tab title, and terminal title. The settings file does not store project paths or logs as plain text.

Home and Project workspaces, Spaces, pane layouts, and open files are stored separately in `workspace-state.json`. It contains the project paths and relative file paths needed to restore the workspace. If a folder is missing, its Space information is retained so you can select the folder again or remove the project. Terminal processes and their output are not saved.

## Verification and tests

Run the following commands for development checks and tests:

```bash
# Run boundary checks, type checking, lint, formatting checks, unit tests, and a build
pnpm verify

# Run an end-to-end smoke test that launches Electron
pnpm test:e2e
```

### Individual commands

| Command                  | Description                                               |
| :----------------------- | :-------------------------------------------------------- |
| `pnpm typecheck`         | Check TypeScript types in the Main and Renderer processes |
| `pnpm lint`              | Run static analysis with oxlint                           |
| `pnpm fmt`               | Format source files with oxfmt                            |
| `pnpm fmt:check`         | Check formatting                                          |
| `pnpm test`              | Run unit and component tests with Vitest                  |
| `pnpm build`             | Build Main, Preload, and Renderer for production          |
| `pnpm verify:boundaries` | Check Electron process boundaries and dependency rules    |

## Packaging

To create an unpacked app before installation:

```bash
pnpm run package:dir
```

To create installers or distribution packages, run the command for the target operating system:

| Target OS   | Command               | Output formats |
| :---------- | :-------------------- | :------------- |
| **Linux**   | `pnpm run dist:linux` | AppImage, deb  |
| **macOS**   | `pnpm run dist:mac`   | dmg, zip       |
| **Windows** | `pnpm run dist:win`   | NSIS installer |

Build artifacts are written to the `release/` directory.

GitHub Actions builds packages for Linux and Windows, and for both Intel (x64) and Apple Silicon (arm64) Macs, on pull requests, pushes to `main`, and manual runs. Each workflow run’s artifacts are retained for 30 days. Pushing a tag that starts with `v` automatically creates a GitHub Release with all target packages attached. Code signing, including macOS notarization, is not configured.

## Architecture

```text
Renderer UI
  ├─ Typed IPC → Preload allowlist → Electron Main → OS / filesystem
  ├─ Terminal UI → TerminalManager → node-pty → local shell
  └─ Browser UI → isolated webview session → web
```

- **`src/main`**: Window management, PTY control, file access validation, and WebView security
- **`src/preload`**: Exposes a minimal, secure, typed API to the Renderer
- **`src/renderer`**: React UI, tab and pane layouts, and settings
- **`src/shared`**: Shared types and communication contracts for Main, Preload, and Renderer
- **`tests`**: UI components, state management, URL handling, and Electron smoke tests

For details about process boundaries and design principles, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Security

VINTAGE is designed to run safely in a local environment:

- **Process isolation**: Node.js integration is disabled in the Renderer process. Context Isolation and the sandbox are enabled.
- **Secure IPC**: Access from the Renderer to the operating system is limited to typed IPC calls explicitly allowed by the Preload allowlist.
- **Workspace restrictions**: Add projects through the folder picker. On restart, saved project paths are revalidated before they are registered. The Renderer cannot access unregistered paths directly.
- **Safe file reads**: Prevents path traversal, blocks unintended external access through symbolic links, and refuses to read non-regular files. File previews are limited to 1 MB.
- **PTY lifecycle management**: Each pseudo-terminal (PTY) is tied to the Electron window that created it and is terminated when that window closes.
- **Secure built-in browser**: Allows only the `http:`, `https:`, and `about:blank` URL schemes and automatically denies permission requests such as camera or location access.
- **CLI credentials are not stored**: VINTAGE does not store login credentials for external services or CLIs such as `Codex`. Each CLI manages its own authentication and settings.

## Current limitations

The following features are in development or not yet supported:

- Editing code in the file preview pane (previews are read-only)
- Accurate event detection in environments where shell integration is unavailable, such as remote SSH shells (VINTAGE uses a basic inference from PTY logs)
- File downloads, extensions, and saved login credentials in the built-in browser
- Automatic app updates, usage telemetry, and code signing for official releases

## License

This project is available under the **Apache License 2.0**.

See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md) for details.
