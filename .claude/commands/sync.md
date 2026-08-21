# Sync

Session closer. Merges the feature branch, commits changes, updates documentation, and summarizes the session.

---

## Steps

1. **Verify QA passed.** If QA hasn't passed for the current feature, stop: "QA hasn't passed — resolve open issues before syncing."

2. **Merge feature branch** (if one is open):
   ```
   git checkout main
   git merge feature/<slug>
   git push origin main
   git branch -d feature/<slug>
   ```
   If working directly on `main` (config/doc sessions): skip this step.

3. **Commit remaining changes.** Stage and commit any uncommitted changes to tracked files (CLAUDE.md, BACKLOG.md, plans/, etc.) with a clear message.

4. **Update `BACKLOG.md`.** **Move** the shipped item's row out of `## Planned` and into `## Done` — don't just strike it through in place. A struck-through row still reads as a queue entry, so `## Planned` slowly stops answering "what's left to build" and the backlog misrepresents its own state to whoever reads it next. Carry the row's full detail across and drop the `~~…~~` so it matches the Done style; if the row is only a "shipped — see Done" pointer whose full entry already exists in Done, delete the pointer rather than moving a duplicate. Also catch rows whose notes say "Shipped"/"Done" but were never struck through — same problem, less visible. Update any other statuses that changed.

5. **Run `/improve-prompt`** if this session had a learnable output (EOD import, significant build, PROMPT.md equivalent). Skip for routine maintenance sessions.

6. **Write the JOURNAL.md entry.** Prepend a new entry at the top of the `## Entries` section using the template format. Fill in every field — **Rejected** and **Gotchas discovered** are the two that make a future rebuild cheaper, so never leave them as "n/a" without checking. If a decision made this session is structural (expensive or dangerous to get wrong on a rebuild), also add a row to the **Rebuild notes** table. Copy any gotcha into the Known Gotchas section of `CLAUDE.md` as well — same text, two audiences: CLAUDE.md is read while building, JOURNAL.md while rebuilding.

7. **Session summary.** Output: what shipped, what's pending, what's next.
