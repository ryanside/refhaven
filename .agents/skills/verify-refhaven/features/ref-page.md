# Image page

Each image has its own page at `/r/{refId}`. It shows the image large as its 2048 px copy, its pixel size, byte size, type, and save time, and a link that opens the original in a new tab. The owner saves the image's name, a note, and the link it came from, each on its own submit, and adds and removes tags. A refused value shows a line with `role="alert"` and saves nothing. The page lists the collections the image is in and deletes or restores the image. A page for an image in the trash still opens, with its fields disabled. Each user sees only their own images.

## Sub-features

- `ref-open` opens the page from the image on any gallery card, or the card menu's `Open`: the library, a collection, or the trash.
- `ref-image` shows the 2048 px copy, the full file name, the pixel size and type, and an `Open the original` link.
- `ref-steps` steps to the previous and next image of the list that opened the page, the library in its order, a collection's gallery, or the trash, with `Previous image` and `Next image` or ← and →. Neither goes past an end. A page opened by its link steps through the library. Escape goes back to the list, and on a page opened by its link it opens the library.
- `ref-name` renames the image. The new name shows on the page and on its cards.
- `ref-note` saves a note, and an empty note clears it.
- `ref-source` saves a source and shows it as a link. Only an http or https URL is accepted, and an empty source clears it.
- `ref-tags` adds and removes tags. "Mood", " mood ", and "MOOD" are one tag, `mood`. The field suggests the user's tags.
- `ref-collections` lists the collections the image is in, each a link to `/c/{collectionId}`. The library's shelf and the `Collections` menu link collections too, so find these inside `page.getByRole("main")`.
- `ref-trash` moves the image to the trash with `Move to trash` and brings it back with `Restore`. Its note, source, and tags stay.
- `ref-private` shows another user's image, or a missing one, as `Image not found.`

## How to get to it (user POV)

- Click the image on a card on `/library`, on a collection's gallery at `/c/{collectionId}?view=gallery`, or on `/trash`.
- Open `/r/{refId}` directly.
- Choose the breadcrumb's first link, in the middle of the top bar, to go back to `Library`, `Trash`, or the collection whose gallery opened the page, or press Escape. A collection's link in the panel opens it. The top bar's own `Library` link sits in `page.getByRole("navigation", { name: "Main" })`.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`, who saved an image through the Library recipe. Use a 3000 by 2000 image from `pngOf` to see the 2048 px copy.

- **Open.** Run `page.locator('[data-ref-id="<refId>"] img').click()` and `page.waitForURL(`${appUrl}/r/<refId>`)`. The heading, like the breadcrumb, is the file name without its image extension, such as `large` for `large.png`. The details list's File row shows the whole file name.
- **Steps.** Press ArrowRight or ArrowLeft, or click `page.getByRole("button", { name: "Next image" })` or `Previous image`, and wait for the neighbor's URL. The button is absent at an end. A step replaces the page in the history, so Escape, or the back button, returns to the list. A page opened by its link has no list behind it, so Escape there, before or after a step, opens `/library` instead of leaving the app. `page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link")` reads `Library`, `Trash`, or the collection's name.
- **Image.** Wait until `page.locator("main img")` is `complete` with a `naturalWidth`. Its `naturalWidth` is 2048 and its `currentSrc` ends in `/2048.webp`. `page.getByText("3000 × 2000 px")` and `page.getByText("image/png", { exact: true })` show. `page.getByRole("link", { name: "Open the original" })` has `target="_blank"`.
- **Fields.** The name is the panel's heading: click `Rename` to turn it into `page.getByLabel("Name", { exact: true })`. A saved source is a link, `page.getByTestId("source")`, with the source as its `href`: click `Edit source` to turn it back into `getByLabel("Source", { exact: true })`, and press Escape to leave the field. Fill a field and click its button `Save name`, `Save note`, or `Save source`, which shows once the value changed. Enter saves the name and the source, Mod+Enter or leaving the field saves the note, and a saved field shows `Saved` by its label, the name by its `Rename` button, for two seconds. Escape leaves an edit of the name or the source with nothing saved, no alert, and no `Saved`. Text typed while the note saves stays in the field. A refused value shows `page.getByRole("alert")` with the rule, such as `A name is 1 to 255 characters.`
- **Tags.** Fill `page.getByLabel("Add a tag")` and click the button `Add`. Each tag is an element with `data-tag="<name>"`, in the order added. Remove one with `page.getByRole("button", { name: "Remove the tag <name>" })`. The suggestions are the `<option>` elements of the field's `<datalist>`.
- **Collections.** Each collection is a link with `data-collection-id`. Clicking it opens `/c/{collectionId}`, the collection's canvas.
- **Trash.** Click the button `Move to trash`. The page shows `This image is in the trash.` and the button `Restore`. Click `Restore` to bring it back.
- **Private.** Open the first user's `/r/{refId}` in a second user's page. It shows `Image not found.` Call `ref.get`, `ref.update`, `ref.addTags`, and `ref.removeTags` from the second user's `clientFor(page)`. Each fails with `RefNotFound`.
- **Proof.** Screenshot the page with a note, a source, two tags, and a collection. Read `verify.sh rows refs` for `fileName`, `note`, and `sourceUrl`, and `verify.sh rows tags` for the tag rows. A cleared note or source has no field in the row.

`apps/web/checks/ref-page.ts` runs this journey and adds the rules the page checks before it sends: refused names, notes, sources, and tags sent straight to the server, one update with a good name and a bad source, 21 tags in one call, `ref.tags` across two images, and the edits a Ref in the trash refuses.

## Gotchas

- The page checks each value before it sends it, so a refused value on the page never reaches the server. Prove the server's rule through the API.
- A save shows `Saved` by the field's label for two seconds. Wait for the new value, such as the heading, the source link, or a `data-tag` element, or wait for the alert to leave.
- An alert stays until the next submit of its form, or until Escape. A source's alert also leaves when another page changes the source. Submit a good value between two refused ones to see each refusal.
- The session token in `localStorage` expires during a long drive. Call `clientFor(page)` again before a later batch of API calls.
- Tags are lowercase. Wait for `data-tag="mood"`, not `Mood`.
