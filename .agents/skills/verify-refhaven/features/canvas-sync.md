# Canvas sync lab

The canvas sync lab is a throwaway page. It seeds a canvas of 1,000 items and lets a signed-in user move one item at a time under three sync designs, to compare how much data each change sends. It is a measuring tool, not the product's canvas.

## Sub-features

- `sync-seed` creates a canvas of 1,000 items for the user.
- `sync-modes` switches between `One live query`, `One live query, plain Convex`, and `Snapshot plus changes`.
- `sync-move` moves one item and shows how many items the last update carried and how long it took.

## How to get to it (user POV)

- Choose `Canvas sync with 1,000 items` under `Lab` on `/library`.
- Open `/lab/canvas-sync?mode=live` directly. The other modes are `plain` and `delta`.

## Driving it with Playwright

Preconditions:

- A signed-in user.

- **Seed.** Run `await page.goto("http://localhost:3000/lab/canvas-sync")` and `await page.getByRole("button", { name: "Seed 1,000 items" }).click()`. `page.getByTestId("item-count")` reads `1000`, and the URL gains `canvasId=...`.
- **Switch mode.** Choose a mode link by name, for example `await page.getByRole("link", { name: "Snapshot plus changes" }).click()`. The URL's `mode` becomes `delta` and the item count stays `1000`.
- **Move.** Run `await page.getByRole("button", { name: "Move one item" }).click()`, then wait for `[data-testid="applied"]` to have `data-moves="1"`. `page.getByTestId("resent")` reads `1000` in the two live modes and `1` in `delta` mode.
- **Proof.** Screenshot the page after a move in each mode. Read the timing from `[data-testid="applied"]`: `data-applied-at` minus `data-started-at` is the milliseconds the move took.

`apps/web/checks/canvas-sync.ts` runs the full measurement and prints bytes, timings, and server times. `ROUNDS=1 MOVES=2` makes a short run.

## Gotchas

- The link name `One live query` is also the start of `One live query, plain Convex`. Pass `exact: true` when you choose it.
- Each seed adds 1,000 documents to the shared dev deployment. Seed once per run and reuse the `canvasId` from the URL.
- In `delta` mode the count of resent items grows by one with each distinct item moved, until the page is reloaded.
- On the dev server the live modes sometimes receive the first result twice when the page opens. A production build does not.
- The canvas tables here belong to the user, not to a workspace. They are lab tables and will be replaced.
