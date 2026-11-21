# Collections

A collection is a named set of images in the library. On `/library` the shelf above the images shows each collection as a link with its pile and count, and ends in a `New collection` field. The top bar's `Collections` menu lists them on every page and makes one too. On `/library` the user adds an image to one from the card's `Add to a collection` picker, which shows on hover. `/c/{collectionId}` opens the collection as its canvas. Its gallery, at `/c/{collectionId}?view=gallery`, shows the collection's images in the same grid as the library, with the same search, tags, and file picker. The title at the top holds the name, its count, and `Rename`. An image saved there goes into the library and into the collection. An image is in a collection exactly when it is on the collection's canvas, so removing it from either view takes it out of the collection. It stays in the library and in its other collections. Each user sees only their own collections.

## Sub-features

- `collections-create` makes a collection from the `New collection` field on the library's shelf and lists it there.
- `collections-open` opens a collection's link to `/c/{collectionId}`, which shows its name and its canvas, and `Gallery` shows its images as cards.
- `collections-upload` saves a picked file on a collection's page into the library and into the collection.
- `collections-add` adds a library image to a collection from the card's `Add to a collection` picker.
- `collections-remove` takes an image out of a collection with the card's `Remove from collection` button.
- `collections-rename` renames a collection from its page.
- `collections-names` refuses an empty name, a name of spaces, and a name over 100 characters, and trims the rest.
- `collections-canvas` is the collection's own canvas, which its page opens by default and its `Canvas` link opens from the gallery. The Canvas recipe drives it.
- `collections-private` shows another user's collection as `Collection not found.`

## How to get to it (user POV)

- Use the shelf on `/library`, or the `Collections` menu in the top bar on any app page. Sign-in lands on `/library`.
- Choose a collection's link on the shelf or in the `Collections` menu to open `/c/{collectionId}`.
- Choose `Canvas` or `Gallery` on a collection's page to switch its view. The canvas comes first and is the default.
- Hover a card on `/library` and choose `Add to a collection`.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`, with at least one saved image for the add path.

- **Create.** Fill `page.getByLabel("New collection")` and click `page.getByRole("button", { name: "Create" })`. A link with the trimmed name appears. Find it with `page.getByRole("link", { name, exact: true })`. It carries `data-collection-id`.
- **Open.** Click the link. The page goes to `/c/{collectionId}`, shows the name as a heading, and shows `page.getByTestId("canvas")`. Click `page.getByRole("link", { name: "Gallery" })` for `/c/{collectionId}?view=gallery`. An empty collection's gallery shows `Nothing in this collection yet.`
- **Upload.** On the collection's gallery, run `page.getByLabel("Add images").setInputFiles(...)`. The outcome line reads `Saved`. A card with `data-ref-id` appears on the page and on `/library`.
- **Add.** On `/library`, hover the card, click its `Add to a collection` button, then `page.getByRole("dialog").getByRole("button", { name, exact: true })`. The row shows a tick once the image is in. Wait for the membership with `verify.sh rows collectionRefs` or `collections.refs`, then open the collection to see the card.
- **Remove.** On the collection's gallery, hover the card and click its `Remove from collection` button. The card leaves that page and stays on `/library`.
- **Rename.** On the collection's page, click `Rename`, fill `page.getByLabel("Collection name")`, and press Enter. The heading and the shelf's link show the trimmed name.
- **Private.** A second user opening the first user's `/c/{collectionId}` sees `Collection not found.`
- **Proof.** Screenshot `/library` with its collection links and a collection's page with images. Read `verify.sh rows collectionRefs`, filter it to the `collectionId`, and confirm one row per image in the collection.

`apps/web/checks/collections.ts` runs this journey and adds the rules the UI cannot reach: adding an image twice, two adds at once, refused names, and what a second user gets from every function.

## Gotchas

- After a link click, `page.waitForURL` resolves before the collection's page renders. Wait for its heading before you use `Add images`, or the file goes to the library page's input.
- The collection list loads after the page. Wait for a link by its name, never by its position in a count taken before the list loaded.
- `Add to a collection` saves with no message beyond the row's tick. Poll for the membership before you leave the page, or the navigation can cut the call off.
- A card's buttons show on hover and on focus. Hover the card before you click one.
- A collection's page reads the name from the user's own collection list, so a foreign or unknown ID shows `Collection not found.` without calling `collections.refs`.
- Two collections may share a name. Use `data-collection-id` when names can repeat.
