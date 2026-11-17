# Canvas

The canvas view of the library shows every saved image on a free canvas. The user pans with the wheel, with space-drag, or with middle-drag, and zooms toward the cursor with Ctrl+wheel or a pinch, from 1% to 6400%. A click selects the topmost image under the cursor, shift-click adds or removes one, and a click on empty canvas clears the selection. Dragging a selected image moves the whole selection, and the move is saved when the drag ends. Another open page of the same user shows the move without a reload. An image shows its 512 px thumbnail, and its 2048 px copy once it is large on screen.

## Sub-features

- `canvas-draw` draws each saved image at the position that `canvas.open` returns.
- `canvas-pan` moves the view by the scrolled amount, or with space-drag or middle-drag.
- `canvas-zoom` zooms toward the cursor with Ctrl+wheel or a pinch, from 1% to 6400%.
- `canvas-select` selects with click and shift-click, clears with a click on empty canvas, and outlines each selected image.
- `canvas-move` moves the selection with a drag and saves it as one `canvas.apply` call when the drag ends. A click saves nothing.
- `canvas-sync` shows a move made in another page of the same user, without a reload.
- `canvas-display` swaps an image's thumbnail for its 2048 px copy once its longer edge passes 512 device pixels on screen, at the same size.

## How to get to it (user POV)

- Choose `Canvas` above the gallery on `/library`.
- Open `/library?view=canvas` directly.
- Choose `Gallery` on the canvas to go back. `/library` with no `view` is the gallery.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`, who saved images through the Library recipe. Fill each image with one color, so its pixels on screen are known. Save one image over 2048 px to get a 2048 px copy.
- A known viewport, for example `await page.setViewportSize({ width: 1400, height: 900 })`.

- **Open.** Run `await page.goto("http://localhost:3000/library?view=canvas")`. Wait for `[data-testid="canvas"][data-shown-thumbnails="N"]`, where N is the number of saved images that fit in the view.
- **Readout.** `page.getByTestId("canvas-readout")` carries `data-items`, `data-zoom` in percent, `data-camera-x` and `data-camera-y`, and `data-selected`. The camera is the world point at the canvas's top-left corner. An item at world point `p` is at `(p - camera) * zoom / 100` from the top-left of `page.getByTestId("canvas")`.
- **Draw.** Take a screenshot and read it with `PNG.sync.read` from `pngjs`. The image's color fills the screen rectangle that follows from `canvas.open` through the API (`clientFor(page)`) and the readout.
- **Pan.** Run `await page.mouse.move(x, y)` and `await page.mouse.wheel(80, 150)`. The camera moves by `80 / zoom` and `150 / zoom` world units.
- **Zoom.** Hold `Control` with `page.keyboard.down("Control")` and run `page.mouse.wheel(0, -100)`. The world point under the cursor is the same before and after. Many large steps stop at `data-zoom="6400"` and `data-zoom="1"`.
- **Select.** Run `page.mouse.click(x, y)` on an image. `data-selected` becomes 1, and `[data-outline-key="<item key>"]` covers the image's screen rectangle. Hold `Shift` and click a second image for 2. Click empty canvas for 0.
- **Move.** Run `page.mouse.down()`, `page.mouse.move(x, y, { steps: 8 })`, and `page.mouse.up()` on a selected image. `canvas.changes` from the earlier `rev` returns only the moved items, at their old position plus the screen distance divided by the zoom, and `rev` rose by one.
- **Sync.** Open a second page in the same browser context with `page.context().newPage()`. It shares the session. A move in the first page shows in the second one's pixels without a reload.
- **Display copy.** Hold requests to paths ending in `/2048.webp` with `page.route`. Zoom in until an image's longer edge passes 512 px on screen. The page asks for its 2048 px copy. Release the requests, then wait for `[data-testid="canvas"][data-display-keys~="<item key>"]`. The image covers the same screen rectangle before and after.
- **Proof.** Screenshot the canvas after each step that changes it. Read the saved positions with `canvas.open` or `canvas.changes` through the API, or with `verify.sh rows canvasItems`, filtered to the canvas's ID.

`apps/web/checks/canvas-page.ts` runs this journey. `apps/web/checks/canvas.ts` covers the canvas functions and the rules between two users. `apps/web/checks/renderer.ts` draws a local bitmap with the renderer and needs neither sign-in nor R2.

## Gotchas

- Chromium sends mouse events at whole pixels. Round a computed point before you move the mouse to it, or the world point under the cursor drifts by a fraction of a pixel.
- The readout changes before the next frame draws. Wait two animation frames before a screenshot or an outline count.
- The panel with the view links and the readout sits over the canvas's top-left corner. A click there does not reach the canvas.
- `canvas.open` through the API is a mutation, and it places any saved image that has no item yet. Save every image before you open the canvas, or the page and the API see different items.
- An image that has no 2048 px copy, because it is 2048 px or smaller, loads its original for the display role. Only an image over 2048 px requests `2048.webp`.
- An item without a loaded texture is not drawn. With more images in view than the thumbnail budget of 200, the rest stay empty.
- The canvas fits the camera to every item once, when the page opens, at no more than 100%. Reload to reset the camera.
