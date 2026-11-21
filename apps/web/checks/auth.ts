import { api } from "@refhaven/backend/api";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { chromium } from "playwright";
import { appUrl, assert, convexUrl, openPageWithPasskeyDevice, signInWithPasskey } from "./browser";

const username = `check-${Date.now().toString(36)}`;

const anonymous = new ConvexHttpClient(convexUrl());
const refusal = await anonymous.query(api.users.whoAmI, { greeting: "Hello" }).then(
  () => null,
  (error: unknown) => error,
);
assert(
  refusal instanceof ConvexError && refusal.data._tag === "NotSignedIn",
  `a query without a session is refused: ${JSON.stringify((refusal as ConvexError<any>)?.data)}`,
);

// Passkey autofill starts on its own and fails in a browser with no passkey. That is not the
// visitor's doing, so the page says nothing about it.
const bare = await chromium.launch();
try {
  const page = await bare.newPage();
  await page.goto(`${appUrl}/sign-in`);
  await page.getByLabel("Username").waitFor();
  await page.waitForTimeout(2000);
  const alerts = await page.getByRole("alert").allTextContents();
  assert(
    alerts.length === 0,
    `a browser with no passkey sees no error on /sign-in: ${JSON.stringify(alerts)}`,
  );
} finally {
  await bare.close();
}

const { browser, page } = await openPageWithPasskeyDevice();
try {
  await page.goto(`${appUrl}/library`);
  await page.waitForURL(`${appUrl}/sign-in`);
  assert(true, "/library without a session redirects to /sign-in");

  await signInWithPasskey(page, username);
  const firstUserId = await page.getByTestId("user-id").textContent();
  assert(
    (await page.getByTestId("username").textContent()) === username,
    `sign-up with a passkey shows the user on /library: ${username} ${firstUserId}`,
  );

  await page.reload();
  assert(
    (await page.getByTestId("user-id").textContent()) === firstUserId,
    "the session survives a page reload",
  );

  await page.getByTestId("username").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(`${appUrl}/sign-in`);
  assert(true, "sign-out returns to /sign-in");

  await signInWithPasskey(page, username);
  assert(
    (await page.getByTestId("user-id").textContent()) === firstUserId,
    `sign-in with the same passkey returns the same user: ${firstUserId}`,
  );

  if (process.env.SCREENSHOT) {
    await page.screenshot({ path: process.env.SCREENSHOT });
  }
} finally {
  await browser.close();
}
