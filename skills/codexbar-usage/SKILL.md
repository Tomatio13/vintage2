---
name: codexbar-usage
description: Check and compare provider usage limits, remaining quota, and reset times by reading CodexBar dashboard JSON. Use for questions about local CodexBar quota or when deciding which coding agent or model still has capacity.
---

# CodexBar usage limits

Run the configured CodexBar executable, or use `codexbar` from PATH when no executable was specified.

```sh
codexbar dashboard --identity redacted --timeout 60
```

Use the user's configured launcher if they explicitly provide one. If the executable is unavailable or the command fails before producing a snapshot, report that the usage could not be retrieved.

Read the JSON snapshot as follows.

- Filter `providers` to the requested providers. For a general comparison, show enabled providers and skip windows marked `idle: true`.
- Use each window's `label` or `kind`, `remainingPercent`, and `resetAt`. If only `usedPercent` is numeric, calculate the remaining percentage as `100 - usedPercent`. Keep session, weekly, and model-specific windows separate.
- If a provider has `accounts`, summarize its accounts separately when relevant. Use neutral account numbers or mark the active account. Keep account identities out of the response.
- Use each provider's or account's `updatedAt` to report freshness. `generatedAt` is the snapshot time. If a row's timestamp exceeds the snapshot's `staleAfterSeconds` threshold, label that reading as stale.
- A valid snapshot can contain both successful and failed rows. Describe failed rows briefly, keep successful readings, and report missing values as unavailable. Never infer available quota from an empty window list or a failed probe.

Summarize provider, quota window, remaining percentage, and reset time in the user's local timezone when known. Report unavailable fields and stale data alongside the affected readings. Use the quota fields for comparison and omit raw JSON, account identity, and raw error payloads from the reply.

[CodexBar dashboard schema](https://github.com/steipete/CodexBar/blob/main/docs/dashboard-api.md#fields)
