import { createHash } from "node:crypto";
import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  assert,
  clientFor,
  consoleWatch,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";
import { canvasChanges, openCanvas, refOf } from "./canvas-screen";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const stamp = Date.now().toString(36);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const backend = `${import.meta.dir}/../../../packages/backend`;
const firstPage = { paginationOpts: { numItems: 100, cursor: null } };

const cards = (page: Page) => page.locator("[data-ref-id]");
const card = (page: Page, refId: string) => page.locator(`[data-ref-id="${refId}"]`);

const save = async (page: Page, files: Array<{ name: string; buffer: Buffer }>) => {
  const outcomes = page.locator('[role="status"] li');
  const reported = await outcomes.count();
  const shown = await cards(page).count();
  await page
    .getByLabel("Add images")
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "image/png" })));
  await outcomes.nth(reported + files.length - 1).waitFor({ timeout: 60_000 });
  const refused = await page
    .locator('[role="status"] li:not([data-outcome="saved"])')
    .allTextContents();
  if (refused.length > 0) {
    throw new Error(`FAIL the page saves every image it is given: ${refused.join(", ")}`);
  }
  await cards(page)
    .nth(shown + files.length - 1)
    .waitFor();
};

const refsByName = async (client: ConvexHttpClient) =>
  new Map(
    (await client.query(api.library.list, firstPage)).page.map((item) => [
      item.fileName,
      item.refId,
    ]),
  );

/** Whether R2 holds the object behind a signed URL: 206 for one byte of it, 404 for none. */
const held = async (url: string) => {
  const { status } = await fetch(url, { headers: { Range: "bytes=0-0" } });
  if (status !== 206 && status !== 404) throw new Error(`FAIL R2 answered ${status}`);
  return status === 206;
};

const servedExactly = async (client: ConvexHttpClient, refId: Id<"refs">, bytes: Buffer) => {
  const [signed] = await client.mutation(api.library.urls, { refIds: [refId], role: "original" });
  return sha256(new Uint8Array(await (await fetch(signed!.url)).arrayBuffer())) === sha256(bytes);
};

type Row = Record<string, any>;

/** The rows a check reads, newest first. The check's own rows are among the newest. */
const state = async () => {
  const [refs, tags, collectionRefs, canvasItems, blobs, orphans] = await Promise.all([
    rows("refs", 1000),
    rows("tags"),
    rows("collectionRefs"),
    rows("canvasItems", 1000),
    rows("blobs"),
    rows("orphans"),
  ]);
  const refRow = (refId: string): Row | undefined => refs.find((row) => row._id === refId);
  const pointing = (refId: string) => ({
    tags: tags.filter((row) => row.refId === refId).length,
    memberships: collectionRefs.filter((row) => row.refId === refId).length,
    items: canvasItems.filter((row) => row.refId === refId).length,
  });
  const ofBytes = (table: Array<Row>) => (workspaceId: string, hash: string) =>
    table.filter((row) => row.workspaceId === workspaceId && row.sha256 === hash);
  return {
    refs,
    refRow,
    pointing,
    blobsOf: ofBytes(blobs),
    orphansOf: ofBytes(orphans),
    orphansIn: (workspaceId: string) => orphans.filter((row) => row.workspaceId === workspaceId),
    blobsIn: (workspaceId: string) => blobs.filter((row) => row.workspaceId === workspaceId),
  };
};

