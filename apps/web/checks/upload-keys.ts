import { api } from "@refhaven/backend/api";
import { ConvexHttpClient } from "convex/browser";
import {
  accessToken,
  assert,
  convexUrl,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser";

const outcome = (call: Promise<unknown>) =>
  call.then(
    () => "accepted",
    (error: Error) => `refused: ${error.message.split("\n")[1] ?? error.message}`,
  );

const anonymous = new ConvexHttpClient(convexUrl());
const anonymousSync = await outcome(
  anonymous.mutation(api.images.syncMetadata, { key: "u/anyone/x" }),
);
assert(anonymousSync.startsWith("refused"), `syncMetadata without a session is ${anonymousSync}`);
const anonymousUrl = await outcome(anonymous.mutation(api.images.generateUploadUrl, {}));
assert(
  anonymousUrl.startsWith("refused"),
  `generateUploadUrl without a session is ${anonymousUrl}`,
);

const { browser, page } = await openPageWithPasskeyDevice();
try {
  await signInWithPasskey(page, `check-${Date.now().toString(36)}`);
  const userId = await page.getByTestId("user-id").textContent();
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(await accessToken(page));

  const foreign = await outcome(
    client.mutation(api.images.syncMetadata, { key: "u/someone-else/secret.png" }),
  );
  assert(foreign.startsWith("refused"), `claiming a key under another user's prefix is ${foreign}`);

  const unprefixed = await outcome(client.mutation(api.images.syncMetadata, { key: "secret.png" }));
  assert(unprefixed.startsWith("refused"), `claiming a key with no prefix is ${unprefixed}`);

  const listed = await client.query(api.images.list, {});
  assert(listed.length === 0, "neither refused key shows up in the caller's image list");

  const own = await outcome(client.mutation(api.images.syncMetadata, { key: `u/${userId}/check` }));
  assert(own === "accepted", `claiming a key under the caller's own prefix is ${own}`);
} finally {
  await browser.close();
}
