# Sign in

Sign in lets a visitor create an account with a username and a passkey, stay signed in across reloads, sign out, and sign in again with the same passkey. A signed-out visitor who opens an app page is sent to the sign-in page.

## Sub-features

- `signin-guard` sends a signed-out visitor from an app page to `/sign-in`.
- `signin-signup` creates an account from a free username and a new passkey.
- `signin-session` keeps the session across a page reload.
- `signin-signout` ends the session and returns to `/sign-in`.
- `signin-return` signs an existing username in with its passkey.

## How to get to it (user POV)

- Open `/sign-in` directly.
- Open `/library` or `/c/{collectionId}` while signed out.
- Choose `Open your library` on the landing page `/` while signed out.

## Driving it with Playwright

Preconditions:

- A browser from `openPageWithPasskeyDevice()`. A browser without the passkey device cannot finish sign-up.
- A username no earlier run used, for example `` `verify-${Date.now().toString(36)}` ``.

- **Guard.** Open an app page signed out. Run `await page.goto("http://localhost:3000/library")` and `await page.waitForURL("http://localhost:3000/sign-in")`. The page shows the heading `Sign in`.
- **Guard from the landing page.** Run `await page.goto("http://localhost:3000/")` and `await page.getByRole("link", { name: "Open your library" }).click()`. The URL becomes `/sign-in`.
- **Sign up.** Fill the username and submit. Run `await page.getByLabel("Username").fill(username)` and `await page.getByRole("button", { name: "Continue with a passkey" }).click()`, then `await page.waitForURL("http://localhost:3000/library")`. `page.getByTestId("username")` shows the username and `page.getByTestId("user-id")` shows an ID.
- **Session.** Run `await page.reload()`. `page.getByTestId("user-id")` shows the same ID.
- **Sign out.** Run `await page.getByRole("button", { name: "Sign out" }).click()` and `await page.waitForURL("http://localhost:3000/sign-in")`.
- **Sign in again.** Repeat the sign-up step with the same username in the same browser. `page.getByTestId("user-id")` shows the same ID as before.
- **Proof.** Screenshot `/library` after sign-up and after the second sign-in. Confirm the account with `verify.sh rows users 5`, where the newest row's `_id` equals the text of `page.getByTestId("user-id")`. The sidebar shows the username. The ID and the greeting are in the page for the checks, in `hidden` elements.

`apps/web/checks/auth.ts` runs this journey. `signInWithPasskey(page, username)` in `apps/web/checks/browser.ts` does the sign-up step.

## Gotchas

- The same form signs up and signs in. A free username creates an account. A taken username asks for its passkey.
- The passkey lives in the virtual device of one browser instance. A second browser cannot sign in to the first one's username.
- The submit button reads `Waiting for your passkey…` and is disabled while the ceremony runs.
- Visiting `/sign-in` while signed in redirects to `/library`. Sign out first to drive sign-in again.
- A failed ceremony shows its error code in an element with `role="alert"`.
