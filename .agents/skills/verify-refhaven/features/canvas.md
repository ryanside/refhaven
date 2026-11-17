# Canvas

The canvas view of the library shows every saved image on a free canvas. Each collection has its own canvas with only its images and a layout of its own. The user pans with the wheel, with space-drag, or with middle-drag, and zooms toward the cursor with Ctrl+wheel or a pinch, from 1% to 6400%. A click selects the topmost image under the cursor, shift-click adds or removes one, and a click on empty canvas clears the selection. A drag on empty canvas draws a marquee and selects every image it touches, and with Shift adds them. `Bring to front` and `Send to back`, or `]` and `[`, move the selection above or below every other image. Dragging a selected image moves the whole selection, and the move is saved when the drag ends. The selection has a frame with eight handles that resize it with a locked aspect ratio about the opposite point, and one above it that turns it about the frame's center, in steps of 15 degrees with Shift held. Another open page of the same user shows the move without a reload. Image files dropped on the canvas are saved and land where they were dropped, and a pasted or picked image lands at the center of the view. An image shows its 512 px thumbnail, and its 2048 px copy once it is large on screen. Delete, Backspace, or the panel's remove button takes the selected images off the canvas, and on a collection's canvas out of the collection. Undo and redo take back a move, a resize, a turn, a change of order, a removal, or an add for as long as the page is open. The library's canvas says how many of the library's images are not on it, and `Put them back` places them beside the layout.

## Sub-features

- `canvas-draw` draws each saved image at the position that `canvas.open` returns.
- `canvas-pan` moves the view by the scrolled amount, or with space-drag or middle-drag.
- `canvas-zoom` zooms toward the cursor with Ctrl+wheel or a pinch, from 1% to 6400%.
- `canvas-select` selects with click and shift-click, clears with a click on empty canvas, and outlines each selected image.
- `canvas-marquee` draws a rectangle from a press on empty canvas to the pointer, and on release selects every image whose own turned rectangle it touches. With Shift held it adds them to the selection. It saves nothing.
- `canvas-order` brings the selection to the front or sends it to the back, in its own order, with one `canvas.apply` call that patches only `z`, by `Bring to front`, `Send to back`, `]`, or `[`. The drawn order, the click order, and `canvas.open` agree.
- `canvas-move` moves the selection with a drag and saves it as one `canvas.apply` call when the drag ends. A click saves nothing.
- `canvas-frame` draws the selection's frame: one image's own turned rectangle, or the upright box around several, with eight resize handles and one rotate handle that keep their size at every zoom.
- `canvas-resize` scales the selection by one factor about the frame's point opposite the dragged handle, for a corner and an edge alike, and stops when the frame's longer edge is 8 px on screen. The release saves one `canvas.apply` call that patches only `x`, `y`, and `scale`.
- `canvas-rotate` turns the selection about the frame's center by the angle the pointer swept. With Shift held, one image ends at a multiple of 15 degrees and several images turn by a multiple of 15 degrees. The release saves one `canvas.apply` call. One image turned about its own center is patched with `rotation` alone, and images that also moved with `rotation`, `x`, and `y`.
- `canvas-sync` shows a move made in another page of the same user, without a reload.
- `canvas-collection` shows a collection's images on its own canvas. A move there does not move the image on the library's canvas.
- `canvas-drop` saves image files dropped on the canvas and places them with one `canvas.apply` add each: the first centered on the drop point, each next one 440 units to the right. On a collection's canvas the image joins the collection.
- `canvas-paste` places a pasted image, or one picked with `Add images` in the panel, at the center of the view, in a row the same way.
- `canvas-remove` removes the selected images with one `canvas.apply` call of `remove` ops, by Delete, Backspace, or `Remove from canvas`. On a collection's canvas the button is `Remove from collection`, and the image leaves the collection.
- `canvas-undo` undoes and redoes the page's moves, resizes, turns, changes of order, removals, and adds with one `canvas.apply` call each, by Mod+Z, Mod+Shift+Z, Ctrl+Y, or the `Undo` and `Redo` buttons. An undo that the server state no longer allows shows "That change could not be undone." and changes nothing.
- `canvas-keys` maps Delete and Backspace, Mod+Z, Mod+Shift+Z, Ctrl+Y, Mod+A to select every image, Escape to clear the selection, `]` to bring the selection to the front, and `[` to send it to the back. No shortcut fires while a text field has focus.
- `canvas-put-back` shows on the library's canvas how many of its images are not on it, and `Put them back` places them to the right of the layout. It is one edit, so undo takes them off again.
- `canvas-display` swaps an image's thumbnail for its 2048 px copy once its longer edge passes 512 device pixels on screen, at the same size.

