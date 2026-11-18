# Collections

A collection is a named set of images in the library. In the sidebar, on every page, the user makes a collection and sees each one as a link. On `/library` the user adds an image to one from the image's card. `/c/{collectionId}` shows the collection's images in the same grid as the library, with a rename form and the same file picker. An image saved there goes into the library and into the collection. An image removed from a collection stays in the library and in its other collections. A collection also has its own canvas, and removing an image from that canvas takes it out of the collection. Each user sees only their own collections.

## Sub-features

- `collections-create` makes a collection from the `New collection` form in the sidebar and lists it there.
- `collections-open` opens a collection's link to `/c/{collectionId}`, which shows its name and its images.
- `collections-upload` saves a picked file on a collection's page into the library and into the collection.
- `collections-add` adds a library image to a collection from the card's `Add to collection` list.
- `collections-remove` takes an image out of a collection with the card's `Remove from collection` button.
- `collections-rename` renames a collection from its page.
- `collections-names` refuses an empty name, a name of spaces, and a name over 100 characters, and trims the rest.
- `collections-canvas` opens the collection's own canvas from the `Canvas` link on its page. The Canvas recipe drives it.
- `collections-private` shows another user's collection as `Collection not found.`

## How to get to it (user POV)

- Open `/library` and use the `Collections` section. Sign-in lands here.
- Choose a collection's link in the sidebar to open `/c/{collectionId}`.
- Choose `Gallery` or `Canvas` on a collection's page to switch its view.
- Choose a card's `Add to collection` list on `/library`. It shows only when the user has a collection.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`, with at least one saved image for the add path.

- **Create.** Fill `page.getByLabel("New collection")` and click `page.getByRole("button", { name: "Create" })`. A link with the trimmed name appears. Find it with `page.getByRole("link", { name, exact: true })`. It carries `data-collection-id`.
- **Open.** Click the link. The page goes to `/c/{collectionId}` and shows the name as a heading. An empty collection shows `Nothing saved yet.`
- **Upload.** On the collection's page, run `page.getByLabel("Add images").setInputFiles(...)`. The outcome line reads `saved.` A card with `data-ref-id` appears on the page and on `/library`.
- **Add.** On `/library`, run `page.locator('[data-ref-id="<refId>"]').getByLabel("Add to collection").selectOption({ label: name })`. The page shows no confirmation. Wait for the membership with `verify.sh rows collectionRefs` or `collections.refs`, then open the collection to see the card.
- **Remove.** On the collection's page, click the card's `Remove from collection` button. The card leaves that page and stays on `/library`.
- **Rename.** On the collection's page, fill `page.getByLabel("Collection name")` and click `Rename`. The heading and the link in the sidebar show the trimmed name.
- **Private.** A second user opening the first user's `/c/{collectionId}` sees `Collection not found.`
- **Proof.** Screenshot `/library` with its collection links and a collection's page with images. Read `verify.sh rows collectionRefs`, filter it to the `collectionId`, and confirm one row per image in the collection.

`apps/web/checks/collections.ts` runs this journey and adds the rules the UI cannot reach: adding an image twice, two adds at once, refused names, and what a second user gets from every function.

## Gotchas

- After a link click, `page.waitForURL` resolves before the collection's page renders. Wait for its heading before you use `Add images`, or the file goes to the library page's input.
- The collection list loads after the page. Wait for a link by its name, never by its position in a count taken before the list loaded.
- `Add to collection` saves with no message on the page. Poll for the membership before you leave the page, or the navigation can cut the call off.
- The `Add to collection` list is absent when the user has no collection, so a card's text is only the file name then.
- A collection's page reads the name from the user's own collection list, so a foreign or unknown ID shows `Collection not found.` without calling `collections.refs`.
- Two collections may share a name. Use `data-collection-id` when names can repeat.
