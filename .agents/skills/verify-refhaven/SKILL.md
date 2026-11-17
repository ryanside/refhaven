---
name: verify-refhaven
description: Launch refhaven's web app (TanStack Start on http://localhost:3000 against the Convex dev deployment) and drive it in headless Chromium with a virtual passkey device to prove a change works. Use when asked to verify, demo, screenshot, or reproduce refhaven behavior in the real app, or when a change to apps/web or packages/backend needs runtime evidence.
---

# Verify refhaven

Run every command from the root of the checkout you are verifying. `H=.agents/skills/verify-refhaven/scripts/verify.sh`.

refhaven runs as **one instance per machine**. A passkey is bound to `http://localhost:3000`, and the R2 bucket's CORS policy lists that origin only, so the web app cannot move to another port. The backend is one shared Convex dev deployment, and `convex dev` pushes the checkout's functions to it. Runs stay apart by user: each drive signs up a new username and sees only its own workspace.

The web UI is the only surface. The CLI and the MCP server do not exist yet.

## Launch

```bash
$H up
```

It prints `ready: run=<run> url=http://localhost:3000 mode=<started|reused> evidence=<dir> scratch=<dir>`. Keep `<run>` for every later command.

- `mode=reused` means a dev server from this checkout already owns port 3000, usually the operator's own `bun dev`. The run drives it and never stops it.
- `mode=started` means the run started `bun dev` itself. Ready means the page answers 200, `convex dev` has pushed the functions, and `confect dev` has finished codegen. Allow up to three minutes.
- `up` stops with an error when another process owns port 3000, or when another checkout runs `convex dev` against the same deployment. Report the error to the operator. It names the path that holds the instance.

The dev server hot-reloads the web app and re-pushes the backend on every save. Before you drive a backend change, run `$H doctor <run>`. It waits up to 20 seconds for the push and fails when a backend file is newer than the last push.

No seed data is needed. A drive signs up its own user through the real sign-in page.

## Doctor

```bash
$H doctor [run]
```

Read-only. It checks that the backend targets a dev deployment, that port 3000 is served from this checkout, that `/` and `/sign-in` answer 200, that the deployment has exactly this checkout's functions by name, that the last push is newer than every backend file, that the deployment has the R2 variables, and that headless Chromium starts. The push check needs the dev server's log, so it only warns unless you name a run whose `up` printed `mode=started`. Run it first whenever anything looks off. Drive only when it ends with `doctor: healthy`.

## Drive

Sign-in needs a passkey, so the harness is Playwright with Chromium's virtual passkey device. T3's `preview_*` tools cannot answer a passkey prompt. The helpers are in `apps/web/checks/browser.ts`:

- `openPageWithPasskeyDevice()` returns `{ browser, page, cdp }` with a passkey device attached.
- `signInWithPasskey(page, username)` signs up or signs in on `/sign-in` and waits for `/library`.
- `accessToken(page)` returns the session token, for a second view through `ConvexHttpClient`.
- `assert(condition, message)` prints `ok   <message>` or throws `FAIL <message>`.

Write a drive script in the scratch directory that `up` printed. It must live under `apps/web` to import Playwright.

```ts
// apps/web/checks/scratch/<run>/library.ts
import { assert, openPageWithPasskeyDevice, signInWithPasskey } from "../../browser";

const evidence = process.env.EVIDENCE!;
const { browser, page } = await openPageWithPasskeyDevice();
try {
  await signInWithPasskey(page, `verify-${Date.now().toString(36)}`);
  await page.screenshot({ path: `${evidence}/01-signed-in.png`, fullPage: true });
  assert((await page.getByText("Nothing saved yet.").count()) === 1, "a new user's library is empty");
} finally {
  await browser.close();
}
```

```bash
$H drive <run> <feature> apps/web/checks/scratch/<run>/library.ts
```

`drive` runs the script with the backend's env file, sets `EVIDENCE` to the feature's evidence directory, copies the script there, and saves the output as `transcript.txt`. Its exit code is the script's.

`features/README.md` indexes the user-facing features. Each feature file is the recipe for that feature, with its selectors. A proof covers every entry point the feature file lists.

The scripts in `apps/web/checks` are the standing regression checks. Run one through the same command, for example `$H drive <run> library apps/web/checks/library.ts`.

Read state outside the browser for a second view:

```bash
$H rows <table> [limit]   # rows of a Convex table as JSON lines, newest first
$H logs [count]           # recent Convex function calls with their timings and errors
```

## Evidence

Everything goes under `~/.cache/verify-refhaven/<run>/evidence/<feature>/`. `$H down` keeps this directory.

- Drive the real user path. Click and type in the page. Call a Convex function directly only to prove a rule the UI cannot reach, such as a second user asking for the first user's image.
- Capture the action and the resulting state. Take a screenshot after each step that changes the page, and assert the state with `assert` so the transcript records it.
- Prove a side effect with a second view: the row in `$H rows`, the function call in `$H logs`, or the bytes behind a signed URL.
- Record the run and the feature in each report. `transcript.txt` and the copied script show what ran.

## Cleanup

```bash
$H down <run>
```

It stops the dev server only when this run started it. It interrupts the process tree it recorded at launch, waits until every process in it has exited, and fails if port 3000 is still in use. It removes the run's scratch directory and prints the evidence path it kept. Run `down` after every failed attempt too.

Test users, their images, and their R2 objects stay in the dev deployment. Nothing deletes them yet.

## Gotchas

- Open `http://localhost:3000`, never `127.0.0.1:3000`. The passkey and the R2 CORS policy are bound to the `localhost` origin.
- The dev deployment is shared and keeps every earlier run's data. Assert on the run's own user and workspace, never on a table's total row count.
- Each username is a new account. Reuse one username inside a script to sign in again with the same passkey. The passkey lives in that browser instance only.
- A fresh git worktree has no `packages/backend/.env.local`. `up` prints the copy command.
- `convex dev` type-checks before it pushes. A type error leaves the old functions deployed, and `doctor` then reports the functions that differ.
- `convex dev` can miss a save that changes only files under `confect/`. `doctor` compares function names, not code, so it stays healthy. After a backend change, wait for a new `Convex functions ready!` line in the run's `dev.log`. If none comes, touch the group's file under `packages/backend/convex/`.
