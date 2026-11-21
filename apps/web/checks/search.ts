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

type Filter = { q?: string; tag?: string; collectionId?: Id<"collections"> };

/** The file names `filter` finds, sorted, so a case reads as the names it expects. */
const found = async (client: ConvexHttpClient, filter: Filter) =>
  (await client.query(api.library.filter, filter)).items
    .map(({ fileName }) => fileName)
    .sort()
    .join();

/** The file names the page's cards give their images, sorted. */
const shown = (page: Page) =>
  cards(page)
    .locator("img")
    .evaluateAll((images) =>
      images
        .map((image) => (image as HTMLImageElement).alt)
        .sort()
        .join(),
    );

const until = async (condition: () => Promise<boolean>, message: string) => {
  for (let tries = 0; tries < 75; tries++) {
    if (await condition()) return;
    await Bun.sleep(200);
  }
  throw new Error(`FAIL timed out waiting until ${message}`);
};

const searchParam = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

/** Waits until the URL holds `q` and `tag` as given, absent when null, and the cards show `names`. */
const showsFor = (page: Page, q: string | null, tag: string | null, names: string) =>
  until(
    async () =>
      searchParam(page, "q") === q &&
      searchParam(page, "tag") === tag &&
      (await shown(page)) === names &&
      (names !== "" || (await page.getByText("No images match.").count()) === 1),
    `the URL holds q=${q} and tag=${tag} and the gallery shows "${names}"`,
  );

const searchField = (page: Page) => page.getByLabel("Search", { exact: true });
const tagChips = (page: Page) => page.getByRole("navigation", { name: "Tags" });
const chooseTag = (page: Page, name: string) =>
  tagChips(page)
    .getByRole("link", { name: name === "" ? "All" : name, exact: true })
    .click();
const shownTag = async (page: Page) => {
  const chosen = await tagChips(page).locator('[aria-current="page"]').textContent();
  return chosen === "All" ? "" : chosen;
};

