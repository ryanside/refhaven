import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  appUrl,
  assert,
  clientFor,
  consoleWatch,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";

const stamp = Date.now().toString(36);
const evidence = process.env.EVIDENCE;

const cards = (page: Page) => page.locator("[data-ref-id]");
const card = (page: Page, refId: string) => page.locator(`[data-ref-id="${refId}"]`);

const save = async (page: Page, name: string, buffer: Buffer) => {
  const outcomes = page.locator('[role="status"] li');
  const reported = await outcomes.count();
  await page.getByLabel("Add images").setInputFiles([{ name, mimeType: "image/png", buffer }]);
  const line = outcomes.nth(reported);
  await line.waitFor({ timeout: 60_000 });
  if ((await line.getAttribute("data-outcome")) !== "saved") {
    throw new Error(`FAIL the page saves ${name}: ${await line.textContent()}`);
  }
  await cards(page).nth(reported).waitFor();
  return (await cards(page).first().getAttribute("data-ref-id")) as Id<"refs">;
};

const until = async (condition: () => Promise<boolean>, message: string) => {
  for (let tries = 0; tries < 50; tries++) {
    if (await condition()) return;
    await Bun.sleep(200);
  }
  throw new Error(`FAIL timed out waiting until ${message}`);
};

const refRow = async (refId: string) => (await rows("refs")).find((row) => row._id === refId);
const tagRows = async (refId: string) =>
  (await rows("tags")).filter((row) => row.refId === refId).map((row) => row.name as string);
const tagsOf = async (client: ConvexHttpClient, refId: Id<"refs">) =>
  (await client.query(api.ref.get, { refId })).tags.join();

const shownTags = (page: Page) =>
  page
    .locator("[data-tag]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-tag")).join());
const alert = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });

/** The button that turns a shown value back into its field. */
const editButtons: Record<string, string> = { Name: "Rename", Source: "Edit source" };

/** Fills a field, opening it first when its value is shown instead, and submits its form. */
const submit = async (page: Page, label: string, button: string, value: string) => {
  const field = page.getByLabel(label, { exact: true });
  const edit = editButtons[label];
  if (edit && !(await field.isVisible())) {
    await page.getByRole("button", { name: edit, exact: true }).click();
  }
  await field.fill(value);
  await page.getByRole("button", { name: button, exact: true }).click();
};

