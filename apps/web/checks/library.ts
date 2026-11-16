import { createHash } from "node:crypto";
import { api } from "@refhaven/backend/api";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { Page } from "playwright";
import {
  accessToken,
  assert,
  convexUrl,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const pngOf = async (page: Page, color: string, size: number) =>
  Buffer.from(
    await page.evaluate(
      ({ color, size }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d")!;
        context.fillStyle = color;
        context.fillRect(0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1]!;
      },
      { color, size },
    ),
    "base64",
  );

const outcome = (call: Promise<unknown>) =>
  call.then(
    () => "accepted",
    (error: Error) =>
      error instanceof ConvexError
        ? String(error.data._tag)
        : `refused (${error.message.split("\n")[1]?.trim()})`,
  );

const clientFor = async (page: Page) => {
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(await accessToken(page));
  return client;
};

const cards = (page: Page) => page.locator("[data-ref-id]");
const outcomes = (page: Page) => page.locator('[role="status"] li');
const stamp = Date.now().toString(36);

const anonymous = new ConvexHttpClient(convexUrl());
assert(
  (await outcome(
    anonymous.query(api.library.list, { paginationOpts: { numItems: 10, cursor: null } }),
  )) === "NotSignedIn",
  "listing the library without a session fails with NotSignedIn",
);

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
try {
  const { page } = first;
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes(".r2.cloudflarestorage.com")) {
      uploads.push(new URL(request.url()).pathname);
    }
  });

  await signInWithPasskey(page, `check-a-${stamp}`);
  const red = await pngOf(page, "rgb(200, 30, 30)", 64);
  const blue = await pngOf(page, "rgb(30, 30, 200)", 96);

  await page.getByLabel("Add images").setInputFiles([
    { name: "red.png", mimeType: "image/png", buffer: red },
    { name: "blue.png", mimeType: "image/png", buffer: blue },
  ]);
  await outcomes(page).nth(1).waitFor();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")];
    return images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  assert(
    (await cards(page).allTextContents()).join() === "blue.png,red.png",
    `two saved images show in the library, newest first, and both load: ${await outcomes(page).allTextContents()}`,
  );
  assert(
    uploads.length === 2 && uploads.every((path) => /\/w\/[^/]+\/o\/[0-9a-f]{64}$/.test(path)),
    `each image went to R2 once, under w/{workspace}/o/{sha256}: ${uploads.map((path) => path.replace(/[0-9a-f]{56}$/, "…"))}`,
  );
  assert(uploads[0]!.endsWith(sha256(red)), "the object key carries the SHA-256 of the file");

  const redUrl = await cards(page)
    .filter({ hasText: "red.png" })
    .locator("img")
    .getAttribute("src");
  const served = new Uint8Array(await (await fetch(redUrl!)).arrayBuffer());
  assert(sha256(served) === sha256(red), "the signed URL serves the original bytes unchanged");

  await page
    .getByLabel("Add images")
    .setInputFiles([{ name: "red-again.png", mimeType: "image/png", buffer: red }]);
  await outcomes(page).nth(2).waitFor();
  await cards(page).nth(2).waitFor();
  assert(
    (await outcomes(page).nth(2).textContent())!.includes("already had this image") &&
      uploads.length === 2,
    `saving the same bytes again adds a Ref, uploads nothing, and says so: ${await outcomes(page).nth(2).textContent()}`,
  );

  const owner = await clientFor(page);
  const image = { fileName: "x.png", width: 10, height: 10 };
  assert(
    (await outcome(owner.action(api.library.save, { ...image, sha256: "0".repeat(64) }))) ===
      "UploadNotFound",
    "saving a hash that was never uploaded fails with UploadNotFound",
  );

  const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
  const prepared = await owner.mutation(api.library.prepareUpload, { sha256: sha256(html) });
  assert(prepared.status === "upload", "a new hash gets an upload URL");
  if (prepared.status === "upload") {
    await fetch(prepared.url, {
      method: "PUT",
      body: html,
      headers: { "Content-Type": "image/png" },
    });
  }
  assert(
    (await outcome(owner.action(api.library.save, { ...image, sha256: sha256(html) }))) ===
      "UnsupportedImage",
    "HTML uploaded with an image content type fails with UnsupportedImage",
  );

  const uppercase = await outcome(
    owner.action(api.library.save, { ...image, sha256: sha256(red).toUpperCase() }),
  );
  assert(uppercase !== "accepted", `an uppercase hash is ${uppercase}`);
  const zeroWidth = await outcome(
    owner.action(api.library.save, { ...image, width: 0, sha256: sha256(red) }),
  );
  assert(zeroWidth !== "accepted", `a width of 0 is ${zeroWidth}`);
  assert((await cards(page).count()) === 3, "none of the refused saves added a Ref");

  await signInWithPasskey(second.page, `check-b-${stamp}`);
  await second.page.getByText("Nothing saved yet.").waitFor();
  assert(true, "a second user's library is empty");

  const other = await clientFor(second.page);
  const ownerRefId = await cards(page).first().getAttribute("data-ref-id");
  assert(
    (await outcome(other.query(api.library.urls, { refIds: [ownerRefId as never] }))) ===
      "RefNotFound",
    "the second user cannot get a URL for the first user's Ref",
  );
  assert(
    (await outcome(other.action(api.library.save, { ...image, sha256: sha256(red) }))) ===
      "UploadNotFound",
    "the second user cannot claim the first user's bytes by their hash",
  );
  assert(
    (await other.mutation(api.library.prepareUpload, { sha256: sha256(red) })).status === "upload",
    "bytes are stored once per workspace, so the second user must upload them too",
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
