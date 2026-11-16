# Library

The library lets a signed-in user save image files and see every saved image in a grid, newest first. The bytes go straight from the browser to R2. Saving bytes the library already holds adds a second entry without a second upload, and the page says so. Each user sees only their own images.

## Sub-features

- `library-empty` shows `Nothing saved yet.` for a new user.
- `library-save` saves one or more picked files and reports an outcome for each.
- `library-grid` shows each saved image with its file name, newest first, and the images load.
- `library-duplicate` saves bytes the library already holds without uploading them again.
- `library-reject` refuses a file that is not a PNG, JPEG, WebP, GIF, or AVIF.
- `library-private` keeps one user's images out of another user's library.

## How to get to it (user POV)

- Open `/library`. Sign-in lands here.
- Choose the `refhaven` link in the header from any app page.
- Choose `Open your library` on the landing page `/`.

Images are added through the `Add images` file picker on `/library`. It is the only entry point today. Paste and drop do not exist yet.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`.
- Test images made in the page, each with a different color or size, so each has its own hash.

- **Empty state.** Run `await page.getByText("Nothing saved yet.").waitFor()`.
- **Save.** Pick files. Run `await page.getByLabel("Add images").setInputFiles([{ name: "red.png", mimeType: "image/png", buffer }])`. One `[role="status"] li` appears per file, with `data-outcome="saved"` and the text `red.png: saved.`
- **Grid.** Run `await page.locator("[data-ref-id]").first().waitFor()`. Each card holds an `img` and the file name. The newest card is first. Wait until every image has loaded with `page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")].every((image) => image.complete && image.naturalWidth > 0))`.
- **Duplicate.** Pick the same bytes again under another file name. The new outcome reads `saved. Your library already had this image, so its bytes were reused.` A new card appears. No `PUT` request goes to `*.r2.cloudflarestorage.com`. Count them with `page.on("request", ...)`.
- **Reject.** Pick a text file named `note.png`. The outcome has `data-outcome="rejected"` and reads `not saved (UnsupportedImage)`. No card appears.
- **Private.** Sign a second user in from a second `openPageWithPasskeyDevice()`. Their `/library` shows `Nothing saved yet.`
- **Proof.** Screenshot the grid after the save and after the duplicate. Read `verify.sh rows refs` and `verify.sh rows blobs`, filter both to the run's `workspaceId`, and confirm one Ref per card and one Blob per distinct file.

`apps/web/checks/library.ts` runs this journey and adds the rules the UI cannot reach, such as a second user asking for the first user's image URL.

## Gotchas

- The `workspaceId` of the run is the second segment of the upload path, `/w/{workspaceId}/o/{sha256}`. Read it from the `PUT` request.
- The outcome list reports one line per picked file, in order. Wait for the line you expect, not for a fixed count of cards.
- Image URLs are signed and expire after an hour. Read `src` from the card when you need it. Never store one for a later run.
- A card's `img` has no `src` for a moment after the card appears, until the page has fetched the signed URL.
- The file picker accepts `image/*`, so `setInputFiles` is the only way to offer a non-image file.
- Files are saved one after another. The picker is cleared after the last one.
