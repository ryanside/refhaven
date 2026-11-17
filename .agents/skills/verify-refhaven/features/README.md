# refhaven verification map

This directory is the maintained source for verifying the user-facing behavior of refhaven. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- `verify.sh up` printed `ready:` for this checkout, and `verify.sh doctor` ends with `doctor: healthy`.
- The app is at `http://localhost:3000`.
- Every recipe starts signed out, in a new browser from `openPageWithPasskeyDevice()`, and signs up a username that no earlier run used.
- Saving images and the canvas need the four R2 variables on the deployment. `doctor` warns when they are missing.

## Driving conventions

- Write Playwright scripts under the run's scratch directory and run them with `verify.sh drive <run> <feature> <script>`.
- Target elements by role and accessible name or by the `data-` attributes the recipes name. Avoid CSS classes and DOM position.
- Wait on an outcome with `waitFor`, `waitForURL`, or `waitForFunction`. Use no fixed sleeps.
- A new user starts with an empty library. Make the test images in the page with a canvas, as `apps/web/checks/library.ts` does in `pngOf`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a screenshot plus an `assert` line in the transcript.
- A write is proven by a second view: `verify.sh rows <table>`, filtered to the run's workspace, or a second user's page.
- Record the feature and the entry point with every artifact.
- Report an unreachable path with the command you tried and the precondition that failed.
- Never report a skipped entry point as verified through a different path.
- End a check with `assertClean()` from `consoleWatch()` in `apps/web/checks/browser.ts`. It fails on any error a page logged, except `net::ERR_NETWORK_CHANGED`, which Chromium logs when the machine's network changes. It prints a `note` line for those. Repeat that note in your report.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Playwright` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact call and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign in](./sign-in.md) covers passkey sign-up, the session, sign-out, sign-in, and the redirect for a signed-out visitor.
- [Library](./library.md) covers saving images, a duplicate, the grid, and what a second user can see.
- [Collections](./collections.md) covers making, opening, renaming, and filling a collection, and what a second user can see.
- [Trash](./trash.md) covers deleting an image, the trash page, restoring an image to every place it was, and what a second user can do.
- [Image page](./ref-page.md) covers one image's page at `/r/{refId}`: its name, note, source, tags, collections, delete and restore, and what a second user sees.
- [Search](./search.md) covers the search field and the tag filter on the library's and a collection's gallery, the URL, the back button, and what a second user finds.
- [Canvas](./canvas.md) covers the canvas view of the library and of a collection: pan, zoom, selection by click and marquee, bring to front and send to back, saved moves, resizing and turning the selection, a second page, the 2048 px copy, images dropped, pasted, or picked onto it, removing images, undo and redo, the shortcuts, and putting removed images back.