const evidence = process.env.EVIDENCE;
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
watchConsole(first.page);
watchConsole(second.page);
try {
  const { page } = first;
  await signInWithPasskey(page, `check-purge-a-${stamp}`);
  const pBuffer = await pngOf(page, "rgb(200, 30, 30)", 2100, 300);
  const [kBuffer, lBuffer, sBuffer, dBuffer, rBuffer, qBuffer, bigBuffer] = (await Promise.all(
    [
      "rgb(30, 30, 200)",
      "rgb(30, 160, 30)",
      "rgb(200, 200, 30)",
      "rgb(160, 30, 160)",
      "rgb(30, 160, 160)",
      "rgb(120, 60, 0)",
      "rgb(90, 90, 90)",
    ].map((color, index) => pngOf(page, color, 120 + index * 10, 90)),
  )) as [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];
  await save(page, [
    { name: "p.png", buffer: pBuffer },
    { name: "k.png", buffer: kBuffer },
    { name: "l.png", buffer: lBuffer },
    { name: "s1.png", buffer: sBuffer },
    { name: "d1.png", buffer: dBuffer },
    { name: "r.png", buffer: rBuffer },
    { name: "q.png", buffer: qBuffer },
    { name: "big.png", buffer: bigBuffer },
  ]);
  await save(page, [
    { name: "s2.png", buffer: sBuffer },
    { name: "d2.png", buffer: dBuffer },
  ]);
  const owner = await clientFor(page);
  const names = await refsByName(owner);
  const named = (name: string) => names.get(`${name}.png`)!;
  const [p, k, l, s1, s2, d1, d2, r, q, big] = [
    named("p"),
    named("k"),
    named("l"),
    named("s1"),
    named("s2"),
    named("d1"),
    named("d2"),
    named("r"),
    named("q"),
    named("big"),
  ];

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [p, k] });
  await owner.mutation(api.ref.addTags, { refId: p, names: ["purged"] });
  await owner.mutation(api.ref.addTags, { refId: k, names: ["kept"] });
  const library = await openCanvas(owner, {});
  const collection = await openCanvas(owner, { collectionId: board });

  const before = await state();
  const workspace: Id<"workspaces"> = before.refRow(p)!.workspaceId;
  const [pHash, kHash, sHash, dHash, rHash, qHash, bigHash] = [
    pBuffer,
    kBuffer,
    sBuffer,
    dBuffer,
    rBuffer,
    qBuffer,
    bigBuffer,
  ].map((buffer) => sha256(buffer));
  const bigBlob = before.blobsOf(workspace, bigHash!)[0]!;
  const kBlob = before.blobsOf(workspace, kHash!)[0]!;
  const qBlob = before.blobsOf(workspace, qHash!)[0]!;
  assert(
    before.pointing(p).tags === 1 &&
      before.pointing(p).memberships === 1 &&
      before.pointing(p).items === 2 &&
      before.pointing(k).items === 2 &&
      before.refRow(s1)!.blobs.original === before.refRow(s2)!.blobs.original &&
      before.refRow(d1)!.blobs.original === before.refRow(d2)!.blobs.original &&
      JSON.stringify(Object.keys(before.blobsOf(workspace, pHash!)[0]!.variants).sort()) ===
        '["display","thumbnail"]',
    "before the purge, the image has a tag, a membership, and an item on the library's and the collection's canvas, two pairs of Refs share a Blob, and the wide image has a thumbnail and a display copy",
  );

  const copies = await Promise.all(
    Array.from({ length: 149 }, (_, index) =>
      owner.action(api.library.save, {
        sha256: bigHash!,
        fileName: `big-${index}.png`,
        width: bigBlob.width,
        height: bigBlob.height,
        thumbHash: bigBlob.thumbHash,
        variants: {},
      }),
    ),
  );
  const bigRefs = [big, ...copies.map(({ refId }) => refId)];
  assert(
    copies.every(({ duplicate }) => duplicate),
    "149 more saves of one image's bytes add 149 Refs on its Blob, with one upload",
  );

  const signed = async (
    client: ConvexHttpClient,
    refId: Id<"refs">,
    role: "original" | "thumbnail" | "display",
  ) => (await client.mutation(api.library.urls, { refIds: [refId], role }))[0]!.url;
  const pObjects = await Promise.all(
    (["original", "thumbnail", "display"] as const).map((role) => signed(owner, p, role)),
  );
  const [kObject, dObject, rObject, qObject, sObject, bigObject] = await Promise.all(
    [k, d1, r, q, s2, big].map((refId) => signed(owner, refId, "original")),
  );

  await signInWithPasskey(second.page, `check-purge-b-${stamp}`);
  const [fBuffer, gBuffer, hBuffer, tBuffer] = (await Promise.all(
    ["rgb(250, 120, 0)", "rgb(0, 120, 250)", "rgb(120, 250, 0)", "rgb(250, 0, 120)"].map(
      (color, index) => pngOf(second.page, color, 140 + index * 10, 90),
    ),
  )) as [Buffer, Buffer, Buffer, Buffer];
  await save(second.page, [
    { name: "f.png", buffer: fBuffer },
    { name: "g.png", buffer: gBuffer },
    { name: "h.png", buffer: hBuffer },
    { name: "t.png", buffer: tBuffer },
  ]);
  const intruder = await clientFor(second.page);
  const theirs = await refsByName(intruder);
  const [f, g, h, t] = [
    theirs.get("f.png")!,
    theirs.get("g.png")!,
    theirs.get("h.png")!,
    theirs.get("t.png")!,
  ];
  const [fObject, gObject] = await Promise.all(
    [f, g].map((refId) => signed(intruder, refId, "original")),
  );
  await intruder.mutation(api.library.remove, { refIds: [g] });
  await Bun.sleep(1500);
  await intruder.mutation(api.library.remove, { refIds: [f] });

  for (let start = 0; start < bigRefs.length; start += 100) {
    await owner.mutation(api.library.remove, { refIds: bigRefs.slice(start, start + 100) });
  }
  await owner.mutation(api.library.remove, { refIds: [p, s1, d1, r, q] });
  await Bun.sleep(1500);
  await owner.mutation(api.library.remove, { refIds: [k, d2] });

  const trashed = await state();
  const deletedAt = (refId: Id<"refs">): number => trashed.refRow(refId)!.deletedAt;
  const early = [...bigRefs, p, s1, d1, r, q].map(deletedAt);
  const late = [k, d2].map(deletedAt);
  const lastEarly = Math.max(...early);
  const firstLate = Math.min(...late);
  const lastLate = Math.max(...late);
  const foreignWorkspace = trashed.refRow(f)!.workspaceId;
  assert(
    firstLate - lastEarly >= 1000 && foreignWorkspace !== workspace,
    `the first images went to the trash ${firstLate - lastEarly} ms before the last two, and the second user's image is in another workspace`,
  );

  const purgeAt = async (now: number, workspaceId = workspace) => {
    const args = JSON.stringify({ pretend: { workspaceId, now } });
    return Number(await convexRun("trash:purge", args));
  };
  const sweepAt = async (now: number) => {
    const args = JSON.stringify({ pretend: { workspaceId: workspace, now } });
    return JSON.parse(await convexRun("trash:sweep", args)) as { swept: number; deleted: number };
  };

  // The second user's own purge, of the first image they deleted. It leaves an orphan row in
  // their workspace that is a week old at the first user's sweeps below.
  const theirPurge = await purgeAt(deletedAt(g) + 30 * day + 500, foreignWorkspace);
  const theirOrphans = (await state()).orphansIn(foreignWorkspace);
  assert(
    theirPurge === 1 &&
      theirOrphans.length === 1 &&
      theirOrphans[0]!.sha256 === sha256(gBuffer) &&
      deletedAt(f) - deletedAt(g) >= 1000,
    "the second user's purge, between their two deletes, purges their first image and writes its orphan row",
  );

  const at29 = lastLate + 29 * day;
  assert(
    (await purgeAt(at29)) === 0 &&
      (await state()).refs.filter((row) => row.workspaceId === workspace).length ===
        trashed.refs.filter((row) => row.workspaceId === workspace).length,
    "a purge 29 days after the last delete purges nothing",
  );

  await page.getByRole("link", { name: "Trash", exact: true }).click();
  await page.getByRole("heading", { name: "Trash" }).waitFor();
  await card(page, p).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.screenshot({ path: `${evidence}/01-trash-before-purge.png` });
  assert(
    (await page
      .getByText("Images in the trash are deleted for good 30 days after they were deleted.")
      .count()) === 1 &&
      (await card(page, p).getByText("30 days left").count()) === 1 &&
      (await card(page, k).getByText("30 days left").count()) === 1,
    "/trash says that images there are deleted for good 30 days after they were deleted, and each card deleted today has 30 days left",
  );

  const prepared = await owner.mutation(api.library.prepareUpload, { sha256: qHash!, roles: [] });
  const revs = () =>
    Promise.all(
      [library, collection].map(
        async ({ canvasId }) => (await canvasChanges(owner, { canvasId, rev: 0 })).rev,
      ),
    );
  const revsBefore = await revs();
  const atBoundary = lastEarly + 30 * day + Math.round((firstLate - lastEarly) / 2);
  const purged = await purgeAt(atBoundary);
  const revsAfter = await revs();
  const afterPurge = await state();
  assert(
    purged === bigRefs.length + 5,
    `a purge just past 30 days after the first deletes purges those ${bigRefs.length + 5} Refs, 150 of them on one Blob, in batches: ${purged}`,
  );
  assert(
    afterPurge.refRow(p) === undefined &&
      JSON.stringify(afterPurge.pointing(p)) ===
        JSON.stringify({ tags: 0, memberships: 0, items: 0 }) &&
      (await outcome(owner.query(api.ref.get, { refId: p }))) === "RefNotFound",
    "the purged Ref's row, its tag, its membership, and its items on both canvases are gone, and ref.get answers RefNotFound",
  );
  const libraryAfter = await openCanvas(owner, {});
  const collectionAfter = await openCanvas(owner, { collectionId: board });
  assert(
    JSON.stringify(revsAfter) === JSON.stringify(revsBefore) &&
      !libraryAfter.items.some((item) => refOf(item) === p) &&
      !collectionAfter.items.some((item) => refOf(item) === p) &&
      libraryAfter.placed === 0,
    `the purge raises neither canvas's rev, ${revsBefore} and ${revsAfter}, and canvas.open shows the purged image on neither canvas and places nothing`,
  );
  assert(
    typeof afterPurge.refRow(k)?.deletedAt === "number" &&
      JSON.stringify(afterPurge.pointing(k)) ===
        JSON.stringify({ tags: 1, memberships: 1, items: 2 }) &&
      afterPurge.refRow(d2)?.deletedAt !== undefined,
    "the Refs deleted just under 30 days before stay in the trash, with their tag, membership, and items",
  );
  assert(
    afterPurge.refRow(l)?.deletedAt === undefined && afterPurge.pointing(l).items === 1,
    "a live Ref stays, with its item",
  );
  const pOrphan = afterPurge.orphansOf(workspace, pHash!);
  assert(
    afterPurge.blobsOf(workspace, pHash!).length === 0 &&
      pOrphan.length === 1 &&
      pOrphan[0]!.orphanedAt === atBoundary &&
      JSON.stringify([...pOrphan[0]!.variants].sort()) === '["display","thumbnail"]',
    "the purged image's Blob row is gone, and one orphan row holds its hash, its two variants, and the purge's time",
  );
  assert(
    (await Promise.all(pObjects.map(held))).every(Boolean),
    "after the purge and before the sweep, R2 still holds the original, the thumbnail, and the display copy",
  );
  assert(
    afterPurge.refRow(s1) === undefined &&
      afterPurge.refRow(s2)?.deletedAt === undefined &&
      afterPurge.blobsOf(workspace, sHash!).length === 1 &&
      afterPurge.orphansOf(workspace, sHash!).length === 0,
    "of two Refs on one Blob, the purged one goes, and the Blob row stays for the live one with no orphan row",
  );
  assert(
    afterPurge.refRow(d1) === undefined &&
      afterPurge.blobsOf(workspace, dHash!).length === 1 &&
      afterPurge.orphansOf(workspace, dHash!).length === 0,
    "of two Refs on one Blob, both in the trash, the first purged leaves the Blob row and writes no orphan row",
  );
  assert(
    bigRefs.every((refId) => afterPurge.refRow(refId) === undefined) &&
      afterPurge.blobsOf(workspace, bigHash!).length === 0 &&
      afterPurge.orphansOf(workspace, bigHash!).length === 1,
    "all 150 Refs on one Blob are purged, and their Blob goes with the last",
  );

  await card(page, p).waitFor({ state: "detached" });
  await page.screenshot({ path: `${evidence}/02-trash-after-purge.png` });
  assert(
    (await cards(page).count()) === 2 &&
      (await card(page, k).count()) === 1 &&
      (await card(page, d2).count()) === 1,
    "the open trash page drops the purged images without a reload and keeps the two deleted under 30 days before",
  );

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await card(page, l).waitFor();
  await save(page, [{ name: "r-again.png", buffer: rBuffer }]);
  const rAgain = (await refsByName(owner)).get("r-again.png")!;
  const savedAgain = await state();
  assert(
    savedAgain.orphansOf(workspace, rHash!).length === 0 &&
      savedAgain.blobsOf(workspace, rHash!).length === 1,
    "saving the purged image's bytes again before the sweep deletes its orphan row",
  );

  const qAgain = await owner.action(api.library.save, {
    sha256: qHash!,
    fileName: "q-again.png",
    width: qBlob.width,
    height: qBlob.height,
    thumbHash: qBlob.thumbHash,
    variants: {},
  });
  const savedAcross = await state();
  assert(
    prepared.length === 0 &&
      savedAcross.orphansOf(workspace, qHash!).length === 0 &&
      savedAcross.blobsOf(workspace, qHash!).length === 1 &&
      savedAcross.refRow(qAgain.refId)?.deletedAt === undefined,
    "a save whose prepareUpload ran before the purge and whose save ran after it ends live, with a new Blob row and no orphan row",
  );

  const atLate = lastLate + 30 * day + 1000;
  assert(
    (await purgeAt(atLate)) === 2,
    "a purge past 30 days after the last deletes purges the last two Refs",
  );
  const afterSecond = await state();
  const dOrphan = afterSecond.orphansOf(workspace, dHash!);
  assert(
    afterSecond.refRow(d2) === undefined &&
      afterSecond.refRow(k) === undefined &&
      afterSecond.blobsOf(workspace, dHash!).length === 0 &&
      dOrphan.length === 1 &&
      dOrphan[0]!.orphanedAt === atLate,
    "of two Refs on one Blob, both in the trash, the Blob row goes with the second, and an orphan row is written",
  );

  const early6 = await sweepAt(atBoundary + 6 * day);
  const afterEarlySweep = await state();
  assert(
    early6.swept === 0 &&
      early6.deleted === 0 &&
      afterEarlySweep.orphansIn(workspace).length === 4 &&
      (await Promise.all([...pObjects, kObject!, dObject!, bigObject!].map(held))).every(Boolean),
    `a sweep 6 days after the purge deletes nothing: ${JSON.stringify(early6)}, four orphan rows, and every object still in R2`,
  );

  // A sweep that has begun and has deleted nothing yet: its first mutation alone.
  const atSweep = atLate + 8 * day;
  const begun = JSON.parse(
    await convexRun(
      "trash:sweepBatch",
      JSON.stringify({ pretend: { workspaceId: workspace, now: atSweep } }),
    ),
  ) as { sweeping: Array<{ keys: Array<string> }>; more: boolean };
  const whileSweeping = await state();
  assert(
    begun.sweeping.length === 4 &&
      begun.sweeping.flatMap(({ keys }) => keys).length === 6 &&
      !begun.more &&
      whileSweeping.orphansIn(workspace).length === 4 &&
      whileSweeping.orphansIn(workspace).every((row) => row.sweepingAt === atSweep) &&
      (await Promise.all([...pObjects, kObject!, dObject!, bigObject!].map(held))).every(Boolean),
    "a sweep 8 days after the purges begins by marking the four orphan rows, with every object still in R2",
  );
  const duringSweep = await outcome(
    owner.action(api.library.save, {
      sha256: kHash!,
      fileName: "k-during.png",
      width: kBlob.width,
      height: kBlob.height,
      thumbHash: kBlob.thumbHash,
      variants: {},
    }),
  );
  const offered = await owner.mutation(api.library.prepareUpload, { sha256: kHash!, roles: [] });
  const afterRefusal = await state();
  assert(
    duringSweep === "UploadNotFound" &&
      afterRefusal.blobsOf(workspace, kHash!).length === 0 &&
      afterRefusal.orphansOf(workspace, kHash!)[0]?.sweepingAt === atSweep &&
      offered.length === 1 &&
      !(await refsByName(owner)).has("k-during.png"),
    `a save of bytes that the sweep has begun to delete, while R2 still holds them, fails with ${duringSweep} and writes no Blob row and no Ref, and prepareUpload leaves the orphan row`,
  );
  const tooSoon = await sweepAt(atSweep + 12 * hour - minute);
  assert(
    tooSoon.swept === 0 &&
      tooSoon.deleted === 0 &&
      (await state()).orphansIn(workspace).length === 4 &&
      (await Promise.all([...pObjects, kObject!, dObject!, bigObject!].map(held))).every(Boolean),
    `a second sweep a minute under 12 hours after the first began leaves its rows and its objects alone: ${JSON.stringify(tooSoon)}`,
  );

  const atTakeover = atSweep + 12 * hour;
  const swept = await sweepAt(atTakeover);
  const afterSweep = await state();
  assert(
    swept.swept === 4 && swept.deleted === 6 && afterSweep.orphansIn(workspace).length === 0,
    `a sweep 12 hours after the first began finishes its work: it takes the four orphan rows and deletes six objects: ${JSON.stringify(swept)}`,
  );
  assert(
    (await Promise.all([...pObjects, kObject!, dObject!, bigObject!].map(held))).every(
      (kept) => !kept,
    ),
    "R2 no longer holds the wide image's original, thumbnail, or display copy, nor the originals of the other purged Blobs",
  );
  assert(
    (await held(rObject!)) &&
      (await held(qObject!)) &&
      (await held(sObject!)) &&
      (await servedExactly(owner, rAgain, rBuffer)) &&
      (await servedExactly(owner, qAgain.refId, qBuffer)) &&
      (await servedExactly(owner, s2, sBuffer)),
    "the sweep leaves the bytes saved again before it, the bytes saved across the purge, and the Blob a live Ref shares, and each serves its original byte-exact",
  );

  const again = { purged: await purgeAt(atTakeover), swept: await sweepAt(atTakeover) };
  const afterAgain = await state();
  assert(
    again.purged === 0 &&
      again.swept.swept === 0 &&
      again.swept.deleted === 0 &&
      afterAgain.refs.filter((row) => row.workspaceId === workspace).length ===
        afterSweep.refs.filter((row) => row.workspaceId === workspace).length &&
      afterAgain.blobsIn(workspace).length === afterSweep.blobsIn(workspace).length &&
      (await servedExactly(owner, rAgain, rBuffer)),
    `running the purge and the sweep again changes nothing: ${JSON.stringify(again)}`,
  );

  await save(page, [{ name: "k-again.png", buffer: kBuffer }]);
  const kAgain = (await refsByName(owner)).get("k-again.png")!;
  const afterKAgain = await state();
  assert(
    afterKAgain.blobsOf(workspace, kHash!).length === 1 &&
      afterKAgain.orphansOf(workspace, kHash!).length === 0 &&
      (await servedExactly(owner, kAgain, kBuffer)),
    "after the sweep, the page saves the swept bytes again with a new upload, and the image serves its original byte-exact",
  );

  const theirOrphan = afterKAgain.orphansIn(foreignWorkspace);
  assert(
    typeof afterKAgain.refRow(f)?.deletedAt === "number" &&
      afterKAgain.blobsOf(foreignWorkspace, sha256(fBuffer)).length === 1 &&
      (await held(fObject!)),
    "the second user's Ref, deleted before every pretend time above, keeps its row, its Blob, and its object in R2",
  );
  assert(
    theirOrphan.length === 1 &&
      theirOrphan[0]!.sweepingAt === undefined &&
      theirOrphan[0]!.orphanedAt + 7 * day < atSweep &&
      (await held(gObject!)),
    "the second user's orphan row, a week old at the first user's sweeps, is still there and unmarked, and its object is still in R2",
  );

  // More rows than one purge mutation deletes: an image with 520 tags, and 50 Refs in 6
  // collections, each on its canvas. The purge is run one mutation at a time, to see each state
  // between two of them.
  for (let index = 0; index < 26; index += 1) {
    await intruder.mutation(api.ref.addTags, {
      refId: t,
      names: Array.from({ length: 20 }, (_, tag) => `tag-${index}-${tag}`),
    });
  }
  const hHash = sha256(hBuffer);
  const hBlob = afterKAgain.blobsOf(foreignWorkspace, hHash)[0]!;
  const hCopies = await Promise.all(
    Array.from({ length: 49 }, (_, index) =>
      intruder.action(api.library.save, {
        sha256: hHash,
        fileName: `h-${index}.png`,
        width: hBlob.width,
        height: hBlob.height,
        thumbHash: hBlob.thumbHash,
        variants: {},
      }),
    ),
  );
  const hRefs = [h, ...hCopies.map(({ refId }) => refId)];
  for (let index = 0; index < 6; index += 1) {
    const collectionId = await intruder.mutation(api.collections.create, {
      name: `Many ${index}`,
    });
    await intruder.mutation(api.collections.addRefs, { collectionId, refIds: hRefs });
    await intruder.mutation(api.canvas.open, { collectionId });
  }
  await intruder.mutation(api.library.remove, { refIds: [t] });
  await Bun.sleep(1100);
  await intruder.mutation(api.library.remove, { refIds: hRefs });

  /** The Refs of the 50 that still have a row, and the rows that point at each and at the tagged image. */
  const many = async () => {
    const [refRows, tags, memberships, items] = await Promise.all([
      rows("refs", 1000),
      rows("tags", 1000),
      rows("collectionRefs", 1000),
      rows("canvasItems", 1000),
    ]);
    const present = new Set(refRows.map((row) => row._id as string));
    const count = (table: Array<Row>, refId: string) =>
      table.filter((row) => row.refId === refId).length;
    return {
      lastDeleted: Math.max(
        ...refRows.flatMap((row) => (hRefs.includes(row._id) ? [row.deletedAt as number] : [])),
      ),
      left: hRefs.filter((refId) => present.has(refId)).length,
      // A Ref that kept its row kept every row that points at it, and a purged one kept none.
      whole: hRefs.every((refId) => {
        const pointing = [count(memberships, refId), count(items, refId)].join();
        return pointing === (present.has(refId) ? "6,6" : "0,0");
      }),
      tagged: { row: present.has(t), tags: count(tags, t) },
    };
  };
  const manyBefore = await many();
  const atMany = manyBefore.lastDeleted + 30 * day + 1000;
  const steps: Array<{ purged: number; more: boolean } & Awaited<ReturnType<typeof many>>> = [];
  do {
    const batch = JSON.parse(
      await convexRun(
        "trash:purgeBatch",
        JSON.stringify({ pretend: { workspaceId: foreignWorkspace, now: atMany } }),
      ),
    ) as { purged: number; more: boolean };
    steps.push({ ...batch, ...(await many()) });
  } while (steps.at(-1)!.more);
  const shown = JSON.stringify(
    steps.map(({ purged, left, whole, tagged }) => ({ purged, left, whole, tagged })),
  );
  const afterMany = await state();
  assert(
    manyBefore.left === 50 &&
      manyBefore.whole &&
      manyBefore.tagged.tags === 520 &&
      steps.length > 2 &&
      steps.reduce((sum, { purged }) => sum + purged, 0) === 52 &&
      steps.at(-1)!.left === 0 &&
      afterMany.refRow(f) === undefined &&
      afterMany.blobsOf(foreignWorkspace, hHash).length === 0 &&
      afterMany.orphansOf(foreignWorkspace, hHash).length === 1,
    `a purge of an image with 520 tags and of 50 Refs with 600 rows that point at them takes several mutations and purges all 52 expired Refs: ${shown}`,
  );
  assert(
    steps.every(({ whole }) => whole),
    "between two purge mutations, each of the 50 Refs has its row and every row that points at it, or none of them",
  );
  assert(
    steps.some(({ tagged }) => tagged.row && tagged.tags === 20) &&
      !steps.at(-1)!.tagged.row &&
      steps.at(-1)!.tagged.tags === 0,
    "the image with more tags than one mutation deletes keeps its row while 20 tags are left, and goes with the last of them",
  );
  assertCleanConsole();
} finally {
  await first.browser.close();
  await second.browser.close();
}

/** Runs an internal function on the dev deployment and prints the call, so the transcript records it. */
async function convexRun(name: string, args: string) {
  console.log(`run  bunx convex run ${name} '${args}'`);
  const call = Bun.spawn(["bunx", "convex", "run", name, args], {
    cwd: backend,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, errors, code] = await Promise.all([
    new Response(call.stdout).text(),
    new Response(call.stderr).text(),
    call.exited,
  ]);
  if (code !== 0) throw new Error(`FAIL ${name} exited with ${code}: ${errors}`);
  return output;
}
