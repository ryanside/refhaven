import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { Page } from "playwright";
import { assert, clientFor, openPageWithPasskeyDevice, pngOf, signInWithPasskey } from "./browser";

type Carried = { name: string; mimeType: string; buffer: Buffer };

/**
 * Sends the page one event of the kind a real drag or paste makes, carrying files or text.
 * Returns whether the page cancelled it, which is how a page takes a drop or a paste for itself.
 */
const send = (
  page: Page,
  kind: "dragover" | "drop" | "paste",
  carried: ReadonlyArray<Carried> | string,
) =>
  page.evaluate(
    ({ kind, files, text }) => {
      const transfer = new DataTransfer();
      for (const { name, mimeType, base64 } of files) {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        transfer.items.add(new File([bytes], name, { type: mimeType }));
      }
      if (text !== null) transfer.setData("text/plain", text);
      const init = { bubbles: true, cancelable: true };
      const event =
        kind === "paste"
          ? new ClipboardEvent(kind, { ...init, clipboardData: transfer })
          : new DragEvent(kind, { ...init, dataTransfer: transfer });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    },
    {
      kind,
      files:
        typeof carried === "string"
          ? []
          : carried.map(({ name, mimeType, buffer }) => ({
              name,
              mimeType,
              base64: buffer.toString("base64"),
            })),
      text: typeof carried === "string" ? carried : null,
    },
  );

const outcomes = (page: Page) => page.locator('[role="status"] li');
const cardNames = (page: Page) => page.locator("[data-ref-id] p").allTextContents();
const outcomeOf = async (page: Page, name: string) => {
  const line = outcomes(page).filter({ hasText: `${name}:` });
  await line.waitFor();
  return (await line.getAttribute("data-outcome"))!;
};
const png = (name: string, buffer: Buffer): Carried => ({ name, mimeType: "image/png", buffer });

const { browser, page } = await openPageWithPasskeyDevice();
const consoleErrors: Array<string> = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));
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
  assert(
    (await send(page, "dragover", [red])) === true,
    "the library page lets a drag that carries files be dropped",
  );
  assert((await send(page, "drop", [red, blue])) === true, "the library page takes the drop");
  assert(
    (await outcomeOf(page, "red.png")) === "saved" &&
      (await outcomeOf(page, "blue.png")) === "saved" &&
      (await libraryNames()).join() === "blue.png,red.png",
    `two dropped images are saved into the library, in the order dropped: ${await libraryNames()}`,
  );
  await page.locator("[data-ref-id]").nth(1).waitFor();
  assert(
    (await cardNames(page)).join() === "blue.png,red.png",
    "the dropped images show in the gallery",
  );

  const green = png("pasted.png", await pngOf(page, "rgb(30, 200, 30)", 70));
  assert((await send(page, "paste", [green])) === true, "the library page takes a pasted image");
  assert(
    (await outcomeOf(page, "pasted.png")) === "saved" &&
      (await libraryNames()).join() === "pasted.png,blue.png,red.png",
    "a pasted image is saved into the library",
  );

  const reported = await outcomes(page).count();
  assert(
    (await send(page, "paste", "some text")) === false &&
      (await send(page, "dragover", "some text")) === false &&
      (await send(page, "drop", "some text")) === false &&
      (await outcomes(page).count()) === reported &&
      (await libraryNames()).length === 3,
    "a paste or a drag that carries text and no file is left alone, and saves nothing",
  );

  const notes = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") };
  await send(page, "drop", [notes]);
  assert(
    (await outcomeOf(page, "notes.txt")) === "rejected" && (await libraryNames()).length === 3,
    `a dropped file that is not an image gets an outcome and is not saved: ${await outcomes(page).filter({ hasText: "notes.txt" }).textContent()}`,
  );

  await page.getByLabel("New collection").fill("Board");
  await page.getByRole("button", { name: "Create" }).click();
  const link = page.getByRole("link", { name: "Board", exact: true });
  await link.waitFor();
  const board = (await link.getAttribute("data-collection-id")) as Id<"collections">;
  await link.click();
  await page.getByRole("heading", { name: "Board" }).waitFor();
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

  // Both moves below are links, so the page is not reloaded and a listener left behind would still run.
  await page.getByRole("link", { name: "refhaven" }).click();
  await page.locator("[data-ref-id]").nth(4).waitFor();
  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("heading", { name: "Trash" }).waitFor();
  assert(
    (await send(page, "dragover", [red])) === false &&
      (await send(page, "drop", [red])) === false &&
      (await send(page, "paste", [red])) === false &&
      (await libraryNames()).length === 5,
    "the trash page, reached by links from the library, takes no drop and no paste, and nothing is saved",
  );

  assert(
    consoleErrors.length === 0,
    `the browser console shows no error: ${consoleErrors.join(" | ")}`,
  );
} finally {
  await browser.close();
}
