# [App Name] — Build Journal

Append-only record of how this app got built. **Newest entry at the top. Never edit or delete a past entry** — if something turned out wrong, add a new entry saying so.

## What this file is for

`CLAUDE.md` says what the app **is now**. This file says **why it is that way**, so the app can be rebuilt clean from scratch without re-walking any dead end.

Together they are the rebuild spec:
- `CLAUDE.md` → the target (stack, schema, API, deploy)
- `JOURNAL.md` → the traps (what we tried, what broke, what we rejected and why)
- `plans/<slug>.md` → the agreed design for each feature, as of the day it was built

A future rebuild reads `CLAUDE.md` to know what to build, then skims this file to know what not to try.

## How to write an entry

Written by `/sync` at the end of every session that changed behaviour. One entry per shipped change. Keep **Rejected** and **Gotchas** honest and specific — they are the two fields that make a rebuild cheaper, and the two most often left vague.

---

## Rebuild notes — load-bearing decisions

Decisions that would be expensive or dangerous to get wrong on a rebuild. Promoted here from entries below when a decision proves structural. Keep this list short.

| # | Decision | Why | Entry |
|---|----------|-----|-------|
| 1 | [e.g. Films keyed by TMDB ID, never by title] | [Title matching mis-hits remakes and foreign releases] | [2026-08-19] |

---

## Entries

### [YYYY-MM-DD] — [Feature name]

**Branch:** `feature/<slug>` · **Plan:** `plans/<slug>.md` · **Status:** shipped

**What changed**
- [User-visible behaviour, one bullet each. What someone using the app would notice.]

**Why**
- [The reasoning. What problem this solved, what constraint forced this shape.]

**Rejected**
- [Alternative considered] — [why it lost. Be specific: "slower" is useless, "needed a server, which breaks the zero-cost hosting constraint" is useful.]

**Gotchas discovered**
- [What broke unexpectedly, the real fix, and why the naive approach fails. Copy the entry into the Known Gotchas section of CLAUDE.md too — that is where it gets read during a build; here is where it gets read during a rebuild.]

**Files touched**
- `path/to/file` — [what changed in it]

---

*(No entries yet — the first `/sync` writes here.)*