## How to get to it (user POV)

- Choose `Canvas` above the gallery on `/library`.
- Open `/library?view=canvas` directly.
- Choose `Gallery` on the canvas to go back. `/library` with no `view` is the gallery.
- Choose `Canvas` on a collection's page, or open `/c/{collectionId}?view=canvas` directly.

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
- **Marquee.** Run `page.mouse.move` to empty canvas, `page.mouse.down()`, `page.mouse.move(x, y, { steps: 10 })`, and `page.mouse.up()`. During the drag `[data-marquee]` covers the rectangle from the press to the pointer, and after the release it is gone. `data-selected` counts the images the rectangle touched, and `[data-outline-key]` names them. Hold `Shift` before the press to add to the selection. No `canvas:apply` frame is sent.
- **Order.** Select images and click `page.getByRole("button", { name: "Bring to front" })` or `"Send to back"`, or press `]` or `[`. One `canvas:apply` frame patches only `z` of each selected image. `canvas.open` returns the new z values, and the pixels where two images overlap show the one on top. Both buttons are disabled with nothing selected.
- **Frame.** With one image selected, `[data-frame] [data-handle]` counts 9. The handles are named `nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, and `rotate`. Read a handle's center from its `boundingBox()`. The rotate handle is 24 px above the middle of the frame's top edge, turned with the frame. With nothing selected there is no `[data-frame]`.
- **Resize.** Round a handle's center, then `page.mouse.move` there, `page.mouse.down()`, `page.mouse.move(x, y, { steps: 10 })`, and `page.mouse.up()`. `canvas.open` returns the new `scale`, `x`, and `y`, and the point of the frame opposite the handle is where it was. The factor is 1 plus the pointer's travel along the line from that point to the handle, over that line's length squared.
- **Rotate.** Drag the `rotate` handle around the frame's center. `rotation` grows by the swept angle. Hold `Shift` with `page.keyboard.down("Shift")` before the drag to snap. A press on any handle changes nothing until the pointer has moved 3 pixels.
- **Apply calls.** Listen with `page.on("websocket")` and `framesent` before the page loads. Each save is one frame with `type` `Mutation` and `udfPath` `canvas:apply`, and its `args[0].ops` show the fields each patch sets.
- **Move.** Run `page.mouse.down()`, `page.mouse.move(x, y, { steps: 8 })`, and `page.mouse.up()` on a selected image. `canvas.changes` from the earlier `rev` returns only the moved items, at their old position plus the screen distance divided by the zoom, and `rev` rose by one.
- **Sync.** Open a second page in the same browser context with `page.context().newPage()`. It shares the session. A move in the first page shows in the second one's pixels without a reload.
- **Display copy.** Hold requests to paths ending in `/2048.webp` with `page.route`. Zoom in until an image's longer edge passes 512 px on screen. The page asks for its 2048 px copy. Release the requests, then wait for `[data-testid="canvas"][data-display-keys~="<item key>"]`. The image covers the same screen rectangle before and after.
- **Collection.** Open `/c/{collectionId}?view=canvas`. The readout's `data-items` is the number of the collection's images, and only their colors are drawn. Read its layout with `canvas.open` and `{ collectionId }` through the API. A drag there changes that canvas's `rev` and not the library's.
- **Drop.** Send a `drop` that carries files to `[data-testid="canvas"]` with `send` from `apps/web/checks/browser.ts`, with the drop point as its last argument. One `[role="status"] li` per file appears in the panel. Wait for `data-shown-thumbnails` to count the new images. `canvas.open` returns the first centered on `toWorld` of the drop point and each next one `placedEdge + placementGap` to the right.
- **Paste or pick.** Send a `paste` that carries a file, or run `page.getByLabel("Add images").setInputFiles(...)` on the canvas page. The image lands centered on the world point at the center of `[data-testid="canvas"]`.
- **Add through the API.** `canvas.apply` with `{ op: "add", refId, x, y }` places a Ref at a point, brings back a removed item, or moves a live one. On a collection's canvas it makes the Ref a member.
- **Remove.** Select an image and run `page.keyboard.press("Delete")`. `data-items` drops by one, `canvas.open` no longer returns the image, and the canvas's `rev` rose by one. `page.getByRole("button", { name: "Remove from canvas" })` does the same, and is disabled with nothing selected.
- **Undo and redo.** Run `page.keyboard.press("ControlOrMeta+z")`, `"ControlOrMeta+Shift+z"`, or `"Control+y"`, or click `Undo` or `Redo`. Each is one `canvas.apply` call. A removal comes back with the same `x`, `y`, `scale`, and `z`. `Redo` is disabled after a new edit.
- **Select all.** Run `page.keyboard.press("ControlOrMeta+a")`. `data-selected` equals `data-items`. `Escape` sets it to 0.
- **Put back.** Remove an image from the library's canvas, by another call or on the page, and reload. `page.getByTestId("off-canvas")` carries `data-count`. Click `Put them back`. The image is placed to the right of the layout and the line goes away.
- **Proof.** Screenshot the canvas after each step that changes it. Read the saved positions with `canvas.open` or `canvas.changes` through the API, or with `verify.sh rows canvasItems`, filtered to the canvas's ID.

`apps/web/checks/canvas-page.ts` runs this journey. `apps/web/checks/canvas-order.ts` covers the marquee, a turned image, bring to front and send to back, their undo, the keys, and a second page. `apps/web/checks/canvas-transform.ts` covers the frame, resizing, rotating, and their undo. `apps/web/checks/canvas-undo.ts` covers removing, undo and redo, the keymap, and putting images back. `apps/web/checks/canvas-drop.ts` covers dropping, pasting, and picking images on the canvas. `apps/web/checks/canvas.ts` covers the canvas functions and the rules between two users, and `apps/web/checks/canvas-add.ts` covers the `add` op. `apps/web/checks/collection-canvas.ts` covers a collection's canvas through the API. `apps/web/checks/renderer.ts` draws a local bitmap with the renderer and needs neither sign-in nor R2.

## Gotchas

- Chromium sends mouse events at whole pixels. Round a computed point before you move the mouse to it, or the world point under the cursor drifts by a fraction of a pixel.
- The readout changes before the next frame draws. Wait two animation frames before a screenshot or an outline count.
- The panel with the view links and the readout sits over the canvas's top-left corner. A click there does not reach the canvas.
- `canvas.open` through the API is a mutation, and it places any saved image that has no item yet. Save every image before you open the canvas, or the page and the API see different items.
- An image that has no 2048 px copy, because it is 2048 px or smaller, loads its original for the display role. Only an image over 2048 px requests `2048.webp`.
- An item without a loaded texture is not drawn. With more images in view than the thumbnail budget of 200, the rest stay empty.
- `page.waitForURL` resolves before the new page renders. Wait for something on the new page, such as the collection's heading, before you use a control that both pages have, like `Add images`.
- The canvas fits the camera to every item once, when the page opens, at no more than 100%. Reload to reset the camera.
- The panel now holds `Add images`, the outcome list, and two rows of buttons, so it covers more of the top-left corner. Drop and click away from it.
- `data-shown-thumbnails="0"` shows before the first snapshot loads. An image is placed when its save ends, so a drop that early is still placed once the snapshot has loaded by then.
- A selected image's outline is 2 px wide and covers its edges. Allow 3 px when you compare its drawn rectangle.
- The count of images off the library's canvas comes from the snapshot. A removal on the page shows in it after a reload.
- The canvas page has no text field of its own. To prove that shortcuts leave a text field alone, add one with `page.evaluate` and focus it.
- Give a second page the same viewport as the first, or its view is fitted differently and the panel can cover the point you read.
- A press near a selected image's corner, edge middle, or above its top edge lands on a handle and resizes or turns instead of selecting. Click other images away from those points.
- A handle of a turned frame is a turned square, so its bounding box is larger than 10 px. Compare sizes between zooms at one rotation.
- A drag that ends where it began saves nothing, and so does a press on a handle that does not move.
- A marquee must start on empty canvas. A press on an image starts a drag, and a press on a handle a resize or a turn.
- An image lies on top of another by its `z`, not by the order it was saved in. Set `z` through the API with a patch to know which image is on top.
