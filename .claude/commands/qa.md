# QA

Rebuilds the local test harness, runs automated checks, and presents a numbered QA checklist. Called automatically by `/feature` after every deploy.

---

## Steps

1. **Rebuild local harness.** If a build-local script is defined in `CLAUDE.md`, run it to regenerate the local test harness with current data shapes.

2. **Start preview server** if not already running.

3. **Verify.** Use preview tools (screenshot, snapshot, click, fill, console logs) to walk the golden path. Check for JS console errors, network errors, and broken layout.

   **To QA an error path, induce the failure.** A real network or server failure is rare and not reproducible on demand, so error states (Part 3 below) get skipped as "untestable" — and writing bad data to force one is never acceptable. Instead patch `window.fetch` in the page to fail only the request you care about:

   ```js
   window.__origFetch = window.fetch
   window.fetch = function (input, init) {
     const m = ((init && init.method) || 'GET').toUpperCase()
     if (m === 'PATCH') return Promise.resolve(new Response('{}', { status: 500 }))
     return window.__origFetch.apply(this, arguments)
   }
   // …drive the UI, assert the error actually surfaced…
   window.fetch = window.__origFetch   // restore, then re-test the happy path
   ```

   Nothing reaches the database, so live data is never at risk. **Always re-test the happy path after restoring**, and confirm the forced-fail write did *not* persist — that also proves any optimistic-update rollback worked. Expect the forced failures to show up as logged console errors: that is the error handling working, not a finding.

   **If the page renders but automated snapshots come back empty** (a `0x0` viewport, an empty accessibility tree) while the DOM is demonstrably live, don't conclude the feature is broken — drive and assert through JS evaluation instead: enumerate controls with `document.querySelectorAll('button')`, click via a real `.click()` (which fires framework handlers properly, unlike a synthetic `dispatchEvent('input')`, which often leaves framework state untouched and produces a false pass), and read state from `document.body.innerText`.

4. **Present QA checklist** — numbered, prescriptive steps organized by Part:

   **Part 1: Feature works**
   [Golden path steps specific to what was built — be prescriptive, not vague]

   **Part 2: Data layer**
   [API called with correct params, data written to the right place, schema matches expectations]

   **Part 3: Edge cases**
   [Empty state, error state, boundary inputs, concurrent or rapid actions]

   **Part 4: Regressions**
   [Key existing behaviors to confirm are unaffected — search, navigation, other major panels]

5. **Wait.** After presenting the checklist, wait for the user's feedback. Do NOT call `/sync`.
