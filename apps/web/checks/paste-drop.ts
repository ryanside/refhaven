import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { Page } from "playwright";
import {
  assert,
  type Carried,
  clientFor,
  consoleWatch,
  openPageWithPasskeyDevice,
  pngOf,
  send,
  signInWithPasskey,
} from "./browser";

const taken = "taken";
const refused = "refused";
const leftAlone = "left alone";

const outcomes = (page: Page) => page.locator('[role="status"] li');
const cardNames = (page: Page) => page.locator("[data-ref-id] p").allTextContents();
const outcomeOf = async (page: Page, name: string) => {
  const line = outcomes(page).filter({ hasText: `${name}:` });
  await line.waitFor();
  return (await line.getAttribute("data-outcome"))!;
};
const png = (name: string, buffer: Buffer): Carried => ({ name, mimeType: "image/png", buffer });

const { browser, page } = await openPageWithPasskeyDevice();
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();
watchConsole(page);
try {
  await signInWithPasskey(page, `check-paste-drop-${Date.now().toString(36)}`);
  await page.getByText("Nothing saved yet.").waitFor();
  const owner = await clientFor(page);
  const libraryNames = async () =>
    (
      await owner.query(api.library.list, { paginationOpts: { numItems: 50, cursor: null } })
    ).page.map((item) => item.fileName);

  const red = png("red.png", await pngOf(page, "rgb(200, 30, 30)", 80));
  const blue = png("blue.png", await pngOf(page, "rgb(30, 30, 200)", 90));
  const overLibrary = await send(page, "dragover", [red]);
  assert(
    overLibrary === taken,
    `the library page lets a drag of files be dropped, from their type alone: ${overLibrary}`,
  );
  const dropped = await send(page, "drop", [red, blue]);
  assert(dropped === taken, `the library page takes the drop: ${dropped}`);
  assert(
    (await outcomeOf(page, "red.png")) === "saved" &&
      (await outcomeOf(page, "blue.png")) === "saved" &&
      (await outcomes(page).allTextContents()).join() === "red.png: saved.,blue.png: saved." &&
      (await libraryNames()).join() === "blue.png,red.png",
    `two dropped images are saved into the library and reported, in the order dropped: ${await libraryNames()}`,
  );
  await page.locator("[data-ref-id]").nth(1).waitFor();
  assert(
    (await cardNames(page)).join() === "blue.png,red.png",
    "the dropped images show in the gallery",
  );

  const green = png("pasted.png", await pngOf(page, "rgb(30, 200, 30)", 70));
  const pasted = await send(page, "paste", [green]);
  assert(pasted === taken, `the library page takes a pasted image: ${pasted}`);
  assert(
    (await outcomeOf(page, "pasted.png")) === "saved" &&
      (await libraryNames()).join() === "pasted.png,blue.png,red.png",
    "a pasted image is saved into the library",
  );

  const unsaved = async () =>
    `${await outcomes(page).count()} outcomes, ${(await libraryNames()).length} images`;
  const before = await unsaved();
  assert(
    (await send(page, "paste", "some text")) === leftAlone &&
      (await send(page, "dragover", "some text")) === leftAlone &&
      (await send(page, "drop", "some text")) === leftAlone &&
      (await unsaved()) === before,
    "a paste or a drag that carries text and no file is left alone, and saves nothing",
  );

  const teal = png("into-field.png", await pngOf(page, "rgb(30, 200, 200)", 40));
  const intoField = await send(page, "paste", [teal], "input:not([type=file])");
  assert(
    intoField === leftAlone && (await unsaved()) === before,
    `a paste into a text field is left to the field, even when it carries an image: ${intoField}`,
  );

  await send(page, "dragstart", [teal]);
  const ownDragOver = await send(page, "dragover", [teal]);
  const ownDrop = await send(page, "drop", [teal]);
  await send(page, "dragend", [teal]);
  assert(
    ownDragOver === refused && ownDrop === refused && (await unsaved()) === before,
    `a drag that starts in the page is refused and saves nothing, though it carries a file: ${ownDragOver}`,
  );
  const afterOwnDrag = await send(page, "dragover", [teal]);
  assert(
    afterOwnDrag === taken,
    `once that drag ends, a drag of files is taken again: ${afterOwnDrag}`,
  );

  const notes = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") };
  const droppedNotes = await send(page, "drop", [notes]);
  assert(
    droppedNotes === taken &&
      (await outcomeOf(page, "notes.txt")) === "rejected" &&
      (await libraryNames()).length === 3,
    `a dropped file that is not an image is taken, gets an outcome, and is not saved: ${await outcomes(page).filter({ hasText: "notes.txt" }).textContent()}`,
  );

  await page.getByLabel("New collection").fill("Board");
  await page.getByRole("button", { name: "Create" }).click();
  const link = page.getByRole("link", { name: "Board", exact: true });
  await link.waitFor();
  const board = (await link.getAttribute("data-collection-id")) as Id<"collections">;
  await link.click();
  await page.getByRole("heading", { name: "Board" }).waitFor();
  await page.getByRole("link", { name: "Gallery" }).click();
  await page.getByText("Nothing saved yet.").waitFor();
  const members = async () =>
    (
      await owner.query(api.collections.refs, {
        collectionId: board,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page.map((item) => item.fileName);

  const yellow = png("yellow.png", await pngOf(page, "rgb(220, 200, 40)", 60));
  const purple = png("purple.png", await pngOf(page, "rgb(150, 40, 200)", 50));
  await send(page, "drop", [yellow]);
  await outcomeOf(page, "yellow.png");
  await send(page, "paste", [purple]);
  assert(
    (await outcomeOf(page, "purple.png")) === "saved" &&
      (await members()).join() === "purple.png,yellow.png" &&
      (await libraryNames()).length === 5,
    `an image dropped or pasted on a collection's page is saved into the library and into that collection: ${await members()}`,
  );

  // Every move below is a link, so the page is not reloaded and a listener left behind would still run.
  await page.getByRole("link", { name: "refhaven" }).click();
  await page.locator("[data-ref-id]").nth(4).waitFor();
  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("heading", { name: "Trash" }).waitFor();
  const overTrash = await send(page, "dragover", [red]);
  assert(
    overTrash === refused &&
      (await send(page, "drop", [red])) === refused &&
      (await send(page, "paste", [red])) === leftAlone &&
      (await libraryNames()).length === 5,
    `the trash page refuses a drag of files, leaves a paste alone, and saves nothing: ${overTrash}`,
  );

  assertCleanConsole();
} finally {
  await browser.close();
}
