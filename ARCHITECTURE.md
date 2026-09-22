# Architecture

```text
Renderer UI → WorkspaceController → WorkspaceAdapter
     │                 │                 └─ replaceable integration
     │                 └─ authoritative client projection
     ├─ DesktopBridge → Preload allowlist → Electron Main → OS
     ├─ Terminal UI ── typed IPC ────────→ TerminalManager → node-pty → shell
     └─ Browser UI ── Electron webview ──→ isolated session → untrusted web
```

## Dependency rules

- `src/main` may use Electron and Node.js, but never imports Renderer implementation.
- `src/preload` may use Electron and shared contracts, but never Renderer implementation.
- `src/renderer` may use browser APIs and shared contracts, but never Electron or Node.js.
- `src/shared` contains serializable contracts only and has no runtime side effects.
- Business integrations implement `WorkspaceAdapter`; they do not add IPC channels unless an OS boundary genuinely requires one.

## Native capability ownership

- `TerminalManager` is the only owner of PTY processes and session cleanup.
- Renderer sends commands through `DesktopBridge`; it never receives a process handle.
- Terminal sessions are scoped to their creating `WebContents` and destroyed with that owner.
- `configureWebviewSecurity` is the single policy path for embedded browser guests.
- The browser's navigation display is a Renderer projection, not an authority for security decisions.

## Asynchronous boundaries

```text
terminal data: PTY → Main buffer/live send → Preload listener → xterm
terminal input: xterm → Preload invoke → owner validation → PTY
browser nav:   address UI → guest request → Main policy → isolated network load
```

The PTY startup buffer closes the subscription race. Browser policy is enforced again in Main even though Renderer also normalizes URLs.

Run `pnpm verify:boundaries` after changing process boundaries.
