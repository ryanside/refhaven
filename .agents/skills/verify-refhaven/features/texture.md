# Texture lab

The texture lab is a throwaway page. It draws the four newest images of the signed-in user's library on a WebGL canvas with the PixiJS renderer, and reports the color of the pixel at the first item's center. It proves that an R2 image reaches a WebGL texture without a cross-origin error.

## Sub-features

- `texture-draw` draws the newest library images on the canvas.
- `texture-pixel` reports the first item's center pixel, so a script can compare it with the image.
- `texture-error` shows the error text when an image cannot be fetched or decoded.

## How to get to it (user POV)

- Choose `R2 image as a WebGL texture` under `Lab` on `/library`.
- Open `/lab/texture` directly.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A signed-in user whose library holds at least one image. Save a single-color image first, by the Library recipe, so the expected pixel is known.

- **Open.** Run `await page.goto("http://localhost:3000/lab/texture")`. A `canvas` element appears inside the bordered box.
- **Draw.** Wait for `[data-testid="drawn"]` to have `data-status="drawn"`. Its `data-textures` equals the number of images drawn, at most 4.
- **Pixel.** Read `data-first-item-pixel` from the same element. For a library whose newest image is filled with `rgb(220, 40, 120)`, it reads `rgb(220, 40, 120)`.
- **Proof.** Screenshot the page. Record the R2 responses the page received with `page.on("response", ...)`: each has status 200 and the header `access-control-allow-origin: http://localhost:3000`.

`apps/web/checks/texture.ts` runs this journey and also shows that the same signed URL is refused from another origin. `apps/web/checks/renderer.ts` draws a local bitmap with the renderer and needs neither sign-in nor R2.

## Gotchas

- With an empty library the status stays `Nothing drawn yet.` and never becomes `drawn`.
- `data-status="failed"` carries the error text in the element. A cross-origin failure reads `TypeError: Failed to fetch`.
- The first item is the newest image. Save the image with the known color last.
- The page scales each image so its longer side is 256 px. Read the center pixel, since an edge pixel may be blended.
