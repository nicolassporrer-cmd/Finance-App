# claude-code-starter

A starter template for building Claude Code apps. Includes the workflow commands, CLAUDE.md template, and all best practices pre-wired — so you can focus on your app, not the scaffolding.

## What's included

| File | What it gives you |
|------|-------------------|
| `CLAUDE.md` | Project bible template — fill in your app details; best practices are pre-written |
| `BACKLOG.md` | Prioritized backlog with lifecycle status |
| `JOURNAL.md` | Append-only build log — why the app is the way it is, so it can be rebuilt clean |
| `.claude/commands/plan.md` | `/plan` — design-before-build, mockup-first planning |
| `.claude/commands/feature.md` | `/feature` — implement, deploy, run QA automatically |
| `.claude/commands/qa.md` | `/qa` — rebuild harness, verify, numbered checklist |
| `.claude/commands/sync.md` | `/sync` — merge, push, update docs, session summary |
| `.claude/commands/improve-prompt.md` | `/improve-prompt` — learn from every session |
| `.gitignore` | Excludes credentials, generated files, session data |

## How to use

1. Click **Use this template** to create a new repo
2. Open it in Claude Code
3. Fill in the `[FILL_IN]` sections in `CLAUDE.md`:
   - App description + stack
   - Working preferences
   - Files table
   - Deploy command
   - Data layer and API
4. Start building: `/plan <first-feature>`

## The workflow

```
/plan <item>      ← agree on design + mockup before touching code
/feature <item>   ← implement, deploy, auto-runs QA
/qa               ← verify, numbered checklist by Part
/sync             ← merge, push, update docs
/improve-prompt   ← learn from the session, keep docs sharp
```

## Why this exists

Built from patterns learned while building Kenza's Assistant at Actabl — a RevOps dashboard with 60+ shipped features. The best practices here are battle-tested against real production use.

Reference: Claude Code Guidelines (Actabl Confluence) — the universal principles this starter encodes.
