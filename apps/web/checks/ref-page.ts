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
  rows,
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

const refRow = async (refId: string) => (await rows("refs")).find((row) => row._id === refId);
const tagRows = async (refId: string) =>
  (await rows("tags")).filter((row) => row.refId === refId).map((row) => row.name as string);
const tagsOf = async (client: ConvexHttpClient, refId: Id<"refs">) =>
  (await client.query(api.ref.get, { refId })).tags.join();

const consoleErrors: Array<string> = [];
const watchConsole = (page: Page) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
};

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
watchConsole(first.page);
watchConsole(second.page);
try {
  const { page } = first;
  await signInWithPasskey(page, `check-ref-page-a-${stamp}`);
  const owner = await clientFor(page);
  const large = await save(page, "large.png", await pngOf(page, "rgb(40, 170, 70)", 3000, 2000));
  const small = await save(page, "small.png", await pngOf(page, "rgb(200, 30, 30)", 300));

  const saved = await owner.query(api.ref.get, { refId: large });
  assert(
    saved.fileName === "large.png" &&
      saved.width === 3000 &&
      saved.height === 2000 &&
      saved.mimeType === "image/png" &&
      saved.byteSize > 0 &&
      saved.note === null &&
      saved.sourceUrl === null &&
      saved.tags.length === 0 &&
      saved.collections.length === 0 &&
      saved.deletedAt === null,
    `get answers a new image with its name, pixel size, type, and no note, source, tag, or collection: ${saved.width}x${saved.height} ${saved.mimeType}`,
  );

  await owner.mutation(api.ref.update, { refId: large, fileName: "  renamed.png " });
  for (const [label, fileName] of [
    ["an empty name", ""],
    ["a name of spaces", "   "],
    ["a name of 256 characters", "x".repeat(256)],
  ] as const) {
    const updated = await outcome(owner.mutation(api.ref.update, { refId: large, fileName }));
    assert(
      updated.startsWith("refused") && (await refRow(large))?.fileName === "renamed.png",
      `${label} is refused by update and the row keeps the trimmed name before it: ${updated}`,
    );
  }

  await owner.mutation(api.ref.update, { refId: large, note: "a note" });
  const longNote = await outcome(
    owner.mutation(api.ref.update, { refId: large, note: "x".repeat(10_001) }),
  );
  assert(
    longNote.startsWith("refused") && (await refRow(large))?.note === "a note",
    `a note of 10,001 characters is refused and the row keeps the note before it: ${longNote}`,
  );
  await owner.mutation(api.ref.update, { refId: large, note: null });
  assert(
    !("note" in (await refRow(large))),
    "update with a null note removes the field from the row",
  );

  const source = "https://example.com/a?b=c";
  await owner.mutation(api.ref.update, { refId: large, sourceUrl: source });
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://example.com",
    "not a url",
    "",
    `https://example.com/${"x".repeat(2029)}`,
  ]) {
    const updated = await outcome(owner.mutation(api.ref.update, { refId: large, sourceUrl }));
    assert(
      updated.startsWith("refused") && (await refRow(large))?.sourceUrl === source,
      `the source ${JSON.stringify(sourceUrl.slice(0, 40))} is refused and the row keeps the source before it: ${updated}`,
    );
  }
  const mixed = await outcome(
    owner.mutation(api.ref.update, {
      refId: large,
      fileName: "good.png",
      sourceUrl: "javascript:alert(1)",
    }),
  );
  assert(
    mixed.startsWith("refused") && (await refRow(large))?.fileName === "renamed.png",
    `one update with a good name and a bad source writes neither: ${mixed}`,
  );
  await owner.mutation(api.ref.update, { refId: large, sourceUrl: null });
  assert(
    !("sourceUrl" in (await refRow(large))),
    "update with a null source removes the field from the row",
  );

  await owner.mutation(api.ref.addTags, { refId: large, names: ["Mood", " mood ", "MOOD"] });
  await owner.mutation(api.ref.addTags, { refId: large, names: ["Light   and  shadow", "mood"] });
  assert(
    (await tagsOf(owner, large)) === "mood,light and shadow" &&
      (await tagRows(large)).sort().join() === "light and shadow,mood",
    `"Mood", " mood ", "MOOD" make one tag, inner spaces collapse, and get lists tags in the order added: ${await tagsOf(owner, large)}`,
  );
  for (const [label, names] of [
    ["an empty tag", [""]],
    ["a tag of spaces", ["   "]],
    ["a tag of 51 characters", ["x".repeat(51)]],
    ["21 tags in one call", Array.from({ length: 21 }, (_, index) => `tag ${index}`)],
  ] as const) {
    const added = await outcome(owner.mutation(api.ref.addTags, { refId: large, names }));
    assert(
      added.startsWith("refused") && (await tagRows(large)).length === 2,
      `${label} is refused by addTags and adds nothing: ${added}`,
    );
  }
  await owner.mutation(api.ref.removeTags, { refId: large, names: ["MOOD", "absent"] });
  await owner.mutation(api.ref.removeTags, { refId: large, names: ["mood"] });
  assert(
    (await tagsOf(owner, large)) === "light and shadow" &&
      (await tagRows(large)).join() === "light and shadow",
    "removing a tag by any case leaves the other, and removing one the image lacks changes nothing",
  );

  await owner.mutation(api.ref.addTags, { refId: large, names: ["mood"] });
  await owner.mutation(api.ref.addTags, { refId: small, names: ["mood", "zebra", "Anatomy"] });
  assert(
    (await owner.query(api.ref.tags, {})).join() === "anatomy,light and shadow,mood,zebra",
    `tags lists the workspace's distinct tag names sorted, across two images that share one: ${await owner.query(api.ref.tags, {})}`,
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [large] });
  assert(
    JSON.stringify((await owner.query(api.ref.get, { refId: large })).collections) ===
      JSON.stringify([{ collectionId: board, name: "Board" }]),
    "get lists the collection the image is in, with its name",
  );

  await owner.mutation(api.ref.update, { refId: large, note: "kept", sourceUrl: source });
  await owner.mutation(api.library.remove, { refIds: [large] });
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
      Object.values(editsInTrash).every((result) => result === "RefNotFound"),
    `get answers for an image in the trash, and update, addTags, and removeTags fail with RefNotFound: ${JSON.stringify(editsInTrash)}`,
  );
  await owner.mutation(api.library.restore, { refIds: [large] });
  const restored = await owner.query(api.ref.get, { refId: large });
  assert(
    restored.deletedAt === null &&
      restored.note === "kept" &&
      restored.sourceUrl === source &&
      restored.tags.join() === "light and shadow,mood",
    "after restore the note, source, and tags are as they were",
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
      (await refRow(large))?.note === "kept" &&
      (await tagRows(large)).sort().join() === "light and shadow,mood",
    "the second user's tags lists none of the first user's, and the first user's image is unchanged",
  );

  assert(
    consoleErrors.length === 0,
    `the browser console shows no error: ${consoleErrors.join(" | ")}`,
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
