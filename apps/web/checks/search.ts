import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  assert,
  clientFor,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  signInWithPasskey,
} from "./browser";

const stamp = Date.now().toString(36);

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

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
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
      (await found(owner, { q: "zzz harb" })) === "harbor-dusk.png" &&
      (await found(owner, { q: "harb zzz" })) === "",
    `Convex matches the last word as a prefix and every other word whole: "harb" and "zzz harb" find the image, "harb zzz" finds nothing`,
  );
  assert(
    (await found(owner, { q: "dune forest" })) === "desert-dune.png,forest-path.png",
    "an image that matches any one of the words is found",
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

  await signInWithPasskey(second.page, `check-search-b-${stamp}`);
  const other = await clientFor(second.page);
  const words = ["quay", "harb", "ember", "wharfside", "seascape", "dune", "forest", "lighthouse"];
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
} finally {
  await first.browser.close();
  await second.browser.close();
}
