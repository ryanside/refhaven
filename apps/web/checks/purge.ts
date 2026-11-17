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

const day = 24 * 60 * 60 * 1000;
const stamp = Date.now().toString(36);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const backend = `${import.meta.dir}/../../../packages/backend`;
const firstPage = { paginationOpts: { numItems: 100, cursor: null } };

const cards = (page: Page) => page.locator("[data-ref-id]");

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
  const [pHash, sHash, dHash, rHash, qHash, bigHash] = [
    pBuffer,
    sBuffer,
    dBuffer,
    rBuffer,
    qBuffer,
    bigBuffer,
  ].map((buffer) => sha256(buffer));
  const bigBlob = before.blobsOf(workspace, bigHash!)[0]!;
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
  const fBuffer = await pngOf(second.page, "rgb(250, 120, 0)", 140, 90);
  await save(second.page, [{ name: "f.png", buffer: fBuffer }]);
  const intruder = await clientFor(second.page);
  const f = (await refsByName(intruder)).get("f.png")!;
  await intruder.mutation(api.library.remove, { refIds: [f] });
  const fObject = await signed(intruder, f, "original");

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

  const purgeAt = async (now: number) => {
    const args = JSON.stringify({ pretend: { workspaceId: workspace, now } });
    return Number(await convexRun("trash:purge", args));
  };
  const sweepAt = async (now: number) => {
    const args = JSON.stringify({ pretend: { workspaceId: workspace, now } });
    return JSON.parse(await convexRun("trash:sweep", args)) as { swept: number; deleted: number };
  };

  const at29 = lastLate + 29 * day;
  assert(
    (await purgeAt(at29)) === 0 &&
      (await state()).refs.filter((row) => row.workspaceId === workspace).length ===
        trashed.refs.filter((row) => row.workspaceId === workspace).length,
    "a purge 29 days after the last delete purges nothing",
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

  const swept = await sweepAt(atLate + 8 * day);
  const afterSweep = await state();
  assert(
    swept.swept === 4 && swept.deleted === 6 && afterSweep.orphansIn(workspace).length === 0,
    `a sweep 8 days after the purges takes the four orphan rows and deletes six objects: ${JSON.stringify(swept)}`,
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

  const again = { purged: await purgeAt(atLate + 8 * day), swept: await sweepAt(atLate + 8 * day) };
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

  assert(
    typeof afterAgain.refRow(f)?.deletedAt === "number" &&
      afterAgain.blobsOf(foreignWorkspace, sha256(fBuffer)).length === 1 &&
      afterAgain.orphansIn(foreignWorkspace).length === 0 &&
      (await held(fObject)),
    "the second user's Ref, deleted before every pretend time above, keeps its row, its Blob, and its object in R2",
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
