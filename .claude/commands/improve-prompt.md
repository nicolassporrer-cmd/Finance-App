# Improve Prompt

Reviews a completed session and proposes targeted improvements to any routine instructions file (e.g., `PROMPT.md`) and/or `CLAUDE.md` based on what was learned.

---

## Step 1 — Load current docs

Read the instructions file(s) being reviewed and `CLAUDE.md`. These are the baseline — proposed changes will be additions, replacements, or clarifications to what's already there.

---

## Step 2 — Review the session for learnings

Scan the session for:

- **Corrections** — did the user correct Claude's approach, output, or interpretation?
- **Ambiguities** — did Claude make a judgment call that no rule covered?
- **Rule gaps** — did an existing rule produce a wrong or suboptimal result?
- **New patterns** — did a new edge case, naming convention, or data shape appear that isn't documented?
- **Gotchas** — did something break or behave unexpectedly that isn't in the Known Gotchas section?
- **Repeated friction** — did Claude ask a question or produce output that required manual correction more than once?

**If nothing qualifies:** output: "No learnings to surface from this session." Then call `/sync` and stop.

---

## Step 3 — Propose changes

For each learning, present one block:

---

### [Short title]

**What happened:** One sentence on what triggered this learning.

**Proposed change to [`PROMPT.md` | `CLAUDE.md`]:**

~~Old text being replaced (or "N/A — new addition")~~

→ New text

**Type:** `instruction clarification` | `new rule` | `new field` | `schema change` | `new gotcha` | `workflow step`

---

Present all proposed changes before applying any. Then ask:

```
Which of these should I apply? Reply with: all / [numbers e.g. 1,3] / none
```

---

## Step 3.5 — Maintenance coverage check

After presenting proposed changes, scan for:

- Does anything introduce a **new rule** that could become stale over time?
- Does anything add a **new data source**, **integration**, or **external service**?
- Does anything add a **new behavior** that needs periodic validation?

**If yes:** surface inline before the approval prompt:

```
⚙️ Maintenance note: [change N] introduces [new rule/data source/integration].
Should we add automated monitoring for it?
```

**If no:** skip silently.

---

## Step 3.6 — Template repo and guidelines check

After reviewing session-specific learnings, check whether anything from this session is **app-agnostic** — a pattern, convention, or gotcha that would benefit *any* Claude Code project.

Scan for:
- **New workflow patterns** — a command structure, step ordering, or automation that worked particularly well and should be a universal default
- **New building conventions** — a coding rule, data integrity pattern, or debugging approach worth adding to the starter template
- **New gotchas** — a platform behavior, tool limitation, or edge case that any Claude Code builder would want to know about
- **Improved documentation patterns** — a CLAUDE.md section, QA format, or slash command structure that should become the new standard

**If something qualifies:** surface inline:

```
📐 Template update: [brief description]
→ File in claude-code-starter: [which file + section]
→ Confluence section: Claude Code Guidelines — [which section]
```

Ask: "Should I apply these to the template repo and guidelines page? (yes / no)"

**If nothing qualifies:** skip silently.

---

## Step 4 — Apply approved changes

For each approved change:
1. Edit the relevant file as specified
2. If a backfill or remediation was surfaced and approved, describe the next step — but do not execute it unless the user confirms

Then call `/sync` to close the session.
