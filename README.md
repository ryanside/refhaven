# refhaven

A reference library for images. You save images into a library, group them into collections, and view any set as a gallery or as a canvas. The rules for working in this repo are in [docs/decisions.md](docs/decisions.md).

This repository is early. You can sign in with a passkey, save images into your library by picking, pasting, or dropping them on a gallery, and view the library as a gallery or as a canvas. On the canvas you can pan, zoom, select images by click or with a marquee, move, resize, turn, and remove them, bring them to the front or send them to the back, write notes on it in one of six colors, group images and notes so they select together, undo and redo those edits, and drop, paste, or pick images onto it. The library's canvas says how many images are not on it and puts them back. A dropped image lands where you dropped it, and a pasted or picked one at the center of the view. You can group images into collections, rename a collection, and view it as a gallery or as its own canvas at `/c/{collectionId}`. You can delete an image from the library's gallery. It goes to the trash at `/trash`, and a restore brings it back to its collections and to its place on each canvas. Each image has its own page at `/r/{refId}`, opened from its card, where you edit its name, a note, the link it came from, and its tags, and see the collections it is in. Each tag there links to the library filtered by it. The library's gallery and each collection's gallery have a search field and a tag filter, kept in the URL. Search reads an image's name, note, source link, and tags. The trash page shows how many days each image has left. Internal functions delete an image for good 30 days after it went to the trash, and its bytes in R2 a week after that, but no daily job runs them yet. A collection cannot be deleted yet.

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

`bun dev` starts three processes: the web app on http://localhost:3000, `convex dev`, and `confect dev`. The web app reads the Convex URL from `packages/backend/.env.local`.

## Check your work

| Command | What it does |
|---|---|
| `bun run typecheck` | Type-checks every package. |
| `bun run lint` | Runs Oxlint. |
| `bun run format` | Formats the code with Oxfmt. |
| `bun run test` | Runs the unit tests. |

The browser checks need `bun dev` running. Run them from `apps/web`. Most of them sign up a new test user in the dev deployment through a virtual passkey device in headless Chromium.

| Command | What it checks |
|---|---|
| `bun run check:auth` | Passkey sign-up, sign-out, and sign-in. |
| `bun run check:collection-canvas` | A collection's own canvas: only its members, a layout apart from the library's, removals that take an image out of the collection, an image that comes back, two opens at once, and the rules between two users. It needs R2. |
| `bun run check:collections` | Making, renaming, and filling collections on the page, saving into a collection, adding an image twice, refused names, and the rules between two users. It needs R2. |
| `bun run check:confect` | A Confect function returns the signed-in user and refuses bad arguments. |
| `bun run check:library` | Saving images with their thumbnail and display copy, a duplicate, byte-exact serving, uploads held to their hash, and the rules between two users. It needs R2. |
| `bun run check:canvas` | The canvas functions: placing saved images, a patch, a removal, counting and placing removed images again, refused edits, and the rules between two users. It needs R2. |
| `bun run check:canvas-add` | The `add` op of `canvas.apply`: placing a Ref at a point, bringing back a removed item, moving a live one, making a Ref a collection's member, refused Refs that write nothing, and the rules between two users. It needs R2. |
| `bun run check:canvas-drop` | Dropping, pasting, and picking images on the library's and a collection's canvas, where each lands, a second page, and drags and pastes that are left alone. It needs R2. |
| `bun run check:canvas-undo` | Removing images on the canvas page, undo and redo of removals, moves, and adds, the shortcuts and a text field, an undo that can no longer apply, putting removed images back, and a collection's canvas. It needs R2. |
| `bun run check:canvas-groups` | The groups of `canvas.apply`: adding a group and filling it in one call, refused parents, refused shapes, removing a group or a member, the trash, bringing a removed group back, a key in use, placing images beside groups, and the rules between two users. It needs R2. |
| `bun run check:canvas-groups-page` | Groups on the canvas page with the real mouse and keyboard: `Group`, `Ungroup`, Mod+G, and Mod+Shift+G, a click, a shift-click, and a marquee on a member, a drag and a resize, an image and a note, a double click, undo and redo, Delete, a second page, and the panel's buttons. It needs R2. |
| `bun run check:canvas-notes` | The notes of `canvas.apply`: adding them, refused text, colors, boxes, and keys, a key in use, bringing a removed note back, patches by kind, a collection's canvas, the trash, placing images beside notes, and the rules between two users. It needs R2. |
| `bun run check:canvas-notes-page` | Notes on the canvas page with the real mouse and keyboard: `Add note`, typing and saving, a double click, Escape, the shortcuts in the editor, the color, a drag, a resize, a turn, send to back, a marquee with an image, removing, undo, an empty note, a second page, and the gallery and search. It needs R2. |
| `bun run check:canvas-order` | The marquee and the order of images with the real mouse and keyboard: a marquee and one with Shift, a turned image, a press that does not move, bring to front and send to back, the pixels and the click where two images overlap, undo and redo, `]` and `[` and a text field, a second page, and nothing selected. It needs R2. |
| `bun run check:canvas-page` | The canvas page with the real mouse and wheel: drawing, pan, zoom, selection, saved moves, a second page, the 2048 px copy, and a collection's canvas. It needs R2. |
| `bun run check:canvas-transform` | The selection's frame and handles with the real mouse: a corner and an edge resize about the fixed point, the floor, a quarter turn, the 15 degree snap with Shift, two images at once, clicks on the new footprint, undo and redo, a second page, and handles at every zoom. It needs R2. |
| `bun run check:paste-drop` | Dropping and pasting images on the library's and a collection's gallery, a file that is not an image refused with an outcome, text and a paste into a field left alone, a drag from the page itself ignored, and the trash page refusing a drop. It needs R2. |
| `bun run check:purge` | The 30-day purge and the sweep a week later, on a pretend clock that reaches only the check's own workspace: every row of a purged image, a Ref just under 30 days, a live Ref, Blobs that two Refs share, the objects in R2 before and after the sweep, the same bytes saved again before the sweep and across the purge, 150 Refs on one Blob, a second run, the trash page, and a second user's image left alone. It needs R2. |
| `bun run check:ref-page` | An image's page: opening it from a card, the 2048 px copy, saving its name, note, source, and tags, refused values on the page and on the server, its collections, the trash, and the rules between two users. It needs R2. |
| `bun run check:renderer` | A local bitmap drawn as a WebGL texture by the PixiJS renderer. |
| `bun run check:search` | Search and the tag filter on the library's and a collection's gallery: a name, a note, a source, a tag, a prefix, a tag with a search, the URL, a reload, the back button, clearing, edits, the trash, a new save, 200 matches and more, and the rules between two users. It needs R2. |
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
