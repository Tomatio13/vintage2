# AI Workspace Desktop Starter Specification

## Product rules

- The starter is a local, cross-platform Electron shell for AI workspace products.
- It must run without ZCode services, credentials, private assets, or a required remote backend.
- The included adapter is demonstrative. It must be replaceable without changing UI components.
- Main owns native window behavior, pseudo-terminal (PTY) processes, and embedded-browser policy.
- Preload exposes a small allowlisted bridge; Renderer never imports Electron or Node.js modules.
- Browser content is untrusted. It receives no Node.js integration or application preload and cannot request permissions.

## State ownership

- `WorkspaceController` owns accepted tasks, messages, runs, and activity projections.
- `WorkspaceAdapter` owns external integration behavior and emits ordered run events.
- `TerminalManager` in Main owns PTY session identity, lifecycle, dimensions, buffered startup output, and process cleanup.
- Each terminal session belongs to the Renderer `WebContents` that created it. Other windows cannot read, resize, write, or close it.
- `BrowserPane` owns only navigation draft/current URL UI state. The embedded page owns its document state, while Main owns its security policy.
- `uiStore` owns theme and layout preferences persisted in local storage.
- The composer component owns the unsubmitted prompt draft.
- `runId` rejects stale stream events; `AbortSignal` cancels an active mock run.

## Terminal event order

```text
Renderer subscribes → create → Main spawns PTY → output is buffered
Renderer receives id → ready → Main flushes buffer → live data events
Renderer input/resize → owner check → PTY write/resize
PTY exit or Renderer destroyed → exit event → session cleanup (once)
```

- `ready` is idempotent and prevents loss of shell startup output.
- Unknown, closed, or foreign session identifiers fail without affecting another session.
- Terminal input and dimensions are runtime-validated before they reach the PTY.

## Browser navigation rules

- User input without a scheme is interpreted as HTTPS.
- Only `http:`, `https:`, and the exact URL `about:blank` may load in the embedded browser.
- Main strips any guest preload and forces context isolation, sandboxing, web security, and Node.js integration off.
- The browser uses a dedicated persistent partition and all permission requests are denied by default.
- Disallowed navigation is cancelled. Allowed popup requests are redirected into the same guest instead of creating a new window.

## Accepted scenarios

- Launching the app displays one initial task and an empty conversation.
- Creating a task selects it without duplicating accepted state.
- Sending a prompt commits one user message and streams one assistant message.
- Completion updates the task and activity log; cancellation stops further deltas.
- Sidebar, context pane, and bottom panel can be toggled and resized.
- The bottom and right panels expose visible drag handles. Pointer dragging changes their size continuously; focused handles support arrow-key resizing in 16-pixel steps.
- Panel sizes remain clamped to their declared minimum and maximum and persist through `uiStore`.
- The bottom panel switches between a working local terminal and the activity feed.
- The side pane switches between a working embedded browser, context, and artifacts.
- Browser controls navigate, go back, go forward, reload, and stop without exposing Electron APIs to page content.
- Theme and interface font size survive a renderer reload.
- External URLs cross the typed bridge and accept only HTTP, HTTPS, or mailto protocols.

## Explicit exclusions

- Authentication, billing, telemetry, auto update, remote workspaces, and agent runtimes.
- Browser downloads, browser extensions, credential injection, release signing, and notarization automation.
