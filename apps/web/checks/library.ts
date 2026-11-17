import { createHash } from "node:crypto";
import { api } from "@refhaven/backend/api";
import { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  assert,
  clientFor,
  convexUrl,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const isWebp = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
  Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";

const bytesAt = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

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
  const large = await pngOf(page, "rgb(200, 30, 30)", 3000, 2000);
  const small = await pngOf(page, "rgb(30, 30, 200)", 300);

  await page.getByLabel("Add images").setInputFiles([
    { name: "large.png", mimeType: "image/png", buffer: large },
    { name: "small.png", mimeType: "image/png", buffer: small },
  ]);
  await outcomes(page).nth(1).waitFor();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")];
    return images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  if (process.env.EVIDENCE) {
    await page.screenshot({ path: `${process.env.EVIDENCE}/01-saved.png`, fullPage: true });
  }
  assert(
    (await cards(page).locator("p").allTextContents()).join() === "small.png,large.png",
    `two saved images show in the library, newest first, and both load: ${await outcomes(page).allTextContents()}`,
  );

  const workspaceId = uploads[0]!.split("/")[2];
  const expectedUploads = [
    `/w/${workspaceId}/o/${sha256(large)}`,
    `/w/${workspaceId}/v/${sha256(large)}/512.webp`,
    `/w/${workspaceId}/v/${sha256(large)}/2048.webp`,
    `/w/${workspaceId}/o/${sha256(small)}`,
  ];
  assert(
    uploads.length === expectedUploads.length &&
      expectedUploads.every((path) => uploads.some((upload) => upload.endsWith(path))),
    `the 3000 by 2000 image uploaded its original, 512.webp, and 2048.webp under w/{workspace}/v/{sha256}, and the 300 px image its original only: ${uploads.map((path) => path.replace(/[0-9a-f]{56}/, "…"))}`,
  );

  const naturalSize = (name: string) =>
    cards(page)
      .filter({ hasText: name })
      .locator("img")
      .evaluate((image: HTMLImageElement) => `${image.naturalWidth}x${image.naturalHeight}`);
  const largeShown = await naturalSize("large.png");
  assert(
    largeShown === "512x341",
    `the grid shows the large image's thumbnail, with a longer edge of 512: ${largeShown}`,
  );
  const smallShown = await naturalSize("small.png");
  assert(
    smallShown === "300x300",
    `the grid shows the 300 px image at its own size: ${smallShown}`,
  );

  const smallUrl = await cards(page)
    .filter({ hasText: "small.png" })
    .locator("img")
    .getAttribute("src");
  assert(
    sha256(await bytesAt(smallUrl!)) === sha256(small),
    "an image with no thumbnail serves its original bytes unchanged in the grid",
  );

  const refetched = await page.evaluate(
    (url) =>
      fetch(url).then(
        () => "ok",
        (error: Error) => error.message,
      ),
    smallUrl!,
  );
  assert(
    refetched === "ok",
    `an image the grid already showed can be fetched again for a canvas from the same URL: ${refetched}`,
  );

  await page.route("**/*.r2.cloudflarestorage.com/**", (route) =>
    route.request().method() === "GET" ? route.abort() : route.continue(),
  );
  await page.reload();
  await cards(page).nth(1).waitFor();
  const placeholders = await page
    .locator("[data-ref-id] img")
    .evaluateAll((images: HTMLImageElement[]) =>
      images.map((image) => image.style.backgroundImage.slice(0, 26)),
    );
  assert(
    placeholders.length === 2 &&
      placeholders.every((value) => value === 'url("data:image/png;base64'),
    `before its thumbnail loads, each image shows its ThumbHash as a background: ${placeholders}`,
  );
  await page.unroute("**/*.r2.cloudflarestorage.com/**");
  await page.reload();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")];
    return (
      images.length === 2 &&
      images.every((image) => image.naturalWidth > 0 && image.style.backgroundImage === "")
    );
  });
  assert(true, "once the thumbnails load, the ThumbHash background is gone");

  await page
    .getByLabel("Add images")
    .setInputFiles([{ name: "large-again.png", mimeType: "image/png", buffer: large }]);
  await outcomes(page).nth(0).waitFor();
  await cards(page).nth(2).waitFor();
  if (process.env.EVIDENCE) {
    await page.screenshot({ path: `${process.env.EVIDENCE}/02-duplicate.png`, fullPage: true });
  }
  assert(
    (await outcomes(page).nth(0).textContent())!.includes("already had this image") &&
      uploads.length === expectedUploads.length,
    `saving the same bytes again adds a Ref, uploads nothing, and says so: ${await outcomes(page).nth(0).textContent()}`,
  );

  const ownRows = async (table: "refs" | "blobs") =>
    (await rows(table)).filter((row) => row.workspaceId === workspaceId);
  const originals = (await ownRows("refs")).map((ref) => ref.blobs.original);
  const blobs = await ownRows("blobs");
  assert(
    originals.length === 3 && new Set(originals).size === 2 && blobs.length === 2,
    `the database holds 3 Refs on 2 Blobs for this workspace: ${originals.map((id: string) => id.slice(-4))}`,
  );

  const owner = await clientFor(page);
  const largeRefId = await cards(page).nth(0).getAttribute("data-ref-id");
  const signed = async (role: "original" | "thumbnail" | "display", refId = largeRefId) =>
    (await owner.mutation(api.library.urls, { refIds: [refId as never], role }))[0]!.url;
  const largeBlob = blobs.find((blob) => blob.sha256 === sha256(large));
  const smallBlob = blobs.find((blob) => blob.sha256 === sha256(small));
  const thumbnailBytes = await bytesAt(await signed("thumbnail"));
  const displayUrl = await signed("display");
  const displayBytes = await bytesAt(displayUrl);
  const displayShown = await page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    return `${bitmap.width}x${bitmap.height}`;
  }, displayUrl);
  assert(displayShown === "2048x1365", `the display role serves the 2048 px copy: ${displayShown}`);
  assert(
    isWebp(thumbnailBytes) &&
      isWebp(displayBytes) &&
      JSON.stringify(largeBlob.variants) ===
        JSON.stringify({
          display: { byteSize: displayBytes.length, height: 1365, width: 2048 },
          thumbnail: { byteSize: thumbnailBytes.length, height: 341, width: 512 },
        }),
    `the large Blob records both WebP variants with their pixel size and the byte size R2 holds: ${JSON.stringify(largeBlob.variants)}`,
  );
  assert(
    typeof largeBlob.thumbHash === "string" &&
      typeof smallBlob.thumbHash === "string" &&
      smallBlob.variants &&
      Object.keys(smallBlob.variants).length === 0,
    `both Blobs record a ThumbHash, and the 300 px Blob records no variant: ${JSON.stringify(smallBlob)}`,
  );
  assert(
    sha256(await bytesAt(await signed("original"))) === sha256(large),
    "the original role serves the original bytes unchanged",
  );

  const thumbHash = largeBlob.thumbHash as string;
  const image = { fileName: "x.png", width: 10, height: 10, thumbHash, variants: {} };
  assert(
    (await outcome(owner.action(api.library.save, { ...image, sha256: "0".repeat(64) }))) ===
      "UploadNotFound",
    "saving a hash that was never uploaded fails with UploadNotFound",
  );

  type Upload = { url: string; headers: Record<string, string> };
  const put = async ({ url, headers }: Upload, body: Uint8Array<ArrayBuffer>) =>
    (
      await fetch(url, {
        method: "PUT",
        body,
        headers: { "Content-Type": "image/png", ...headers },
      })
    ).status;
  const putEach = (prepared: ReadonlyArray<Upload>, body: Uint8Array<ArrayBuffer>) =>
    Promise.all(prepared.map((upload) => put(upload, body)));

  const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
  const preparedHtml = await owner.mutation(api.library.prepareUpload, {
    sha256: sha256(html),
    roles: [],
  });
  assert(
    preparedHtml.length === 1 && preparedHtml[0]!.role === "original",
    "a new hash gets an upload URL for its original",
  );
  await putEach(preparedHtml, html);
  assert(
    (await outcome(owner.action(api.library.save, { ...image, sha256: sha256(html) }))) ===
      "UnsupportedImage",
    "HTML uploaded with an image content type fails with UnsupportedImage",
  );

  const green = await pngOf(page, "rgb(30, 200, 30)", 600);
  const preparedGreen = await owner.mutation(api.library.prepareUpload, {
    sha256: sha256(green),
    roles: ["thumbnail"],
  });
  assert(
    preparedGreen.map(({ role }) => role).join() === "original,thumbnail",
    "a new hash gets an upload URL for its original and for each requested role",
  );
  await putEach(preparedGreen, green);
  const greenImage = { ...image, width: 600, height: 600, sha256: sha256(green) };
  assert(
    (await outcome(
      owner.action(api.library.save, {
        ...greenImage,
        variants: { thumbnail: { width: 512, height: 512 } },
      }),
    )) === "UnsupportedImage",
    "a PNG object claimed as a WebP thumbnail fails with UnsupportedImage",
  );
  const oversized = await outcome(
    owner.action(api.library.save, {
      ...greenImage,
      variants: { thumbnail: { width: 513, height: 300 } },
    }),
  );
  assert(
    oversized.includes("between 1 and 512"),
    `a thumbnail claimed at 513 px is refused for its size: ${oversized}`,
  );

  const uppercase = await outcome(
    owner.action(api.library.save, { ...image, sha256: sha256(large).toUpperCase() }),
  );
  assert(uppercase !== "accepted", `an uppercase hash is ${uppercase}`);
  const zeroWidth = await outcome(
    owner.action(api.library.save, { ...image, width: 0, sha256: sha256(large) }),
  );
  assert(zeroWidth !== "accepted", `a width of 0 is ${zeroWidth}`);
  assert((await cards(page).count()) === 3, "none of the refused saves added a Ref");

  const teal = await pngOf(page, "rgb(30, 200, 200)", 40);
  const tealImage = { ...image, width: 40, height: 40, sha256: sha256(teal) };
  const [tealUpload] = await owner.mutation(api.library.prepareUpload, {
    sha256: sha256(teal),
    roles: [],
  });
  const wrongBytes = await put(tealUpload!, small);
  assert(
    wrongBytes === 400 &&
      (await outcome(owner.action(api.library.save, tealImage))) === "UploadNotFound",
    `R2 refuses bytes that do not match the hash their upload URL was signed for, and stores nothing: ${wrongBytes}`,
  );
  const noHash = await put({ ...tealUpload!, headers: {} }, teal);
  assert(noHash === 403, `R2 refuses the right bytes sent without their hash: ${noHash}`);
  const rightBytes = await put(tealUpload!, teal);
  const tealRef = await owner.action(api.library.save, tealImage);
  assert(
    rightBytes === 200 && tealRef.duplicate === false,
    `R2 stores the bytes that match the hash, and the save records them: ${rightBytes}`,
  );
  const replaced = await put(tealUpload!, small);
  assert(
    replaced === 400 &&
      sha256(await bytesAt(await signed("original", tealRef.refId))) === sha256(teal),
    `after the save, the same upload URL cannot replace the stored bytes: ${replaced}`,
  );

  const earlierUrl = await signed("thumbnail");
  await Bun.sleep(1100);
  assert(
    earlierUrl !== (await signed("thumbnail")),
    "each request for a URL signs a fresh one, so an expired URL is never handed out again",
  );

  await page.getByLabel("Add images").setInputFiles([
    {
      name: " outer spaces.png ",
      mimeType: "image/png",
      buffer: await pngOf(page, "rgb(90, 90, 90)", 30),
    },
  ]);
  await page.locator("[data-ref-id]").filter({ hasText: "outer spaces.png" }).waitFor();
  assert(
    (await page.locator("[data-ref-id] p").first().textContent()) === "outer spaces.png",
    "a file whose name has outer spaces is saved under the trimmed name",
  );

  await signInWithPasskey(second.page, `check-b-${stamp}`);
  await second.page.getByText("Nothing saved yet.").waitFor();
  assert(true, "a second user's library is empty");

  const other = await clientFor(second.page);
  for (const role of ["original", "thumbnail", "display"] as const) {
    assert(
      (await outcome(other.mutation(api.library.urls, { refIds: [largeRefId as never], role }))) ===
        "RefNotFound",
      `the second user cannot get the ${role} URL of the first user's Ref`,
    );
  }
  assert(
    (await outcome(other.action(api.library.save, { ...image, sha256: sha256(large) }))) ===
      "UploadNotFound",
    "the second user cannot claim the first user's bytes by their hash",
  );
  assert(
    (
      await other.mutation(api.library.prepareUpload, {
        sha256: sha256(large),
        roles: ["thumbnail", "display"],
      })
    )
      .map(({ role }) => role)
      .join() === "original,thumbnail,display",
    "bytes and their variants are stored once per workspace, so the second user must upload them too",
  );

  await second.page.route("**/*.r2.cloudflarestorage.com/**", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await second.page.getByLabel("Add images").setInputFiles([
    { name: "large.png", mimeType: "image/png", buffer: large },
    { name: "small.png", mimeType: "image/png", buffer: small },
  ]);
  await outcomes(second.page).nth(1).waitFor();
  assert(
    (await second.page.locator('[role="status"] li[data-outcome="rejected"]').count()) === 2 &&
      (await cards(second.page).count()) === 0,
    `when the upload to R2 fails, each file gets an outcome and nothing is saved: ${await outcomes(second.page).allTextContents()}`,
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
