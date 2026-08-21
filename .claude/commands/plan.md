# Plan

Plans the backlog item passed as `$ARGUMENTS`. Produces a detailed implementation plan and saves it to `plans/<slug>.md`.

**No code is written during planning.**

---

## Steps

1. **Read context.** Read `CLAUDE.md` for project conventions and `BACKLOG.md` to locate the item. If the item isn't in the backlog, confirm scope before proceeding.

2. **Discuss requirements.** Ask clarifying questions until scope is unambiguous — what it does, what it doesn't do, edge cases, where data comes from and goes. Do not write files until scope is agreed.

3. **Mockup (if UI changes are involved).** Use the Preview tool to render a mockup of every affected state: default, loading, empty, error, and key edge cases. Iterate until approved. Mockup agreement is a prerequisite for implementation — never skip this step for visual changes.

4. **Identify affected files.** List every file that will be touched, with a one-line explanation of what changes and why.

5. **Write the plan** to `plans/<slug>.md`:
   - What we're building and why
   - Affected files (path → change description)
   - Implementation steps (numbered, ordered by dependency)
   - Numbered QA checklist organized by Part:
     - **Part 1: Feature works** — golden path end-to-end
     - **Part 2: Data layer** — API calls correct, writes land in the right place, schema matches
     - **Part 3: Edge cases** — empty state, error state, boundary inputs
     - **Part 4: Regressions** — existing behavior unaffected
   - Out of scope (explicit list — what this plan intentionally excludes)

6. **Update `BACKLOG.md`**: change item status from `unplanned` → `planned`.

7. **Confirm.** Output: "Plan saved to `plans/<slug>.md`. Ready to build — run `/feature <slug>` when you are."
