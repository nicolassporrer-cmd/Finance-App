# [Your App Name] — Project Context

## What this is
[One sentence: what this app does and who it's for.]

Built on:
- **[Data layer]** — e.g., Google Sheets (Sheet ID: `...`) / PostgreSQL / Airtable
- **[Middleware]** — e.g., Google Apps Script / FastAPI / Supabase Edge Functions
- **[Frontend]** — e.g., React 18 + Tailwind CSS (CDN, no build step) / Next.js / Streamlit

**Deployment URL:** [URL here, or "n/a — local only"]

---

## Working with [Name]

- Keep responses concise — no verbose summaries or narration of what you just did
- [Add any time/priority preferences, e.g., "Sessions are often time-pressured — be efficient"]
- QA checklists after deploying must be **numbered prescriptive steps organized by Part** (Part 1: Feature works, Part 2: Data layer, Part 3: Edge cases, Part 4: Regressions) — never bullet circles

---

## Files in this repo

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — project bible |
| `BACKLOG.md` | Prioritized feature backlog |
| `JOURNAL.md` | Append-only build log — why the app is the way it is (rebuild spec) |
| `.claude/commands/plan.md` | `/plan` slash command |
| `.claude/commands/feature.md` | `/feature` slash command |
| `.claude/commands/qa.md` | `/qa` slash command |
| `.claude/commands/sync.md` | `/sync` slash command |
| `.claude/commands/improve-prompt.md` | `/improve-prompt` slash command |
| `plans/` | Agreed design per feature — tracked, part of the rebuild spec |
| [Add your app files here] | |

---

## Development workflow

**Design before building** — complete all requirements discussion and get explicit agreement before writing any files. This includes tooling and workflow changes.

**Mockup first** — if UI changes are involved, use the Preview tool during `/plan` to render mockups. Iterate until all states (default, loading, empty, error, edge cases) are agreed before writing code. Iterate on the mock many times; deploy once for QA sign-off.

**Lifecycle:** `/plan` → `/feature` → `/qa` → `/sync`

- `/feature` automatically calls `/qa` after deploying — do not skip
- `/sync` is the session closer: commits, pushes, updates docs. Run after any session that touched tracked files

**Branch rules:**
- Feature work: create `feature/<slug>` before any changes; never work directly on `main`
- Config/doc updates (CLAUDE.md, BACKLOG.md, etc.): work directly on `main`
- After QA passes: `/sync` merges to `main`, pushes, deletes the branch
- Merge conflict: stop, explain what's conflicting, show both versions, ask how to resolve

---

## Building conventions

1. **No gold-plating.** Don't add features, refactor, or introduce abstractions beyond what the task requires. Three similar lines beats a premature abstraction.
2. **No unnecessary error handling.** Only validate at system boundaries (user input, external APIs). Trust internal code and framework guarantees.
3. **No explanatory comments.** Only add a comment when the *why* is non-obvious — a hidden constraint, a subtle invariant, a platform workaround. Well-named identifiers are self-documenting.
4. **Extend, never replace.** New fields, columns, and endpoints must be additive. Never remove or rename something that existing data or callers depend on.
5. **Normalize at the boundary.** Convert external data (API responses, Sheet values, file contents) to your internal format at the point of entry. Downstream code never deals with the source format.
6. **Optimistic update + undo.** For write actions, update the UI immediately. Keep the item visible in a faded/muted state until the write confirms. Provide an undo path.
7. **Graceful degradation.** Missing data renders a sensible empty/default state, not a broken component. Check before accessing; never assume a field exists.
8. **No hardcoded credentials.** Secrets go in `.env` (gitignored), environment variables, or a secrets manager. Never commit them.
9. **Abstract platform constraints.** Work around platform limitations in one place and document the reason in Known Gotchas — don't scatter workarounds across the codebase.

---

## Data integrity rules

1. **Upsert, never overwrite.** All writes use upsert-by-key: add new rows, update existing rows in-place, delete only rows whose keys are explicitly absent from the incoming data. Never clear and rewrite a collection unconditionally.
2. **Empty array = no-op.** Sending `[]` for a list field must leave all existing rows untouched. Only a non-empty array triggers the upsert.
3. **Blank payload value ≠ clear.** Blank or missing fields in an incoming payload must never overwrite existing non-blank values in the data store.
4. **Idempotent writes.** Running the same import twice produces the same result. Server-side dedup (by natural key) prevents duplicates without error — a re-run is always safe.
5. **Flag-and-skip deduplication.** Items that look like duplicates get a `possible_duplicate: true` flag and are skipped at import time — not silently dropped. The import summary lists all skipped items.
6. **Dry-run on destructive scripts.** Any script that deletes rows, clears a collection, or rewrites data in bulk must support a `--dry-run` flag that previews changes without committing them.

---

## Deployment

[Describe your deploy command and what it does.]

```
[deploy command here]
```

After deploying: tell the user what to do (e.g., "Hit Ctrl+Shift+R to see changes.") and share a numbered QA checklist covering the changed behavior.

**What deploy does:**
1. [Step 1 — e.g., Copy dashboard.html → apps-script/index.html]
2. [Step 2 — e.g., clasp push --force]
3. [Step 3 — e.g., clasp deploy --deploymentId ...]

---

## Data layer

[Describe your data schema: tables, tabs, key columns. This section is specific to your app and is the main thing to fill in.]

---

## API

[Describe your server-side functions or API endpoints. Recommended format:]

| Action | Transport | Description |
|--------|-----------|-------------|
| [name] | GET / POST | [what it does] |

---

## Known gotchas

Document surprises as they're discovered. Format: **what breaks**, why it breaks, how to fix or avoid it. This section compounds in value over time — every entry saves the next session from repeating a debugging loop.

<!-- Add entries here as you discover them. Example:
- **[Thing that breaks]:** What happens. Why. Fix: [workaround].
-->
- **Don't let a background agent delegate a bounded data-fetch task to further sub-agents.** Dispatching a general-purpose background agent for a well-defined, bounded pull (e.g., "fetch all X from API Y") risks a runaway sub-agent chain if the agent misreads its own tool-call results, wrongly concludes there's a platform bug, and spawns further agents to "verify." Those sub-agents often can't be force-killed by anyone except their direct parent — `TaskStop` can fail with an ownership restriction, leaving `SendMessage` (asking it to stop) as the only lever, with no guaranteed hard stop. Fix: do bounded, well-understood API pulls directly in the main session rather than delegating them. Reserve background agents for genuinely independent work where a single agent completes its own task without needing to spawn children — e.g., "scan this Slack workspace for a date range" or "scan this inbox," not "resolve this entire relational data tree across N interlinked API calls."
  - **If delegation is still the right call** (the task is large but genuinely bounded and independent), explicitly forbid nested spawning in the prompt: *"Do NOT spawn any sub-agents or delegate any part of this to another agent — do all the work yourself directly. If you're ever unsure whether a result looks right, just note the uncertainty in your final reply — do not launch a 'verification' sub-agent."* Confirmed effective in practice after a second occurrence of the exact runaway-chain failure above — the agent that received this instruction completed a large bounded task cleanly, while a sibling agent given the same class of task without it tried to spawn a nested agent instead of doing the work.
- **Never batch two read calls to the same MCP server in one message — their results can clobber each other.** When two reads to the same MCP server are issued in a single assistant turn, both tool results may come back identical (typically whichever query resolved last), silently returning the wrong data for one of them. This is not limited to two calls of the *same* tool — two *different* read tools on the same server (e.g. a "search" and a "get-by-id") can collide too. Fix: sequence reads to the same server one message at a time. Reads to *different* servers, or a read against a non-MCP tool, can still run in parallel safely.
- **For very high-volume gather work, delegate to parallel sub-agents that each write structured JSON to disk, then assemble with a script.** When a task requires ingesting far more source material than fits comfortably in one context (many documents/transcripts, a multi-day multi-source scan), reading it all inline guarantees a mid-task context compaction and the silent quality loss that comes with it. Instead: give every worker a shared spec file + a shared context file (both on disk), have each write its *full* extraction to its own `scratchpad/*.json` and return only a short summary, then merge all the JSON files into the final artifact with a deterministic script (normalization tables, dedup, ID assignment, stat computation). This is more compaction-safe than inline reading because the structured outputs persist on disk independent of the orchestrator's context. Caveat: the orchestrator never personally reads the raw source, so any "re-read the source yourself before finalizing" gate is satisfied by the on-disk extractions, not raw-file reads — disclose that trade-off. Pair this with the no-nested-spawning instruction above.
- **A tool installed mid-session stays invisible until Claude Code is restarted.** Installing Node, `gh`, or anything else that registers itself on PATH updates the *system* PATH, but the running Claude Code process keeps the environment it inherited at launch — so every shell it spawns still reports `command not found`, no matter how many new shells are opened inside the session. The install is fine; the session is stale. Fix: quit and reopen Claude Code after installing a tool. To confirm the install really did land before restarting, check the binary directly (`Test-Path "C:\Program Files\nodejs\node.exe"`) rather than trusting `node --version`, and if a command genuinely must run before the restart, invoke it by absolute path.
