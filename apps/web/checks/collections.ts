import { createHash } from "node:crypto";
import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  appUrl,
  assert,
  clientFor,
  consoleWatch,
  convexUrl,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const stamp = Date.now().toString(36);
const evidence = process.env.EVIDENCE;

const cards = (page: Page) => page.locator("[data-ref-id]");
const card = (page: Page, refId: string) => page.locator(`[data-ref-id="${refId}"]`);
const shownRefIds = (page: Page) =>
  cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-ref-id")!).sort(),
  );
const collectionLinks = (page: Page) => page.locator("[data-collection-id]");

const save = async (page: Page, name: string, buffer: Buffer) => {
  const outcomes = page.locator('[role="status"] li');
  const reported = await outcomes.count();
  await page.getByLabel("Add images").setInputFiles([{ name, mimeType: "image/png", buffer }]);
  const line = outcomes.nth(reported);
  await line.waitFor();
  if ((await line.getAttribute("data-outcome")) !== "saved") {
    throw new Error(`FAIL the page saves ${name}: ${await line.textContent()}`);
  }
};

const createOnPage = async (page: Page, name: string) => {
  await page.getByLabel("New collection").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  const link = page.getByRole("link", { name: name.trim(), exact: true });
  await link.waitFor();
  return link;
};

const until = async (condition: () => Promise<boolean>, message: string) => {
  for (let tries = 0; tries < 50; tries++) {
    if (await condition()) return;
    await Bun.sleep(200);
  }
  throw new Error(`FAIL ${message}`);
};

const members = async (collectionId: string) =>
  (await rows("collectionRefs"))
    .filter((row) => row.collectionId === collectionId)
    .map((row) => row.refId as string)
    .sort();

