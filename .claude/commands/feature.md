# Feature

Implements the planned backlog item passed as `$ARGUMENTS`.

---

## Steps

1. **Check for a plan.** Read `plans/<slug>.md`. If it doesn't exist, output: "No plan found for `<slug>` — run `/plan <slug>` first." and stop.

2. **Read project context.** Read `CLAUDE.md` for deployment instructions, branch rules, and building conventions.

3. **Create a branch.** `git checkout -b feature/<slug>`

4. **Implement.** Follow the plan step by step. Apply all Building conventions and Data integrity rules from `CLAUDE.md`. Do not gold-plate — stay within plan scope.

5. **Deploy.** Run the deploy command from `CLAUDE.md`. Tell the user what to do next (e.g., "Hit Ctrl+Shift+R to see changes.").

6. **Run `/qa`** automatically — do not skip this step.

Do NOT merge or push to main. That happens in `/sync` after QA passes.
