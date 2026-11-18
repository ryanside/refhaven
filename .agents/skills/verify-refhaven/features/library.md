# Library

The library lets a signed-in user save image files and see every saved image in a grid, newest first. The bytes go straight from the browser to R2. The browser also makes a 512 px WebP thumbnail and a 2048 px WebP display copy of an image larger than each, and a ThumbHash of every image. The grid shows the thumbnail, and the ThumbHash until the thumbnail loads. Saving bytes the library already holds adds a second entry without a second upload, and the page says so. Each user sees only their own images.

## Sub-features

- `library-empty` shows `Nothing saved yet.` for a new user.
- `library-save` saves one or more picked files and reports an outcome for each.
- `library-paste-drop` saves image files pasted or dropped anywhere on the page, the same way. The canvas takes them too and places each image, as the Canvas recipe says.
- `library-grid` shows each saved image with its file name, newest first, and the images load.
- `library-variants` uploads a thumbnail and a display copy for an image larger than 512 px and 2048 px, and the grid shows the thumbnail.
- `library-placeholder` shows the ThumbHash as the image's background until the thumbnail loads.
- `library-duplicate` saves bytes the library already holds without uploading them again.
- `library-reject` refuses a file that is not a PNG, JPEG, WebP, GIF, or AVIF.
- `library-private` keeps one user's images out of another user's library.

## How to get to it (user POV)

- Open `/library`. Sign-in lands here.
- Choose the `Library` link, or the `refhaven` link above it, in the sidebar from any app page.
- Choose `Open your library` on the landing page `/`.

Images are added through the `Add images` file picker on `/library`, by dropping files anywhere on the page, or by pasting an image. A collection's page takes the same three and saves into the collection. The canvas view of the library and of a collection takes the same three and places each saved image on the canvas. `/trash` saves none. Every signed-in page refuses a dropped file it does not save, so the browser never opens it.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`.
- Test images made in the page, each with a different color or size, so each has its own hash. Make one 3000 by 2000 to get both variants, and one 300 px to get none. Fill it with a gradient, since a single color gives variants of almost the same byte size.

- **Empty state.** Run `await page.getByText("Nothing saved yet.").waitFor()`.
- **Save.** Pick files. Run `await page.getByLabel("Add images").setInputFiles([{ name: "red.png", mimeType: "image/png", buffer }])`. One `[role="status"] li` appears per file, with `data-outcome="saved"` and the text `red.png: saved.`
- **Paste or drop.** Send the page a `drop` or `paste` event that carries files, with `send` from `apps/web/checks/browser.ts`. The page cancels the event, and one outcome line appears per file. An event that carries only text is not cancelled and saves nothing. A paste into a text field, and a drag that began on the page itself, save nothing either.
- **Grid.** Run `await page.locator("[data-ref-id]").first().waitFor()`. Each card holds an `img` and the file name. The newest card is first. Wait until every image has loaded with `page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")].every((image) => image.complete && image.naturalWidth > 0))`.
- **Variants.** Count the `PUT` requests to `*.r2.cloudflarestorage.com` with `page.on("request", ...)`. A 3000 by 2000 image sends three, to `/w/{workspaceId}/o/{sha256}`, `/w/{workspaceId}/v/{sha256}/512.webp`, and `/w/{workspaceId}/v/{sha256}/2048.webp`. A 300 px image sends one. The card's `img` has a `naturalWidth` of 512 for the large image and 300 for the small one.
- **Placeholder.** Abort `GET` requests to R2 with `page.route`, then reload. Each card's `img` has `style.backgroundImage` starting with `url("data:image/png;base64`. Once the image loads the style is empty.
- **Duplicate.** Pick the same bytes again under another file name. The new outcome reads `saved. Your library already had this image, so its bytes were reused.` A new card appears. No `PUT` request goes to `*.r2.cloudflarestorage.com`. Count them with `page.on("request", ...)`.
- **Reject.** Pick a text file named `note.png`. The outcome has `data-outcome="rejected"` and reads `not saved (UnsupportedImage)`. No card appears.
- **Private.** Sign a second user in from a second `openPageWithPasskeyDevice()`. Their `/library` shows `Nothing saved yet.`
- **Proof.** Screenshot the grid after the save and after the duplicate. Read `verify.sh rows refs` and `verify.sh rows blobs`, filter both to the run's `workspaceId`, and confirm one Ref per card and one Blob per distinct file. A Blob carries `thumbHash`, and `variants` with the `byteSize`, `width`, and `height` of each variant it has.

`apps/web/checks/library.ts` runs this journey and adds the rules the UI cannot reach, such as a second user asking for any role's URL of the first user's image, or a PNG claimed as a WebP variant.

## Gotchas

- The `workspaceId` of the run is the second segment of the upload path, `/w/{workspaceId}/o/{sha256}`. Read it from the `PUT` request.
- The uploads of one image run at the same time, so their order varies. Match the paths as a set.
- `library.urls` takes a `role` of `original`, `thumbnail`, or `display`. A role the Blob has no variant for serves the original.
- An image saved before variants existed, or from a browser that cannot encode WebP, has no variants. It shows its original. Saving the same bytes again from a browser that can encode WebP uploads the missing variants, so that one duplicate does send `PUT` requests.
- A reload clears the outcome list.
- Playwright cannot drag a file from the desktop. The check builds a `DataTransfer` in the page and dispatches the events, so it proves the page's handling and not the operating system's drag.
- The outcome list reports one line per picked file, in order. Wait for the line you expect, not for a fixed count of cards.
- Image URLs are signed and expire after an hour. Read `src` from the card when you need it. Never store one for a later run.
- A card's `img` has no `src` for a moment after the card appears, until the page has fetched the signed URL.
- The file picker accepts `image/*` and a person cannot pick another file with it. `setInputFiles` and a drop can both offer one, and the page reports it as not saved.
- Files are saved one after another. The picker is cleared after the last one.