const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
watchConsole(first.page);
watchConsole(second.page);
try {
  const { page } = first;
  await signInWithPasskey(page, `check-search-a-${stamp}`);
  const harbor = await save(page, "harbor-dusk.png", await pngOf(page, "rgb(30, 60, 160)", 300));
  const forest = await save(page, "forest-path.png", await pngOf(page, "rgb(30, 140, 60)", 300));
  const desert = await save(page, "desert-dune.png", await pngOf(page, "rgb(200, 160, 60)", 300));
  let owner = await clientFor(page);
  await owner.mutation(api.ref.update, {
    refId: harbor,
    note: "Painted for the lantern glow.",
    sourceUrl: "https://example.com/refs/wharfside",
  });
  await owner.mutation(api.ref.addTags, { refId: forest, names: ["seascape", "moss"] });
  await owner.mutation(api.ref.addTags, { refId: harbor, names: ["seascape"] });
  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, {
    collectionId: board,
    refIds: [harbor, desert],
  });

  assert(
    (await found(owner, { q: "harbor" })) === "harbor-dusk.png" &&
      (await found(owner, { q: "dune" })) === "desert-dune.png",
    "filter finds an image by a word of its name, and no other image",
  );
  assert(
    (await found(owner, { q: "lantern" })) === "harbor-dusk.png" &&
      (await found(owner, { q: "wharfside" })) === "harbor-dusk.png" &&
      (await found(owner, { q: "moss" })) === "forest-path.png",
    "filter finds an image by a word only in its note, a word only in its source, and its tag",
  );
  assert(
    (await found(owner, { q: "harb" })) === "harbor-dusk.png" &&
      (await found(owner, { q: "lantern harb" })) === "harbor-dusk.png" &&
      (await found(owner, { q: "harb lantern" })) === "" &&
      (await found(owner, { q: "arbor lantern" })) === "",
    `only the last word matches by its beginning, and no word matches from its middle: "harb" and "lantern harb" find the image, "harb lantern" and "arbor lantern" do not`,
  );
  assert(
    (await found(owner, { q: "dune" })) === "desert-dune.png" &&
      (await found(owner, { q: "forest" })) === "forest-path.png" &&
      (await found(owner, { q: "dune forest" })) === "" &&
      (await found(owner, { q: "zzz harb" })) === "" &&
      (await found(owner, { q: "wharfside lantern harbor" })) === "harbor-dusk.png",
    "more words find fewer images: an image is found only when it holds every word typed",
  );
  assert(
    (await found(owner, { tag: "seascape" })) === "forest-path.png,harbor-dusk.png" &&
      (await found(owner, { tag: " Seascape " })) === "forest-path.png,harbor-dusk.png" &&
      (await found(owner, { q: "forest", tag: "seascape" })) === "forest-path.png" &&
      (await found(owner, { q: "harbor", tag: "moss" })) === "",
    'a tag, in any spelling such as " Seascape ", finds exactly its images, and a search with a tag finds only images that match both',
  );
  const tagged = (await owner.query(api.library.filter, { tag: "seascape" })).items;
  assert(
    tagged.map(({ refId }) => refId).join() === [harbor, forest].join(),
    "the images of a tag come newest tagged first, not newest saved first",
  );
  assert(
    (await found(owner, { tag: "seascape", collectionId: board })) === "harbor-dusk.png" &&
      (await found(owner, { q: "dune", collectionId: board })) === "desert-dune.png" &&
      (await found(owner, { q: "forest", collectionId: board })) === "",
    "with a collection, filter finds only the collection's members",
  );

  await owner.mutation(api.ref.update, { refId: harbor, fileName: "quay-night.png" });
  await owner.mutation(api.ref.update, { refId: harbor, note: "Painted for the ember glow." });
  await owner.mutation(api.ref.removeTags, { refId: forest, names: ["moss"] });
  assert(
    (await found(owner, { q: "harbor" })) === "" &&
      (await found(owner, { q: "quay" })) === "quay-night.png" &&
      (await found(owner, { q: "lantern" })) === "" &&
      (await found(owner, { q: "ember" })) === "quay-night.png" &&
      (await found(owner, { q: "moss" })) === "" &&
      (await found(owner, { tag: "moss" })) === "",
    "a rename, a new note, and a removed tag each change what filter finds at once",
  );

  await owner.mutation(api.library.remove, { refIds: [desert] });
  assert(
    (await found(owner, { q: "dune" })) === "" &&
      (await found(owner, { q: "dune", collectionId: board })) === "",
    "an image in the trash is not found, in the library or in its collection",
  );
  await owner.mutation(api.library.restore, { refIds: [desert] });
  assert(
    (await found(owner, { q: "dune" })) === "desert-dune.png" &&
      (await found(owner, { q: "dune", collectionId: board })) === "desert-dune.png",
    "after a restore the image is found again",
  );

  const fresh = await save(page, "lighthouse-cliff.png", await pngOf(page, "rgb(90, 90, 90)", 300));
  owner = await clientFor(page);
  const freshFound = await owner.query(api.library.filter, { q: "lighthouse" });
  assert(
    freshFound.items.map(({ refId }) => refId).join() === fresh && !freshFound.more,
    "an image saved now is found by its file name at once",
  );

  const everything = "desert-dune.png,forest-path.png,lighthouse-cliff.png,quay-night.png";
  await page.goto(`${appUrl}/trash`);
  await page.goto(`${appUrl}/library`);
  await showsFor(page, null, null, everything);
  await searchField(page).pressSequentially("quay", { delay: 50 });
  await showsFor(page, "quay", null, "quay-night.png");
  assert(
    true,
    "typing a word of an image's name in Search shows that image alone, and the URL holds q",
  );
  await searchField(page).pressSequentially(" night", { delay: 50 });
  await showsFor(page, "quay night", null, "quay-night.png");
  await page.goBack();
  await showsFor(page, null, null, everything);
  assert(
    new URL(page.url()).pathname === "/library" && (await searchField(page).inputValue()) === "",
    "one press of the back button after two searches leaves the filtered view and empties the field",
  );

  for (const [word, names] of [
    ["ember", "quay-night.png"],
    ["wharfside", "quay-night.png"],
    ["seascape", "forest-path.png,quay-night.png"],
    ["lighth", "lighthouse-cliff.png"],
  ] as const) {
    await searchField(page).fill(word);
    await showsFor(page, word, null, names);
  }
  assert(
    true,
    `on the page, a word of the note, a word of the source, a tag, and the start of a name each find the image`,
  );
  await searchField(page).fill("  ");
  await showsFor(page, null, null, everything);
  assert(true, "an empty Search field leaves q out of the URL and shows the whole library");

  await chooseTag(page, "seascape");
  await showsFor(page, null, "seascape", "forest-path.png,quay-night.png");
  await searchField(page).fill("forest");
  await showsFor(page, "forest", "seascape", "forest-path.png");
  assert(
    true,
    "choosing a tag shows exactly its images and the URL holds tag, and a search with a tag shows images that match both",
  );
  if (evidence) {
    await page.screenshot({ path: `${evidence}/01-filtered-library.png`, fullPage: true });
  }
  await page.reload();
  await showsFor(page, "forest", "seascape", "forest-path.png");
  assert(
    (await searchField(page).inputValue()) === "forest" && (await shownTag(page)) === "seascape",
    "a reload keeps both filters, the fields, and the results",
  );
  await page.getByRole("link", { name: "Clear filters" }).click();
  await showsFor(page, null, null, everything);
  assert(
    (await searchField(page).inputValue()) === "" && (await shownTag(page)) === "",
    "Clear filters brings the whole library back and empties both fields",
  );

  // Typing that has not reached the URL yet must not put a filter back after Clear.
  await searchField(page).fill("forest");
  await showsFor(page, "forest", null, "forest-path.png");
  await searchField(page).fill("dune");
  await page.getByRole("link", { name: "Clear filters" }).click();
  await Bun.sleep(900);
  assert(
    searchParam(page, "q") === null &&
      (await searchField(page).inputValue()) === "" &&
      (await shown(page)) === everything,
    `Clear filters right after typing leaves no filter, though the typed text had not reached the URL: q=${searchParam(page, "q")}`,
  );

  await page.goto(`${appUrl}/library?q=true`);
  await until(
    async () => (await searchField(page).inputValue()) === "true",
    "?q=true puts the text true in the Search field",
  );
  await page.getByText("No images match.").waitFor();
  assert(true, "a hand-typed ?q=true is the search text true, not a missing filter");

  await page.goto(`${appUrl}/library?tag=Seascape`);
  await until(
    async () => (await shown(page)) === "forest-path.png,quay-night.png",
    "?tag=Seascape shows the seascape images",
  );
  assert(
    (await shownTag(page)) === "seascape",
    "a tag typed into the URL as Seascape filters by seascape",
  );

  await page.goto(`${appUrl}/c/${board}?view=gallery`);
  await showsFor(page, null, null, "desert-dune.png,quay-night.png");
  await chooseTag(page, "seascape");
  await showsFor(page, null, "seascape", "quay-night.png");
  await chooseTag(page, "");
  await searchField(page).fill("dune");
  await showsFor(page, "dune", null, "desert-dune.png");
  await searchField(page).fill("forest");
  await showsFor(page, "forest", null, "");
  assert(true, "on a collection's page the filters show only the collection's members");

  await page.goto(`${appUrl}/library`);
  await searchField(page).fill("beacon");
  await showsFor(page, "beacon", null, "");
  await page.getByLabel("Add images").setInputFiles([
    {
      name: "beacon-tower.png",
      mimeType: "image/png",
      buffer: await pngOf(page, "rgb(220, 90, 20)", 300),
    },
  ]);
  await showsFor(page, "beacon", null, "beacon-tower.png");
  assert(
    true,
    "the file input stays on a filtered gallery, and an image saved there shows in it at once by its file name",
  );

  await searchField(page).fill("quay");
  await showsFor(page, "quay", null, "quay-night.png");
  await cards(page).locator("img").click();
  await page.waitForURL(`${appUrl}/r/${harbor}`);
  await page.getByRole("link", { name: "seascape", exact: true }).click();
  await page.waitForURL(`${appUrl}/library?tag=seascape`);
  await showsFor(page, null, "seascape", "forest-path.png,quay-night.png");
  assert(true, "a tag on the image page links to the library filtered by that tag");

  await page.goto(`${appUrl}/r/${harbor}`);
  const submit = async (label: string, button: string, value: string) => {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: button, exact: true }).click();
  };
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await submit("Name", "Save name", "pier-morning.png");
  await page.getByRole("heading", { name: "pier-morning", exact: true }).waitFor();
  await submit("Note", "Save note", "Painted for the coral glow.");
  await page.getByRole("button", { name: "Remove the tag seascape" }).click();
  await page.locator('[data-tag="seascape"]').waitFor({ state: "detached" });
  await until(
    async () =>
      (await owner.query(api.ref.get, { refId: harbor })).note?.includes("coral") ?? false,
    "the note is saved",
  );
  for (const [query, names] of [
    ["q=quay", ""],
    ["q=pier", "pier-morning.png"],
    ["q=ember", ""],
    ["q=coral", "pier-morning.png"],
    ["tag=seascape", "forest-path.png"],
  ] as const) {
    await page.goto(`${appUrl}/library?${query}`);
    const [key, value] = query.split("=") as [string, string];
    await showsFor(page, key === "q" ? value : null, key === "tag" ? value : null, names);
  }
  assert(
    true,
    "renaming, a new note, and removing a tag on the image page each change what Search finds",
  );

  await page.goto(`${appUrl}/library?q=pier`);
  await showsFor(page, "pier", null, "pier-morning.png");
  await cards(page).hover();
  await cards(page).getByRole("button", { name: "Move to trash" }).click();
  await showsFor(page, "pier", null, "");
  await page.goto(`${appUrl}/trash`);
  await cards(page).getByRole("button", { name: "Restore" }).click();
  await cards(page).first().waitFor({ state: "detached" });
  await page.goto(`${appUrl}/library?q=pier`);
  await showsFor(page, "pier", null, "pier-morning.png");
  assert(true, "an image deleted from a filtered gallery is not found, and after a restore it is");

  await page.goto(`${appUrl}/c/${board}?q=pier`);
  await page.locator("canvas").waitFor();
  assert(
    (await searchField(page).count()) === 0 && (await tagChips(page).count()) === 0,
    "a collection's canvas, which its page opens with no view, shows neither filter",
  );

  await page.goto(`${appUrl}/library?q=pier&view=canvas`);
  await showsFor(page, "pier", null, "pier-morning.png");
  assert(
    (await page.getByTestId("canvas").count()) === 0 &&
      (await page.getByRole("link", { name: "Canvas" }).count()) === 0 &&
      (await page.getByRole("link", { name: "Gallery" }).count()) === 0,
    "/library has no view links, and with view=canvas in its URL it shows the filtered gallery and no canvas",
  );

  owner = await clientFor(page);
  const original = (await rows("refs")).find((row) => row._id === desert)?.blobs.original;
  const blob = (await rows("blobs")).find((row) => row._id === original);
  for (let batch = 0; batch < 201; batch += 25) {
    await Promise.all(
      Array.from({ length: Math.min(25, 201 - batch) }, (_, index) =>
        owner.action(api.library.save, {
          sha256: blob.sha256,
          fileName: `crowd-${batch + index}.png`,
          width: blob.width,
          height: blob.height,
          thumbHash: blob.thumbHash,
          variants: {},
        }),
      ),
    );
  }
  const crowd = await owner.query(api.library.filter, { q: "crowd" });
  assert(
    crowd.items.length === 200 && crowd.more,
    `with 201 matches, filter returns 200 and says there are more: ${crowd.items.length}, more ${crowd.more}`,
  );
  await page.goto(`${appUrl}/library?q=crowd`);
  await page.getByText("Showing the first 200 matches.").waitFor();
  assert((await cards(page).count()) === 200, "the page shows 200 cards and says there are more");

  await signInWithPasskey(second.page, `check-search-b-${stamp}`);
  await searchField(second.page).fill("pier");
  await showsFor(second.page, "pier", null, "");
  assert(true, "a second user's Search finds none of the first user's images");
  const other = await clientFor(second.page);
  const words = ["pier", "coral", "wharfside", "seascape", "dune", "forest", "lighthouse", "crowd"];
  const foreign = await Promise.all(words.map((q) => found(other, { q })));
  assert(
    foreign.every((names) => names === "") && (await found(other, { tag: "seascape" })) === "",
    "a second user finds none of the first user's images, by any word or by tag",
  );
  assert(
    (await outcome(other.query(api.library.filter, { q: "dune", collectionId: board }))) ===
      "CollectionNotFound",
    "filter on the first user's collection fails with CollectionNotFound for the second user",
  );
  assertCleanConsole();
} finally {
  await first.browser.close();
  await second.browser.close();
}
