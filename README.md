# refhaven

A reference library for images. You save images into a library, which you browse as a gallery, and gather them into collections. A collection opens as its canvas, a free arrangement, and has a gallery too. The rules for working in this repo are in [docs/decisions.md](docs/decisions.md).

This repository is early. You can sign in with a passkey, save images into your library by picking, pasting, or dropping them on a gallery, and gather them into collections. The library is a gallery. A collection opens as its canvas at `/c/{collectionId}`, and its gallery is at `?view=gallery`. On a collection's canvas you can pan, zoom, select images by click or with a marquee, move, resize, turn, and remove them, bring them to the front or send them to the back, write notes on it in one of six colors, group images and notes so they select together, undo and redo those edits, and drop, paste, or pick images onto it. A dropped image lands where you dropped it, and a pasted or picked one at the center of the view. A bar at the top of every page links the library, the trash, and each collection, through the Collections menu, and on a narrow window it folds them into a Menu sheet. The library shows the collections as a shelf above its images, where you make a new one. An image is in a collection exactly when it is on the collection's canvas, so removing it from the canvas or from the collection's gallery takes it out of the collection. You can rename a collection from its title at the top of its page. You can move an image to the trash from its card in the library's gallery. It goes to the trash at `/trash`, and a restore brings it back to its collections and to its place on each canvas. Each image has its own page at `/r/{refId}`, opened from its card, where you edit its name, a note, the link it came from, and its tags, and see the collections it is in. Each tag there links to the library filtered by it. The library's gallery and each collection's gallery have a search field and a tag filter, kept in the URL. Search reads an image's name, note, source link, and tags. The trash page shows how many days each image has left. A daily job deletes an image for good 30 days after it went to the trash, and its bytes in R2 a week after that. A collection cannot be deleted yet.

## Run it locally