const imagesLoaded = (page: Page) =>
  page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>("main img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );

const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
watchConsole(first.page);
watchConsole(second.page);
try {
  const { page } = first;
  await signInWithPasskey(page, `check-ref-page-a-${stamp}`);
  let owner = await clientFor(page);
  const large = await save(page, "large.png", await pngOf(page, "rgb(40, 170, 70)", 3000, 2000));
  const small = await save(page, "small.png", await pngOf(page, "rgb(200, 30, 30)", 300));

  await card(page, large).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${large}`);
  const image = page.locator("main img");
  await page.getByRole("heading", { name: "large.png" }).waitFor();
  await imagesLoaded(page);
  const shown = await image.evaluate((element: HTMLImageElement) => ({
    width: element.naturalWidth,
    src: new URL(element.currentSrc).pathname,
    crossOrigin: element.crossOrigin,
  }));
  assert(
    shown.width === 2048 && shown.src.endsWith("/2048.webp") && shown.crossOrigin === "anonymous",
    `clicking the card's image opens /r/{refId}, which shows the 2048 px copy of a 3000 by 2000 image as a CORS load: ${shown.width} px from …${shown.src.slice(-10)}`,
  );
  const original = page.getByRole("link", { name: "Open the original" });
  const blobId = (await refRow(large))?.blobs.original;
  const blob = (await rows("blobs")).find((row) => row._id === blobId);
  assert(
    (await page.getByText("3000 × 2000 px").count()) === 1 &&
      (await page.getByText("image/png", { exact: true }).count()) === 1 &&
      (await original.getAttribute("target")) === "_blank" &&
      new URL((await original.getAttribute("href"))!).pathname.endsWith(
        `/o/${blob?.sha256}/${blob?.upload}`,
      ),
    "the page shows the pixel size and the type, and a link that opens the original in a new tab",
  );

  await submit(page, "Name", "Save name", "  renamed.png ");
  await page.getByRole("heading", { name: "renamed.png" }).waitFor();
  for (const [label, fileName] of [
    ["an empty name", ""],
    ["a name of 256 characters", "x".repeat(256)],
  ] as const) {
    await submit(page, "Name", "Save name", fileName);
    await alert(page, "A name is 1 to 255 characters.").waitFor();
    assert(
      (await refRow(large))?.fileName === "renamed.png",
      `${label} is refused on the page with an alert and writes nothing`,
    );
    await submit(page, "Name", "Save name", "renamed.png");
    await alert(page, "A name is").waitFor({ state: "detached" });
  }
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Library", exact: true })
    .click();
  await card(page, large).waitFor();
  assert(
    (await card(page, large).locator("p").textContent()) === "renamed.png",
    "renaming on the page shows the trimmed new name on the page and on the library's card",
  );

  // The page steps through the list it was opened from: here the library, newest first.
  await card(page, small).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${small}`);
  await page.getByRole("heading", { name: "small.png" }).waitFor();
  const crumbFromLibrary = await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link")
    .textContent();
  const previousAtFirst = await page.getByRole("button", { name: "Previous image" }).count();
  await page.keyboard.press("ArrowRight");
  await page.waitForURL(`${appUrl}/r/${large}`);
  await page.getByRole("heading", { name: "renamed.png" }).waitFor();
  const nextAtLast = await page.getByRole("button", { name: "Next image" }).count();
  await page.keyboard.press("ArrowRight");
  await Bun.sleep(300);
  const stayedAtLast = page.url() === `${appUrl}/r/${large}`;
  await page.getByRole("button", { name: "Previous image" }).click();
  await page.waitForURL(`${appUrl}/r/${small}`);
  await page.getByRole("button", { name: "Next image" }).click();
  await page.waitForURL(`${appUrl}/r/${large}`);
  await page.keyboard.press("ArrowLeft");
  await page.waitForURL(`${appUrl}/r/${small}`);
  await page.keyboard.press("Escape");
  await page.waitForURL(`${appUrl}/library`);
  await card(page, small).waitFor();
  assert(
    crumbFromLibrary === "Library" && previousAtFirst === 0 && nextAtLast === 0 && stayedAtLast,
    "opened from the library, the breadcrumb leads to Library, → and Next image step to the next image in the library's order and ← and Previous image back, neither goes past an end, and Escape returns to the library",
  );

  await card(page, large).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${large}`);
  await submit(page, "Note", "Save note", "Studied for the rim light.");
  await until(
    async () => (await refRow(large))?.note === "Studied for the rim light.",
    "the note is saved",
  );
  await page.reload();
  await page.getByLabel("Note", { exact: true }).waitFor();
  assert(
    (await page.getByLabel("Note", { exact: true }).inputValue()) === "Studied for the rim light.",
    "a note saved on the page is there after a reload",
  );
  await submit(page, "Note", "Save note", "  ");
  await until(async () => !("note" in (await refRow(large))), "the note is cleared");
  assert(true, "clearing the note on the page removes the field from the row");

  // Another tab changes the note while this page is open. The form must take each new value,
  // also between no note and a note that reads "null".
  const noteField = page.getByLabel("Note", { exact: true });
  await owner.mutation(api.ref.update, { refId: large, note: "null" });
  await until(
    async () => (await noteField.inputValue()) === "null",
    'the form shows the note "null"',
  );
  await owner.mutation(api.ref.update, { refId: large, note: null });
  await until(async () => (await noteField.inputValue()) === "", "the form shows no note");
  assert(
    true,
    'the open form follows a note set to the text "null" in another tab, and then cleared',
  );

  const source = "https://example.com/a?b=c";
  await submit(page, "Source", "Save source", source);
  const sourceLink = page.getByTestId("source");
  await sourceLink.waitFor();
  assert(
    (await sourceLink.getAttribute("href")) === source &&
      (await sourceLink.getAttribute("rel")) === "noreferrer noopener" &&
      (await sourceLink.getAttribute("target")) === "_blank" &&
      (await refRow(large))?.sourceUrl === source,
    `a source saved on the page is shown as a link to ${source} that opens in a new tab`,
  );
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com", "not a url"]) {
    await submit(page, "Source", "Save source", bad);
    await alert(page, "A source is an http or https link").waitFor();
    // Escape leaves the field, which shows the saved source as its link again.
    await page.getByLabel("Source", { exact: true }).press("Escape");
    assert(
      (await refRow(large))?.sourceUrl === source &&
        (await sourceLink.getAttribute("href")) === source,
      `the source ${JSON.stringify(bad)} is refused on the page with an alert and writes nothing`,
    );
    await submit(page, "Source", "Save source", source);
    await alert(page, "A source is").waitFor({ state: "detached" });
  }
  await submit(page, "Source", "Save source", "");
  await sourceLink.waitFor({ state: "detached" });
  assert(
    !("sourceUrl" in (await refRow(large))),
    "clearing the source on the page removes the link and the field from the row",
  );

  for (const name of ["Mood", " mood ", "MOOD"]) {
    await submit(page, "Add a tag", "Add", name);
    await page.locator('[data-tag="mood"]').waitFor();
    await until(
      async () => (await page.getByLabel("Add a tag").inputValue()) === "",
      `adding ${JSON.stringify(name)} empties the field`,
    );
  }
  assert(
    (await shownTags(page)) === "mood" && (await tagRows(large)).join() === "mood",
    `adding "Mood", " mood ", and "MOOD" on the page leaves one tag, mood: ${await shownTags(page)}`,
  );
  await submit(page, "Add a tag", "Add", "Anatomy");
  await page.locator('[data-tag="anatomy"]').waitFor();
  assert(
    (await shownTags(page)) === "mood,anatomy",
    `a second tag shows after the first, in the order added: ${await shownTags(page)}`,
  );
  for (const [label, name] of [
    ["a tag of 51 characters", "x".repeat(51)],
    ["an empty tag", " "],
  ] as const) {
    await submit(page, "Add a tag", "Add", name);
    await alert(page, "A tag is 1 to 50 characters.").waitFor();
    assert(
      (await tagRows(large)).length === 2 && (await shownTags(page)) === "mood,anatomy",
      `${label} is refused on the page with an alert and adds nothing`,
    );
    await submit(page, "Add a tag", "Add", "mood");
    await alert(page, "A tag is").waitFor({ state: "detached" });
  }
  await page.getByRole("button", { name: "Remove the tag anatomy" }).click();
  await page.locator('[data-tag="anatomy"]').waitFor({ state: "detached" });
  assert(
    (await shownTags(page)) === "mood" && (await tagRows(large)).join() === "mood",
    "removing one tag on the page leaves the other",
  );
  await until(
    async () =>
      (await page
        .locator("datalist option")
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value).join(),
        )) === "mood",
    "the tag field offers the workspace's tags as suggestions",
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [large] });
  const boardLink = page.getByRole("main").locator(`[data-collection-id="${board}"]`);
  await boardLink.waitFor();
  assert(
    (await boardLink.textContent()) === "Board",
    "the page lists the collection the image is in, by name",
  );
  await submit(page, "Note", "Save note", "Studied for the rim light.");
  await submit(page, "Source", "Save source", source);
  await submit(page, "Add a tag", "Add", "Anatomy");
  await page.locator('[data-tag="anatomy"]').waitFor();
  await page.getByTestId("source").waitFor();
  await imagesLoaded(page);
  if (evidence) {
    await page.screenshot({ path: `${evidence}/01-ref-page.png`, fullPage: true });
  }
  await boardLink.click();
  await page.waitForURL(`${appUrl}/c/${board}`);
  await page.getByRole("heading", { name: "Board" }).waitFor();
  await page.getByRole("link", { name: "Gallery" }).click();
  await card(page, large).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${large}`);
  await page.getByRole("heading", { name: "renamed.png" }).waitFor();
  const crumbFromBoard = await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link")
    .textContent();
  await page.keyboard.press("Escape");
  await page.waitForURL(`${appUrl}/c/${board}?view=gallery`);
  await card(page, large).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${large}`);
  assert(
    crumbFromBoard === "Board",
    "the collection's link opens /c/{collectionId}, the card on its gallery links back here with a breadcrumb that leads to the collection, and Escape returns to its gallery",
  );

  // The page renews its session while it runs, and a client takes the token it holds now.
  owner = await clientFor(page);
  await page.getByRole("button", { name: "Move to trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).waitFor();
  const trashed = await owner.query(api.ref.get, { refId: large });
  const editsInTrash = {
    update: await outcome(owner.mutation(api.ref.update, { refId: large, note: "changed" })),
    addTags: await outcome(owner.mutation(api.ref.addTags, { refId: large, names: ["new"] })),
    removeTags: await outcome(
      owner.mutation(api.ref.removeTags, { refId: large, names: ["mood"] }),
    ),
  };
  assert(
    typeof trashed.deletedAt === "number" &&
      (await page.getByText("This image is in the trash.").count()) === 1 &&
      Object.values(editsInTrash).every((result) => result === "RefNotFound"),
    `Move to trash on the page moves the image to the trash and shows Restore, get still answers, and update, addTags, and removeTags fail with RefNotFound: ${JSON.stringify(editsInTrash)}`,
  );
  await page.goto(`${appUrl}/trash`);
  await card(page, large).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${large}`);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Move to trash", exact: true }).waitFor();
  const restored = await owner.query(api.ref.get, { refId: large });
  assert(
    restored.deletedAt === null &&
      restored.note === "Studied for the rim light." &&
      restored.sourceUrl === source &&
      restored.tags.join() === "mood,anatomy" &&
      (await shownTags(page)) === "mood,anatomy" &&
      (await page.getByTestId("source").getAttribute("href")) === source,
    "a trash card links to the page, and after Restore there the note, source, and tags are as they were",
  );

  owner = await clientFor(page);
  for (const [label, fileName] of [
    ["an empty name", ""],
    ["a name of spaces", "   "],
    ["a name of 256 characters", "x".repeat(256)],
  ] as const) {
    const updated = await outcome(owner.mutation(api.ref.update, { refId: small, fileName }));
    assert(
      updated.includes("SchemaError") && (await refRow(small))?.fileName === "small.png",
      `${label} is refused by update on the server and writes nothing: ${updated}`,
    );
  }
  const longNote = await outcome(
    owner.mutation(api.ref.update, { refId: small, note: "x".repeat(10_001) }),
  );
  assert(
    longNote.includes("SchemaError") && !("note" in (await refRow(small))),
    `a note of 10,001 characters is refused by update and writes nothing: ${longNote}`,
  );
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://example.com",
    "not a url",
    "",
    `https://example.com/${"x".repeat(2029)}`,
  ]) {
    const updated = await outcome(owner.mutation(api.ref.update, { refId: small, sourceUrl }));
    assert(
      updated.includes("SchemaError") && !("sourceUrl" in (await refRow(small))),
      `the source ${JSON.stringify(sourceUrl.slice(0, 40))} is refused by update and writes nothing: ${updated}`,
    );
  }
  const mixed = await outcome(
    owner.mutation(api.ref.update, {
      refId: small,
      fileName: "good.png",
      sourceUrl: "javascript:alert(1)",
    }),
  );
  assert(
    mixed.includes("SchemaError") && (await refRow(small))?.fileName === "small.png",
    `one update with a good name and a bad source writes neither: ${mixed}`,
  );

  await owner.mutation(api.ref.addTags, { refId: small, names: ["Zebra", " zebra ", "ZEBRA"] });
  await owner.mutation(api.ref.addTags, { refId: small, names: ["Light   and  shadow", "MOOD"] });
  assert(
    (await tagsOf(owner, small)) === "zebra,light and shadow,mood" &&
      (await tagRows(small)).sort().join() === "light and shadow,mood,zebra",
    `addTags makes one tag of three spellings in one call, collapses inner spaces, and keeps the order added: ${await tagsOf(owner, small)}`,
  );
  for (const [label, names] of [
    ["an empty tag", [""]],
    ["a tag of 51 characters", ["x".repeat(51)]],
    ["21 tags in one call", Array.from({ length: 21 }, (_, index) => `tag ${index}`)],
  ] as const) {
    const added = await outcome(owner.mutation(api.ref.addTags, { refId: small, names }));
    assert(
      added.includes("SchemaError") && (await tagRows(small)).length === 3,
      `${label} is refused by addTags on the server and adds nothing: ${added}`,
    );
  }
  await owner.mutation(api.ref.removeTags, { refId: small, names: ["ZEBRA", "absent"] });
  assert(
    (await tagsOf(owner, small)) === "light and shadow,mood",
    "removeTags removes a tag by any spelling, and a tag the image lacks changes nothing",
  );
  assert(
    (await owner.query(api.ref.tags, {})).join() === "anatomy,light and shadow,mood",
    `tags lists the workspace's distinct tag names sorted, across two images that share one: ${await owner.query(api.ref.tags, {})}`,
  );

  await signInWithPasskey(second.page, `check-ref-page-b-${stamp}`);
  const other = await clientFor(second.page);
  const foreign = {
    get: await outcome(other.query(api.ref.get, { refId: large })),
    update: await outcome(other.mutation(api.ref.update, { refId: large, note: "theirs" })),
    addTags: await outcome(other.mutation(api.ref.addTags, { refId: large, names: ["theirs"] })),
    removeTags: await outcome(
      other.mutation(api.ref.removeTags, { refId: large, names: ["mood"] }),
    ),
  };
  assert(
    Object.values(foreign).every((result) => result === "RefNotFound"),
    `a second user gets RefNotFound from get, update, addTags, and removeTags on the first user's image: ${JSON.stringify(foreign)}`,
  );
  assert(
    (await other.query(api.ref.tags, {})).length === 0 &&
      (await refRow(large))?.note === "Studied for the rim light." &&
      (await tagRows(large)).sort().join() === "anatomy,mood",
    "the second user's tags lists none of the first user's, and the first user's image is unchanged",
  );
  await second.page.goto(`${appUrl}/r/${large}`);
  await second.page.getByText("Image not found.").waitFor();
  assert(
    (await second.page.getByText("renamed.png").count()) === 0,
    "the first user's image page shows the second user only Image not found.",
  );

  assertCleanConsole();

  // This comes after the console assertion, because Convex's client logs the refused argument.
  await page.goto(`${appUrl}/r/not-an-id`);
  await page.getByText("Image not found.").waitFor();
  assert(
    (await page.getByText("ArgumentValidationError").count()) === 0,
    "an image page whose ID is not an ID at all shows Image not found. and no server error",
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