const anonymous = new ConvexHttpClient(convexUrl());
assert(
  (await outcome(anonymous.query(api.collections.list, {}))) === "NotSignedIn",
  "listing collections without a session fails with NotSignedIn",
);

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();
watchConsole(first.page);
watchConsole(second.page);
try {
  const { page } = first;
  await signInWithPasskey(page, `check-collections-a-${stamp}`);
  const owner = await clientFor(page);
  const refsOf = async (collectionId: string) =>
    (
      await owner.query(api.collections.refs, {
        collectionId: collectionId as Id<"collections">,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page
      .map((item) => item.refId as string)
      .sort();

  await save(page, "library.png", await pngOf(page, "rgb(200, 30, 30)", 300));
  await cards(page).first().waitFor();
  const libraryRefId = (await cards(page).first().getAttribute("data-ref-id"))!;

  const moodLink = await createOnPage(page, "  Mood  ");
  const moodId = (await moodLink.getAttribute("data-collection-id"))!;
  assert(
    (await moodLink.textContent()) === "Mood",
    `making a collection on the page lists it under its trimmed name: ${await moodLink.textContent()}`,
  );
  await moodLink.click();
  await page.waitForURL(`${appUrl}/c/${moodId}`);
  await page.getByRole("heading", { name: "Mood" }).waitFor();
  await page.getByTestId("canvas").waitFor();
  const viewLinks = page.locator("header nav").getByRole("link");
  assert(
    (await viewLinks.allTextContents()).join() === "Canvas,Gallery" &&
      (await viewLinks.first().getAttribute("aria-current")) === "page" &&
      (await page.getByText("Nothing saved yet.").count()) === 0,
    `the collection's link opens /c/${moodId}, which shows its name and its canvas, with the Canvas link first and marked as the current view`,
  );
  await page.getByRole("link", { name: "Gallery" }).click();
  await page.waitForURL(`${appUrl}/c/${moodId}?view=gallery`);
  await page.getByText("Nothing saved yet.").waitFor();
  assert(
    (await page.getByTestId("canvas").count()) === 0 &&
      (await viewLinks.last().getAttribute("aria-current")) === "page",
    "the Gallery link opens ?view=gallery, which shows the collection's gallery and no canvas",
  );
  assert((await cards(page).count()) === 0, "a new collection shows no images");

  await save(page, "uploaded.png", await pngOf(page, "rgb(30, 30, 200)", 400));
  await cards(page).first().waitFor();
  const uploadedRefId = (await cards(page).first().getAttribute("data-ref-id"))!;
  assert(
    (await shownRefIds(page)).join() === uploadedRefId,
    "an image uploaded on the collection's page shows there, and only it",
  );
  if (evidence) {
    await page.screenshot({ path: `${evidence}/02-collection-upload.png`, fullPage: true });
  }
  assert(
    (await members(moodId)).join() === uploadedRefId,
    `the database holds one membership for the uploaded image: ${await members(moodId)}`,
  );

  await page.goto(`${appUrl}/library`);
  await card(page, uploadedRefId).waitFor();
  assert(
    (await shownRefIds(page)).join() === [libraryRefId, uploadedRefId].sort().join(),
    "the image uploaded in the collection also shows in the library",
  );

  await card(page, libraryRefId).getByLabel("Add to collection").selectOption({ label: "Mood" });
  await until(
    async () => (await members(moodId)).includes(libraryRefId),
    "choosing a collection on a card adds the image to it",
  );
  await page.goto(`${appUrl}/c/${moodId}?view=gallery`);
  await card(page, libraryRefId).waitFor();
  assert(
    (await shownRefIds(page)).join() === [libraryRefId, uploadedRefId].sort().join(),
    "a library image added from its card shows in the collection",
  );
  await owner.mutation(api.collections.addRefs, {
    collectionId: moodId as Id<"collections">,
    refIds: [libraryRefId as Id<"refs">, libraryRefId as Id<"refs">],
  });
  await Promise.all([
    owner.mutation(api.collections.addRefs, {
      collectionId: moodId as Id<"collections">,
      refIds: [libraryRefId as Id<"refs">],
    }),
    owner.mutation(api.collections.addRefs, {
      collectionId: moodId as Id<"collections">,
      refIds: [libraryRefId as Id<"refs">],
    }),
  ]);
  assert(
    (await members(moodId)).join() === [libraryRefId, uploadedRefId].sort().join() &&
      (await refsOf(moodId)).join() === [libraryRefId, uploadedRefId].sort().join(),
    `adding the image again, twice in one call and in two calls at once, leaves one membership: ${await members(moodId)}`,
  );

  await page.goto(`${appUrl}/library`);
  const sketchLink = await createOnPage(page, "Sketches");
  const sketchId = (await sketchLink.getAttribute("data-collection-id"))!;
  await card(page, libraryRefId)
    .getByLabel("Add to collection")
    .selectOption({ label: "Sketches" });
  await until(
    async () => (await members(sketchId)).includes(libraryRefId),
    "choosing a second collection on a card adds the image to it",
  );
  await page.goto(`${appUrl}/c/${sketchId}?view=gallery`);
  await card(page, libraryRefId).waitFor();
  assert(
    (await shownRefIds(page)).join() === libraryRefId &&
      (await refsOf(moodId)).includes(libraryRefId),
    `an image added to a second collection shows in both: ${await shownRefIds(page)}`,
  );

  await page.goto(`${appUrl}/c/${moodId}?view=gallery`);
  await card(page, libraryRefId).waitFor();
  await card(page, libraryRefId).getByRole("button", { name: "Remove from collection" }).click();
  await card(page, libraryRefId).waitFor({ state: "detached" });
  assert(
    (await shownRefIds(page)).join() === uploadedRefId &&
      (await members(moodId)).join() === uploadedRefId,
    "removing the image on the collection's page takes it out of that collection",
  );
  await owner.mutation(api.collections.removeRefs, {
    collectionId: moodId as Id<"collections">,
    refIds: [libraryRefId as Id<"refs">],
  });
  assert(
    (await members(moodId)).join() === uploadedRefId,
    "removing an image that is not in the collection changes nothing",
  );
  await page.goto(`${appUrl}/library`);
  await card(page, libraryRefId).waitFor();
  assert(
    (await refsOf(sketchId)).join() === libraryRefId &&
      (await shownRefIds(page)).join() === [libraryRefId, uploadedRefId].sort().join(),
    "the removed image stays in the other collection and in the library",
  );

  // The image is not in Mood now, so each of these calls tries to insert it.
  const inMood = (refIds: ReadonlyArray<string>) => ({
    collectionId: moodId as Id<"collections">,
    refIds: refIds as Array<Id<"refs">>,
  });
  await Promise.all([
    owner.mutation(api.collections.addRefs, inMood([libraryRefId])),
    owner.mutation(api.collections.addRefs, inMood([libraryRefId, libraryRefId])),
  ]);
  assert(
    (await members(moodId)).join() === [libraryRefId, uploadedRefId].sort().join(),
    `adding an absent image in two calls at once, and twice in one call, makes one membership: ${await members(moodId)}`,
  );
  const pageOf = (cursor: string | null) =>
    owner.query(api.collections.refs, {
      collectionId: moodId as Id<"collections">,
      paginationOpts: { numItems: 1, cursor },
    });
  const newest = await pageOf(null);
  const older = await pageOf(newest.continueCursor);
  assert(
    newest.page.map((item) => item.refId).join() === libraryRefId &&
      older.page.map((item) => item.refId).join() === uploadedRefId,
    "a collection lists its images newest added first, one page after the other",
  );
  await owner.mutation(api.collections.removeRefs, inMood([libraryRefId]));

  await page.goto(`${appUrl}/c/${moodId}?view=gallery`);
  await page.getByLabel("Collection name").fill("  Mood board ");
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("heading", { name: "Mood board" }).waitFor();
  await card(page, uploadedRefId).locator("img").waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  if (evidence) {
    await page.screenshot({ path: `${evidence}/03-collection-page.png`, fullPage: true });
  }
  await page.goto(`${appUrl}/library`);
  await page.locator(`[data-collection-id="${moodId}"]`).getByText("Mood board").waitFor();
  assert(
    (await collectionLinks(page).allTextContents()).join() === "Mood board,Sketches",
    `renaming shows the trimmed new name on the page and in the list, oldest first: ${await collectionLinks(page).allTextContents()}`,
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  if (evidence) {
    await page.screenshot({ path: `${evidence}/01-library-collections.png`, fullPage: true });
  }

  for (const [label, name] of [
    ["an empty name", ""],
    ["a name of spaces", "   "],
    ["a name of 101 characters", "x".repeat(101)],
  ] as const) {
    const created = await outcome(owner.mutation(api.collections.create, { name }));
    const renamed = await outcome(
      owner.mutation(api.collections.rename, { collectionId: moodId as Id<"collections">, name }),
    );
    assert(
      created.startsWith("refused") && renamed.startsWith("refused"),
      `${label} is refused by create and by rename: ${created}`,
    );
  }
  const longest = await createOnPage(page, ` ${"x".repeat(100)} `);
  const listed = await owner.query(api.collections.list, {});
  assert(
    listed.map(({ name }) => name).join() === `Mood board,Sketches,${"x".repeat(100)}` &&
      listed[2]!.collectionId === (await longest.getAttribute("data-collection-id")),
    "a name of 100 characters between spaces is accepted on the page, and the refused names made nothing",
  );

  await signInWithPasskey(second.page, `check-collections-b-${stamp}`);
  const other = await clientFor(second.page);
  const foreign = moodId as Id<"collections">;
  const own = await other.mutation(api.collections.create, { name: "Mine" });
  const calls = {
    rename: outcome(
      other.mutation(api.collections.rename, { collectionId: foreign, name: "Taken" }),
    ),
    addRefs: outcome(
      other.mutation(api.collections.addRefs, { collectionId: foreign, refIds: [] }),
    ),
    removeRefs: outcome(
      other.mutation(api.collections.removeRefs, {
        collectionId: foreign,
        refIds: [uploadedRefId as Id<"refs">],
      }),
    ),
    refs: outcome(
      other.query(api.collections.refs, {
        collectionId: foreign,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ),
  };
  for (const [name, call] of Object.entries(calls)) {
    assert(
      (await call) === "CollectionNotFound",
      `the second user gets CollectionNotFound from ${name} on the first user's collection`,
    );
  }

  const green = await pngOf(second.page, "rgb(30, 200, 30)", 64);
  const [upload] = await other.mutation(api.library.prepareUpload, {
    sha256: sha256(green),
    roles: [],
  });
  const put = await fetch(upload!.url, {
    method: "PUT",
    body: green,
    headers: { "Content-Type": "image/png", ...upload!.headers },
  });
  const image = {
    sha256: sha256(green),
    fileName: "green.png",
    width: 64,
    height: 64,
    thumbHash: "AAAA",
    variants: {},
  };
  assert(
    put.ok &&
      (await outcome(other.action(api.library.save, { ...image, collectionId: foreign }))) ===
        "CollectionNotFound",
    "the second user gets CollectionNotFound from a save into the first user's collection",
  );
  assert(
    (await outcome(
      other.mutation(api.collections.addRefs, {
        collectionId: own,
        refIds: [uploadedRefId as Id<"refs">],
      }),
    )) === "RefNotFound",
    "the second user gets RefNotFound when adding the first user's image to their own collection",
  );

  const otherWorkspace = (await rows("collections")).find((row) => row._id === own)!.workspaceId;
  const otherLibrary = await other.query(api.library.list, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert(
    otherLibrary.page.length === 0 &&
      (await rows("blobs")).every((row) => row.workspaceId !== otherWorkspace) &&
      (await members(own)).length === 0,
    "the refused save added no Ref and no Blob, and the refused add added no membership",
  );
  assert(
    (await owner.query(api.collections.list, {}))[0]!.name === "Mood board" &&
      (await members(moodId)).join() === uploadedRefId &&
      (await other.query(api.collections.list, {})).map(({ name }) => name).join() === "Mine",
    "the first user's collection kept its name and its member, and the second user lists only their own",
  );

  const saved = await other.action(api.library.save, { ...image, collectionId: own });
  assert(
    (await members(own)).join() === saved.refId,
    "the same save into the second user's own collection records the Ref and its membership",
  );
  const spare = await other.mutation(api.collections.create, { name: "Spare" });
  assert(
    (await outcome(
      other.mutation(api.collections.addRefs, {
        collectionId: spare,
        refIds: [saved.refId, uploadedRefId as Id<"refs">],
      }),
    )) === "RefNotFound" && (await members(spare)).length === 0,
    "a call that adds one's own image and then another user's fails with RefNotFound and adds neither",
  );

  await second.page.goto(`${appUrl}/c/${moodId}`);
  await second.page.getByText("Collection not found.").waitFor();
  assert(true, "the first user's collection page shows the second user a not-found line");

  // On a narrow window the sidebar is a sheet that only the title bar's button opens.
  await second.page.setViewportSize({ width: 600, height: 800 });
  const library = second.page.getByRole("link", { name: "Library", exact: true });
  const hiddenAtFirst = !(await library.isVisible());
  await second.page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await library.click();
  await second.page.waitForURL(`${appUrl}/library`);
  await library.waitFor({ state: "hidden" });
  assert(
    hiddenAtFirst,
    "on a narrow window the not-found page still has the button that opens the sidebar, and following its Library link closes it",
  );

  // The theme. A page with nothing stored follows the system, which is light here.
  const themed = second.page;
  const theme = () =>
    themed.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      stored: localStorage.getItem("theme"),
      background: getComputedStyle(document.body).backgroundColor,
    }));
  const isDark = (dark: boolean) =>
    themed.waitForFunction(
      (wanted) => document.documentElement.classList.contains("dark") === wanted,
      dark,
    );
  const choose = async (name: string) => {
    await themed.getByRole("button", { name: "Theme" }).click();
    await themed.getByRole("menuitem", { name, exact: true }).click();
  };
  const atFirst = await theme();
  await choose("Dark");
  await isDark(true);
  const chosenDark = await theme();
  assert(
    !atFirst.dark &&
      atFirst.stored === null &&
      chosenDark.stored === "dark" &&
      chosenDark.background !== atFirst.background,
    `a page with no stored theme is light like the system, and choosing Dark stores it and changes the page's background from ${atFirst.background} to ${chosenDark.background}`,
  );
  /** Whether a new page is dark with the app's own scripts held back, so that only the script in its HTML ran. */
  const darkBeforeApp = async (system: "light" | "dark") => {
    const held = await themed.context().newPage();
    await held.emulateMedia({ colorScheme: system });
    await held.route(
      (url) => url.origin === appUrl && /^\/(src|@|node_modules)/.test(url.pathname),
      (route) => route.abort(),
    );
    await held.goto(`${appUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    const dark = await held.evaluate(() => document.documentElement.classList.contains("dark"));
    await held.close();
    return dark;
  };
  assert(
    await darkBeforeApp("light"),
    "with Dark stored, a page is dark before the app's scripts run, so it does not flash light first",
  );
  await choose("System");
  await isDark(false);
  await themed.emulateMedia({ colorScheme: "dark" });
  await isDark(true);
  await themed.emulateMedia({ colorScheme: "light" });
  await isDark(false);
  assert(
    (await theme()).stored === "system",
    "choosing System follows the system: dark when it turns dark, and light again when it turns light",
  );
  const systemBeforeApp = [await darkBeforeApp("dark"), await darkBeforeApp("light")];
  assert(
    systemBeforeApp.join() === "true,false",
    `with System stored, a page is dark before the app's scripts run on a dark system and light on a light one: ${systemBeforeApp}`,
  );

  assertCleanConsole();
} finally {
  await first.browser.close();
  await second.browser.close();
}