You need [Bun](https://bun.sh) 1.4 and a [Convex](https://www.convex.dev) account.

1. Install the dependencies.

   ```sh
   bun install
   ```

2. If `packages/backend/.env.local` does not exist yet, create a Convex dev deployment. The command writes that file.

   ```sh
   cd packages/backend && bunx convex dev --once
   ```

3. Start everything from the repository root.

   ```sh
   bun dev
   ```

`bun dev` starts three processes: the web app on http://localhost:3000, `convex dev`, and `confect dev`. All three run under Bun, and a process list shows them as `node`. The web app reads the Convex URL from `packages/backend/.env.local`.

## Check your work

| Command | What it does |
|---|---|
| `bun run typecheck` | Type-checks every package. The backend and the web app use the Effect build of the compiler, which also fails on an Effect that was never run. |
| `bun run lint` | Runs Oxlint. |
| `bun run format` | Formats the code with Oxfmt. |
| `bun run test` | Runs the unit tests. |

The browser checks need `bun dev` running. Run them from `apps/web`. Most of them sign up a new test user in the dev deployment through a virtual passkey device in headless Chromium.

| Command | What it checks |
|---|---|
| `bun run check:auth` | Passkey sign-up, sign-out, and sign-in. |
| `bun run check:collection-canvas` | A collection's own canvas: only its members, a layout apart from another collection's, removals that take an image out of the collection, an image that comes back, two opens at once, an open with no collection refused, and the rules between two users. It needs R2. |
| `bun run check:collections` | Making, renaming, and filling collections on the page, a collection's link that opens its canvas and the `Gallery` link, saving into a collection, adding an image twice, refused names, the rules between two users, the Menu sheet on a narrow window, and the light, dark, and system themes. It needs R2. |
| `bun run check:confect` | A Confect function returns the signed-in user and refuses bad arguments. |
| `bun run check:library` | Saving images with their thumbnail and display copy, a duplicate, byte-exact serving, uploads held to their hash, the upload row that names an object's key, and the rules between two users. It needs R2. |
| `bun run check:canvas` | The canvas functions on a collection's canvas: placing its images, a patch, a removal, refused edits, a canvas row with no collection refused, and the rules between two users. It needs R2. |
| `bun run check:canvas-add` | The `add` op of `canvas.apply`: placing a Ref at a point, bringing back a removed item, moving a live one, making a Ref a collection's member, refused Refs that write nothing, and the rules between two users. It needs R2. |
| `bun run check:canvas-drop` | Dropping, pasting, and picking images on two collections' canvases, where each lands, a second page, and drags and pastes that are left alone. It needs R2. |
| `bun run check:canvas-undo` | Removing images on the canvas page, undo and redo of removals, moves, and adds, the shortcuts and a text field, an undo that can no longer apply, and a second collection's canvas. It needs R2. |
| `bun run check:canvas-groups` | The groups of `canvas.apply`: adding a group and filling it in one call, refused parents, refused shapes, removing a group or a member, the trash, a removed member added to the collection again, a key in use, placing images beside groups, and the rules between two users. It needs R2. |
| `bun run check:canvas-groups-page` | Groups on the canvas page with the real mouse and keyboard: `Group`, `Ungroup`, Mod+G, and Mod+Shift+G, a click, a shift-click, and a marquee on a member, a drag and a resize, an image and a note, a double click, undo and redo, Delete, a second page, and the selection tools' buttons. It needs R2. |
| `bun run check:canvas-notes` | The notes of `canvas.apply`: adding them, refused text, colors, boxes, and keys, a key in use, bringing a removed note back, patches by kind, a collection's canvas, the trash, placing images beside notes, and the rules between two users. It needs R2. |
| `bun run check:canvas-notes-page` | Notes on the canvas page with the real mouse and keyboard: `Add note`, typing and saving, a black note on the dark page, a double click, Escape, the shortcuts in the editor, the color, a drag, a resize, a turn, send to back, a marquee with an image, removing, undo, an empty note, a second page, and the galleries and search. It needs R2. |
| `bun run check:canvas-order` | The marquee and the order of images with the real mouse and keyboard: a marquee and one with Shift, a turned image, a press that does not move, bring to front and send to back, the pixels and the click where two images overlap, undo and redo, `]` and `[` and a text field, a second page, and nothing selected. It needs R2. |
| `bun run check:canvas-page` | The canvas page with the real mouse and wheel: drawing, pan, zoom, selection, saved moves, a second page, the 2048 px copy, and a second collection's canvas. It needs R2. |
| `bun run check:canvas-transform` | The selection's frame and handles with the real mouse: a corner and an edge resize about the fixed point, the floor, a quarter turn, the 15 degree snap with Shift, two images at once, clicks on the new footprint, undo and redo, a second page, and handles at every zoom. It needs R2. |
| `bun run check:paste-drop` | Dropping and pasting images on the library's and a collection's gallery, a file that is not an image refused with an outcome, text and a paste into a field left alone, a drag from the page itself ignored, and the trash page refusing a drop. It needs R2. |
| `bun run check:purge` | The 30-day purge and the sweep a week later, on a pretend clock that reaches only the check's own workspace: every row of a purged image, a Ref just under 30 days, a live Ref, Blobs that two Refs share, the objects in R2 before and after the sweep, the same bytes saved again before the sweep, under a new key that the sweep leaves, a save across the purge refused and done again, an image saved while a sweep runs, a sweep's last step run twice, the swept bytes saved again, 150 Refs on one Blob, a purge of more rows than one mutation deletes with each state between two mutations, a second run, the trash page, and a second user's image and orphan row left alone. It needs R2. |
| `bun run check:ref-page` | An image's page: opening it from a card, stepping to the previous and next image and Escape back to the list, the 2048 px copy, saving its name, note, source, and tags, refused values on the page and on the server, its collections, the trash, and the rules between two users. It needs R2. |
| `bun run check:renderer` | A local bitmap drawn as a WebGL texture by the PixiJS renderer. |
| `bun run check:search` | Search and the tag filter on the library's and a collection's gallery: a name, a note, a source, a tag, a prefix, a tag with a search, the URL, a reload, the back button, clearing, edits, the trash, a new save, 200 matches and more, a collection's canvas with no filters, `/library` with `view=canvas`, and the rules between two users. It needs R2. |
| `bun run check:trash` | Deleting an image on the page, the trash page, a second page's canvas, restoring to every gallery and canvas place, deleting and restoring twice, refused edits in the trash, and the rules between two users. It needs R2. |

Agents verify a change in the running app with the `verify-refhaven` skill in `.agents/skills/verify-refhaven`. Its helper script starts the app, checks it, runs a drive script, and keeps the evidence.

## Layout

| Path | Contents |
|---|---|
| `apps/web` | The TanStack Start app. |
| `packages/backend` | The Convex backend. You write code in `confect/`. `confect codegen` writes `convex/` and `confect/_generated/`. |
| `packages/scene` | The pure canvas model: the scene store, the undo stack, camera math, hit testing, and placement. |
| `packages/renderer` | The renderer interface and its PixiJS backend. |
| `packages/ui` | The shadcn components. |

## License

AGPL-3.0. See [LICENSE](LICENSE).
