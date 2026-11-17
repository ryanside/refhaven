# refhaven decisions

The rules for working in this repo. refhaven is a reference library for images. You save images into a library, group them into collections, and view any set as a gallery or as a canvas. Agents will read and save references through a CLI and an MCP server.

The [README](../README.md) covers how to run the project, the checks, and the layout.

## How to read a row

| State | Meaning |
|---|---|
| Built | The code does this today. |
| Planned | Decided, and not built yet. Build it this way. |
| Later | Not decided in detail. The row gives the starting point. Confirm it with the owner when you build that part. |
| Open | The owner has not decided. Ask before you build on it. |

"Lock" marks a rule that is painful to change once there is real data.

## Stack

TanStack Start with React, Tailwind 4, and shadcn on Base UI (preset `b1VlJAwK`). Convex with Confect, so backend code is written with Effect 4.1. Convex Auth 2.0. Cloudflare R2 through Convex's R2 component. PixiJS 8. Bun and Turborepo. TypeScript 7. Every version is an exact pin, and the shared ones live in the Bun catalog in the root `package.json`.

## Working rules

Each rule below comes from a bug or a wrong assumption already hit in this repo.

### Backend

- Write backend code in `packages/backend/confect`. `confect codegen` owns `convex/` and `confect/_generated/`, and it deletes any file in `convex/` that it did not write. The two exceptions are `convex/convex.config.ts` and `convex/tsconfig.json`.
- A table is one file in `confect/tables/`. A function group is a `*.spec.ts` and `*.impl.ts` pair. A spec is bundled into the browser, so it must not import server code.
- `confect/auth.ts` is the Convex auth config. The sign-in functions that Convex Auth returns are plain Convex functions, and they live in the `session` group.
- Every group that acts for a user attaches the `RequireWorkspace` middleware and reads the user and workspace from `CurrentWorkspace`. Never take a user ID or a workspace ID from a function's arguments.
- An action that calls a function gets that function's declared `error` as typed errors. Declare the error on the called function and pass it on, as `library.save` does with `record`. An undeclared error reaches the caller as a defect.
- Sign R2 URLs in a mutation or an action, never in a query. Convex caches query results, so a query returns the same signed URL after it has expired.
- Name unit tests `*.test.ts`. Confect's specs are named `*.spec.ts`, and Vitest must not run them.

### Web

- Signed-in routes live under `_app` and set `ssr: false`. The session tokens are in `localStorage`, because Convex Auth's cookie mode is for Next.js only.
- Load every image as a CORS request. An `<img>` sets `crossOrigin="anonymous"`. A response cached from a plain `<img>` has no CORS headers, and a later canvas load of the same URL fails on it.
- Do not subscribe to every item of a canvas with one live query. It resends every item on each change. See C19.
- Call Confect functions with the hooks from `@confect/react`. Use TanStack Query only for data that is not a live Convex subscription.
- The UI stays plain. Use the shadcn preset's defaults and no custom styling until the design pass.

### Git

- Open a pull request for anything beyond a simple, high-confidence change. Push a simple, high-confidence change straight to `main`.
- Whoever opens a pull request watches it and merges it once CI is green. Merge a stack bottom-up with merge commits, so the branches above need no rebase.
- CI runs the typecheck, lint, the format check, and the unit tests on `main` and on every pull request. The browser checks need the dev deployment and R2, so they run locally, through the `verify-refhaven` skill.

### R2

- The bucket is private. Its CORS policy lists the app's origin, the methods `GET` and `PUT`, and the headers `Content-Type` and `x-amz-checksum-sha256`.
- R2 checks an upload's SHA-256 only when the hash is a signed header, `x-amz-checksum-sha256`. As a URL parameter, the presigner's default, R2 ignores it.
- The Convex deployment needs `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. `R2_ENDPOINT` is the account URL, `https://<account-id>.r2.cloudflarestorage.com`, with no bucket name after it.

### Sign-in

- Passkeys are bound to their `rpId` for good. `AUTH_RP_ID` and `AUTH_ORIGIN` on the Convex deployment set it, and they default to `localhost` and `http://localhost:3000`. Set both before the first real user signs up.

## Scope

| ID | Rule | State |
|---|---|---|
| A2 | The first version is a library with a gallery view, collections, a canvas view, uploads, and text search. The CLI and MCP come after it. Each of the five exists. | Planned |
| A3 | Not in the first version: the browser extension, public sharing, co-op editing, AI tags, semantic search, video, offline editing, a desktop shell, mobile editing, and PureRef import. | Planned |
| A4 | Product first. A custom renderer and image tuning come after the product works. | Planned |
| A6 | On mobile the gallery is responsive and canvases are view-only. | Open |

## Product model

| ID | Rule | State |
|---|---|---|
| B1 | The library is everything you have saved. Each saved thing is a Ref. | Built, lock |
| B2 | A collection is a named set of Refs. A Ref can sit in many collections, and in each at most once. A name is trimmed and then 1 to 100 characters, and two collections may share one. Deleting a collection waits for C15. | Built, lock |
| B3 | Any set of Refs can be shown as a gallery or as a canvas. The set is the whole library, a filter, or one collection. The whole library and each collection exist in both views. A filter of the library or of a collection, by search text and tag, exists in the gallery view. `library.filter` returns it, and the page shows it with the same cards as the full gallery. The canvas view of a filter waits for B11. Both galleries use one component and one item shape, and both canvases use one canvas page. | Planned, lock |
| B4 | A canvas is the canvas view of a collection or of the whole library. There are no separate boards. A canvas row with a `collectionId` is that collection's, and one without is the whole library's. `/library?view=canvas` and `/c/{collectionId}?view=canvas` show them. | Built, lock |
| B5 | Each collection keeps one saved layout. The whole library keeps one too. A workspace has at most one canvas per set, found by the index `by_workspace_and_collection`. A move on one canvas does not change another. | Built, lock |
| B6 | An item dropped on the canvas lands where you dropped it. An item added anywhere else is placed beside the existing layout the next time the canvas opens. `canvas.open` places each Ref that has no item in rows to the right of the layout, 40 units away, with its longer edge at 400 units. Image files dropped on a canvas are saved, and each is placed with one `add` op of `canvas.apply`: the first centered on the drop point, and each next one of the same drop 440 units, the longer edge plus the gap, to the right, so they never overlap. A pasted image, or one picked with `Add images` in the canvas's panel, starts at the center of the view. The item shows when `canvas.changes` reports it. There is no placeholder while an image uploads. | Built |
| B7 | Removing an item from a canvas removes it from that collection. It stays in the library. On the whole library's canvas, `open` does not place a removed item's Ref again. On a collection's canvas, a removal and `collections.removeRefs` both go through `leaveCollection`, which deletes the membership and marks the item removed, so the canvas shows only members. When the Ref is added to the collection again, `open` revives its item under the same key, beside the layout. On the whole library's canvas, an `add` op brings a removed item back at the point it names. `canvas.open` returns `removed`, the number of live Refs whose item on the library's canvas is removed, and `open` with `placeRemoved` places them beside the layout again. `open` returns `placed`, the number of items it put on the canvas, which are the last items of its list. The canvas page removes the selected items with Delete, Backspace, or a button, as one `canvas.apply` call of `remove` ops. The button says `Remove from canvas` on the library's canvas and `Remove from collection` on a collection's. Removal is not optimistic: the items leave when `canvas.changes` reports it. The library's canvas shows how many of the library's images are not on it, as of its last snapshot, with a `Put them back` button. | Built |
| B8 | A canvas holds one item per Ref. | Built |
| B9 | Notes and groups live on the canvas and not in the library. | Planned |
| B10 | The whole library on one canvas works like any canvas. Loading thousands of items in pieces comes with the speed work. Until then `canvas.open` reads every live Ref and every item of the canvas in one transaction, plus one Blob for each image it places. For a collection it reads every membership, the Ref of each, and every item, plus one Blob for each image it places. A Convex transaction allows 4,096 reads, so the first open of a library is good to about 2,000 images, and of a collection to about 1,300. That size is worked out from the limit, not measured. | Later |
| B11 | In canvas view, a filter dims the items that do not match. | Later |

## Data

| ID | Rule | State |
|---|---|---|
| C4 | Every document carries `workspaceId`. Each user gets a personal workspace at sign-up. | Built, lock |
| C5 | The tables are Workspace, Blob, Ref, Collection, CollectionRef, Tag, Canvas, and CanvasItem. A CollectionRef row is one Ref's membership in one collection, and `by_ref` lists the collections of a Ref. A Tag row is one tag on one Ref: `workspaceId`, `refId`, and `name`. A Ref has a tag at most once. `by_ref` lists a Ref's tags in the order added, and `by_workspace_and_name` lists the Refs of one tag and the workspace's tag names. A tag's name is trimmed, inner runs of spaces become one space, and it is lowercased, so "Mood", " mood ", and "MOOD" are one tag. It is then 1 to 50 characters. `TagName` in `confect/refFields.ts` holds that rule for the page and the server. Lowercase tags are a default the coordinator chose, and the owner can still change it. `ref.tags` reads every tag row of the workspace in one range, the tags of images in the trash too. Convex scans at most 32,000 documents in a transaction and returns at most 8,192 elements in an array, so it is good to about 32,000 tag rows and 8,192 distinct names in a workspace. That size is worked out from the limits, not measured. A tag has no `source` yet. See T4. | Built, lock |
| C6 | A Blob is bytes keyed by SHA-256 inside a workspace. A Ref points at its original Blob, in `blobs.original`. The Blob records its variants, a thumbnail and a display copy, because they derive from its bytes. Every Ref that shares the Blob shares them. A page asks for a role, original, thumbnail, or display, and gets the variant when the Blob has it and the original otherwise. | Built, lock |
| C16 | A Ref records its file name, an optional note, and an optional source URL, and its creation time is the upload time. An absent note or source means none, and none is never stored as an empty string. A file name is trimmed and 1 to 255 characters. A note is trimmed and 1 to 10,000 characters. A source is trimmed, at most 2,048 characters, and parses as a URL with the protocol `http:` or `https:`, so a `javascript:` or `data:` link is never stored. The argument schemas of `ref.update` and `library.save` enforce these rules on the server, from `confect/refFields.ts`, and the page checks them first. The Blob records the hash, byte size, MIME type, pixel size, ThumbHash, and the byte size and pixel size of each variant, because they describe the bytes. A Ref also stores `searchText`, derived from its name, note, source, and tags for E6. | Built, lock |
| C8 | IDs are Convex document IDs. A canvas item also carries a `key`, unique inside its canvas. An image item's key is always its Ref's ID, whether `canvas.open` or an `add` op made it, so a canvas cannot hold two items for one Ref and `leaveCollection` finds an item by its Ref. A client-made key is for notes and groups, which have no Ref and do not exist yet. | Built, lock |
| C15 | A delete is a soft delete with a 30-day trash. A Ref with a `deletedAt` is in the trash. Every reader derives what it shows from that one field, through `isLive` and `liveRefs` in `confect/ref.ts`, and `canvas.changes` sends it as the item's `deletedAt`. `library.remove` and `library.restore` write only the Ref, plus a new `rev` on each of its shown canvas items, so `canvas.changes` reports the item removed and back. Memberships and items keep their rows, so a restore puts the image back in its collections and at its place on each canvas. `/trash` lists deleted images with a `Restore` button. The purge after 30 days does not exist, so nothing is deleted from the database or from R2 yet. | Built |
| C17 | The URLs are `/library`, `/c/{collectionId}`, and `/r/{refId}`. On `/library` and `/c/{collectionId}`, `view` is `gallery` or `canvas` and defaults to `gallery`, and two shared links switch between the views. `/r/{refId}` is one image's page. It shows the 2048 px copy, the pixel size and type, and a link to the original. It saves the name, the note, and the source each on its own submit, adds and removes tags, lists the image's collections, and deletes or restores the image. It reads `ref.get`, which answers for a Ref in the trash too. `ref.update`, `ref.addTags`, and `ref.removeTags` refuse a Ref in the trash with `RefNotFound`. A missing Ref and another user's show `Image not found.` The image on every gallery card, the trash's included, links to the page. The canvas does not link to it yet. | Built, lock |
| C18 | Export is a zip with `manifest.json` and the original files. | Later |
| I7 | One helper resolves the caller's workspace, and every function uses it. It is the `RequireWorkspace` middleware. Scopes join it with API keys. | Built, lock |
| I5 | The CLI and agents call a Confect HTTP API inside Convex, which runs the same functions as the browser. | Planned |
| I6 | Background jobs use Convex's scheduler and cron. | Planned |

## Storage and images

| ID | Rule | State |
|---|---|---|
| H3 | Originals are kept byte-exact. | Built, lock |
| H4 | Object keys are `w/{workspaceId}/o/{sha256}` for an original and `w/{workspaceId}/v/{sha256}/{file}` for a variant. A variant's `{sha256}` is the original's hash, and `{file}` is `512.webp` or `2048.webp`. | Built, lock |
| H5 | Bytes are de-duplicated per workspace, never across workspaces. | Built, lock |
| H6 | The browser uploads straight to R2 through a signed URL. The server makes the object key from the workspace and the hash. An original's URL is signed for its hash, so R2 stores no other bytes under that key. After the upload the server reads the object's size and first 12 bytes from R2 before it records anything. | Built |
| L1 | The server records the file type that the bytes show and ignores the client's claim. | Built |
| D18 | The formats are PNG, JPEG, WebP, GIF, and AVIF. SVG is rasterized at upload. The server refuses SVG until the rasterizing step exists. Variants are WebP, and the server refuses a variant whose bytes are not WebP. | Built |
| H7 | An image is at most 50 MB. The server checks the size when the image is saved, after the upload. | Built |
| E5 | Saving bytes the library already holds reuses the Blob, uploads the original no second time, and tells you. It adds a second Ref. It also adds any variant or ThumbHash the Blob still lacks. | Built |
| H10 | Images are served through signed R2 URLs. A mutation signs each URL for one hour, for the role the page asks for, and the page asks for a new one after 50 minutes. The gallery asks for the thumbnail. The canvas asks for the thumbnail or the display copy by each image's size on screen. | Built |
| L2 | The server checks the workspace before it signs a URL. | Built |
| H8 | An image gets a 512 px WebP thumbnail when its longer edge is over 512 px, and a 2048 px WebP display copy when it is over 2048 px. A variant keeps the aspect ratio, and its longer edge is the role's edge. Every image gets a ThumbHash, which the gallery shows until the thumbnail loads. An image saved before variants existed has none and is served from its original. | Built |
| H9 | The browser makes the variants and the ThumbHash at upload. A browser that cannot encode WebP, such as Safari, saves the original alone. For a CLI or agent save, the app makes them the first time it shows the image. There is no server image code. Only the browser part exists. | Built |
| L4 | A save from a URL fetches http and https only, with a cap on size and time. | Planned |

Known gaps in the upload path:

- A variant's upload URL is bound to no hash, because the browser makes the variant. The URL stays valid for 15 minutes, so a client can replace its own variant after the server read it.
- A retried save adds another Ref, because nothing identifies one save attempt. The web app never retries. Give each save a client-made ID before the CLI or an agent saves.
- An upload that is too large, refused, or abandoned stays in R2 with no Blob. The same holds for a variant.
- A new signed URL makes the browser download the image again, so an open page reloads its images about once an hour. Signing with a rounded date gives a URL the browser can cache.

## Canvas

| ID | Rule | State |
|---|---|---|
| C19 | Each canvas document carries a revision counter. A mutation raises the counter once and stamps the items it wrote. The client loads a snapshot with `canvas.open`, then subscribes to `canvas.changes` for the items written after the snapshot's revision. The client takes a new snapshot on every page load and when the change list passes a set size. A snapshot must not outlive the trash period of C15, or a purged item comes back. The canvas page takes a new snapshot when the change list passes 200 items. The lab that measured this design is in git history. | Built, lock |
| C7 | A canvas item is a tagged union of image, note, and group, with `kind` as the tag. An image item points at a Ref and copies the pixel size of its original, so a client can hit-test with no join. Only images exist. | Built, lock |
| C9 | A canvas stores one document per item. | Built, lock |
| C10 | An edit is saved as one mutation per gesture, carrying a list of item operations. `canvas.apply` takes up to 1,000 patch, remove, and add operations, in any mix. The page sends a larger edit as several calls, one after the other, so a move or a removal of more images than that is not one transaction. A patch or remove on a missing or removed key fails the whole call with `ItemNotFound`, and nothing is written. An add names a Ref and a point. It inserts the Ref's item with its longer edge at 400 units, brings a removed one back, or moves a live one. Each of the three takes a z above every item, unless the add names a `z`, which undo uses to restore a removed item's place in the stack. On a collection's canvas it also makes the Ref a member, through `addMember`. An add of another workspace's Ref, a missing Ref, or a Ref in the trash fails the whole call with `RefNotFound`. To find the top z, a call with an add that names no `z` reads every item of the canvas once. A call whose adds all name a `z` does not. | Built, lock |
| C11 | Each operation patches only the fields it changed, so the last write wins per field. | Built |
| C12 | An item has x, y, uniform scale, rotation, flip, crop rectangle, opacity, and grayscale. They are stored on the item and never baked into pixels. The server refuses a scale of 0 or less, an opacity outside 0 to 1, and a number that is not finite. Crop joins with the feature that sets it. The page sets x, y, scale, and rotation. A resize changes the scale only uniformly, so an image keeps its aspect ratio. Flip, opacity, and grayscale have no control yet. | Built, lock |
| C13 | Z-order is a fractional index string per item, from `fractional-indexing` 4.0.0. The server refuses a z that is not a valid key, because the next key above it could not be made. | Built, lock |
| C14 | A group is a parent reference on its items. The UI shows one level at first. | Planned |
| D1 | The canvas draws with PixiJS 8 on WebGL behind the `Renderer` interface in `packages/renderer`. The interface is set camera, upsert items, remove items, upload texture, evict texture, and draw. An item carries its size in world units, so a texture of any resolution covers the same area. | Built |
| D2 | Pixi types stay inside `packages/renderer`. The scene and the canvas model never import them. | Built, lock |
| D5 | World units are float64 with y down. An item's x and y are its center, and its rotation is in radians. The renderer turns positions into camera-relative values before the GPU sees them. | Built, lock |
| D3 | Scene state is a plain TypeScript store owned by the canvas, outside React state: `createSceneStore` in `packages/scene`. The pointer gesture is one state, idle, panning, dragging, resizing, or rotating. React reads the item count, the selection count, and the camera through `useSyncExternalStore`, so a drag renders nothing in React. There is no tool yet. | Built, lock |
| D4 | The scene applies changes from the server, except to items in a gesture. A drag, a resize, or a rotate stays local until release. After release, an edited item keeps its local x, y, scale, and rotation until the server state includes the save, so it never jumps back. A failed save puts it back at its server values. The store's `hold` does this for any ops that set those fields, and a gesture's release, an undo, and a redo all use it. | Built |
| D9 | Shortcuts come from one keymap table through TanStack Hotkeys. They do not fire while a text field has focus. `src/canvas/keymap.ts` holds the canvas's table: Delete and Backspace remove the selection, Mod+Z undoes, Mod+Shift+Z and Ctrl+Y redo, Mod+A selects every item, and Escape clears the selection. The canvas page registers it with `useHotkeys` and `ignoreInputs: true`. Space for panning is still read with a plain key listener. | Built |
| D11 | Handles and outlines are drawn in an overlay above the GPU layer. The renderer draws textured quads only. Each selected item has an outline, and the selection has one frame with nine handles, each a DOM element with a `data-handle` name, so a press on one needs no hit test in the scene. | Built |
| D10 | Selection is click, shift-add, and marquee, with eight handles plus rotate and a locked aspect ratio. One selected item's frame is its own turned rectangle, and several items' frame is the upright box around them. A resize handle scales the whole selection by one factor about the frame's opposite point, with a floor that keeps the frame's longer edge at 8 screen pixels. The rotate handle turns the selection about the frame's center, and Shift snaps the turn to 15 degrees. `resized` and `rotated` in `packages/scene` do the math. Each release is one `canvas.apply` call and one undo entry. Click, shift-click, dragging, resizing, and rotating exist. Marquee does not. | Built |
| D14 | Undo is a client-side stack of inverse operations per session. `createHistory` in `packages/scene` holds one stack per canvas page. An entry is two lists of `canvas.apply` ops, one that undoes the edit and one that redoes it, each sent as one call. A move patches the old and the new positions. A resize patches the old and the new x, y, and scale, and a rotate the old and the new x, y, and rotation. A removal is undone by one `add` per item, at its old place and its old `z`, and redone by `remove` ops, so a removal that one call could make can be undone by one call. An add by drop, paste, or picker is undone by a `remove`, so on a collection's canvas the image leaves the collection, and redone by the same `add`. Each image of a drop is its own entry. "Put them back" is one entry for the images it placed. A new edit empties the redo stack. An edit joins the stack when it is made, and an undo takes its entry when the key is pressed, so the two stay in the order they happened. Their saves then run one after the other, each after the one before it has reached the page through `canvas.changes`, so an undo pressed twice, or right after a drop, is judged against the canvas as it then stands. A failed save does not stop the ones after it. An edit of more than 1,000 ops is sent as several calls. Undo, redo, and remove do nothing when pressed during a gesture, and an undo whose turn comes during a gesture waits for it to end. An entry whose call fails, or whose items the page already knows are gone, is dropped, the rest of the stack stays, and the panel says "That change could not be undone." There is no undo across a reload, another page, or another tab. | Built |
| D16 | Files can be dragged in, and a Ref can be dragged from the gallery onto a canvas, with native drag and drop. Dragging files in is built. Dragging a Ref from the gallery is not. | Planned |
| D17 | A note is plain text with a size and a color. It is drawn to a texture with Canvas2D and edited in a DOM overlay. | Planned |
| D20 | The canvas shows an image's 512 px thumbnail until its longer edge passes 512 device pixels on screen, and then its 2048 px copy. It loads only images in or near the view, four at a time, and keeps at most 200 thumbnails and 12 display copies, evicting the least recently needed. Loading the original when zoomed past the 2048 px copy is not built. | Planned |
| D6 | Zoom runs from 1% to 6400%, toward the cursor. Applied by default while the owner was away. The owner can still change it. | Built, open |
| D8 | Touch and pen do pan and pinch only at first. | Later |
| D13 | Arrange offers grid, pack, align, and distribute. `placeBeside` in `packages/scene` places new items for B6 in rows, and arrange can build on it. | Later |
| D15 | Paste takes images, files, and image URLs. Copy puts the selection on the clipboard as PNG. | Later |
| D19 | An animated image shows its first frame at first. | Later |
| D22 | A cached snapshot is shown before the server answers. This is part of the speed work. | Later |
| D7 | The wheel pans. Pinch or Ctrl+wheel zooms. Space-drag and middle-drag pan. A mouse preset makes the wheel zoom. Applied by default while the owner was away, without the mouse preset. The owner can still change it. | Built, open |
| D12 | There is no snapping at first. | Open |
| D21 | A canvas has one background color. | Open |

## Gallery

| ID | Rule | State |
|---|---|---|
| E3 | Images are added by paste, drop, and the file picker, from the gallery or a canvas. A gallery and a canvas take all three, anywhere on their page, and a collection's gallery and canvas save into that collection. `SaveImages` in `src/library/save-images.tsx` holds the rules for both: a paste into a text field is left to the field, a drag that starts on the page itself is not a drop of files, and a drag or paste with no file is left alone. A signed-in page that does not save a dropped file refuses it, so the browser does not open it. An image dragged from another web page arrives as a link and is not saved. | Built |
| E4 | Uploading inside a collection adds the Ref to that collection. `library.save` takes an optional `collectionId`, and `library.record` writes the Ref and its membership in one mutation. A save into a missing or foreign collection fails with `CollectionNotFound` and saves nothing. | Built |
| E2 | Filters are tags, collection, and search text, and they are kept in the URL. `/library` and `/c/{collectionId}` show a `Search` field and a `Tag` select above the gallery and keep them in the URL as `q` and `tag`, next to `view`. An empty value is absent. `validateGallerySearch` in `src/view.tsx` reads both. It drops a value the server would refuse and puts a tag in its normal form through `TagName`, so `?tag=Mood` filters by `mood`. Typing waits 300 ms through TanStack Pacer before the URL changes. The first filter on a full gallery adds a history entry and later changes replace it, so the back button leaves the filtered view in one step. `Clear filters` brings the full gallery back. Each tag on an image's page links to `/library?tag={name}`. One tag at a time. The canvas view ignores the filters. | Built |
| E6 | Search is a Convex full-text search index over name, note, tags, and source. Each Ref stores `searchText`, the name, note, source, and tag names joined by spaces, built by `searchTextOf`. `writeSearchText` in `confect/ref.ts` writes it, and `ref.update`, `ref.addTags`, `ref.removeTags`, and `library.record` call it after each change. The index `search_text` filters on `workspaceId` and `deletedAt`. `library.filter` takes an optional search text of at most 200 characters, tag, and collection. With a search text it reads the index in Convex's order of relevance. With only a tag it reads the tag's Refs, newest tagged first. It keeps the live Refs that carry the tag and sit in the collection, and returns at most 200 of them, with `more` when there may be more. A missing or foreign collection fails with `CollectionNotFound`. Convex's index returns an image that matches any one word, best matches first. `library.filter` then keeps only the images whose text holds every word typed, each whole and the last by its beginning, as the index matches them (`holdsEveryWord`). So a longer search finds fewer images. Requiring every word is a default the coordinator chose. Observed on the dev deployment: The last word matches as a prefix and every other word whole, with no typo tolerance. Words after the 16th are dropped without an error. One call reads at most 1,024 candidate Refs, the most a search may read, plus every tag row of the tag, every membership of the collection, and one Blob for each image it shows. Convex allows 32,000 documents and 16 MiB read in a transaction. So a tag and a collection are good to about 30,000 rows together, and 1,024 candidates fit while they average under 16 KB. A Ref whose note nears 10,000 characters holds it twice, in `note` and `searchText`, so 1,024 such Refs would pass the limit. In a library past 1,024 matches, a tag or a collection added to a search checks only the 1,024 most relevant results, and the page says there are more. These sizes are worked out from the limits, not measured. Refs saved before the field existed lack it, so it is optional. The internal mutation `search.backfill` fills it, 100 Refs a page, each page scheduling the next. It skips a Ref that has it, so a second run writes nothing. On the dev deployment it filled 794 of 794 Refs, and a second run filled 0. | Built |
| E7 | Bulk actions are tag, add to collection, and delete. | Later |
| E1 | The gallery is a masonry grid with TanStack Virtual. Today it is a plain grid. | Open |

## Web app

| ID | Rule | State |
|---|---|---|
| G3 | App routes render in the browser, behind sign-in. | Built |
| F7 | The landing page is a route in the same app. | Built |
| F4 | Use TanStack Virtual, Form, Hotkeys, and Pacer for those jobs when they come up. Router and Query are set up. Pacer debounces the gallery's Search field. Hotkeys, `@tanstack/react-hotkeys` 0.27.0, runs the canvas's keymap. | Planned |
| F6 | Edits show at once through Convex optimistic updates. | Planned |
| F5 | Pages call Confect functions with the hooks from `@confect/react`, which decode results with the function's schema. TanStack Query is for data that is not a live Convex subscription. The canvas page calls `canvas.open`, `canvas.changes`, `canvas.apply`, and `library.urls` this way. | Built |

## Sign-in

| ID | Rule | State |
|---|---|---|
| G1 | Sign-in is Convex Auth 2.0. A passkey account is a username plus a passkey, with no email address. | Built |
| G2 | The methods are passkeys, GitHub, and Google. Only passkeys exist. | Open |
| G5 | The CLI and agents use a personal API key, stored hashed and revocable. | Planned |
| G6 | A key's scope is read, or read and write. No key can delete. | Planned, lock |

## CLI and agents

| ID | Rule | State |
|---|---|---|
| J1 | The agent interface is a local MCP server over stdio, started by the CLI. A remote endpoint comes later. | Planned |
| J2 | The tools are `search_refs`, `get_ref`, `view_refs`, `list_collections`, `get_collection`, `save_ref`, and `add_to_collection`. Each is also a CLI command. | Planned |
| J3 | Agents cannot delete. | Planned |
| J4 | A result carries text and metadata first. Pixels come on request, at most four images per call. | Planned |
| J5 | The CLI uses Effect's CLI module on Bun, lives in `apps/cli`, and is published to npm. | Planned |
| K4 | The CLI's license is MIT. | Open |

## Tooling and hosting

| ID | Rule | State |
|---|---|---|
| K3 | The license is AGPL-3.0. | Built |
| K6 | Lint with Oxlint and format with Oxfmt. A lefthook pre-commit runs both on staged files. | Built |
| K7 | Unit tests use Vitest and cover pure logic. The browser checks in `apps/web/checks` cover the function rules against the dev deployment. `convex-test` is not set up. | Built |
| K5 | The Effect language service for TypeScript 7 is the `@effect/tsgo` package. It is not set up. | Planned |
| I1 | The backend runs on Convex Cloud. Only a dev deployment exists. | Built |
| I2 | The web app is hosted on Vercel and deployed by its Git deploys. The backend is deployed with `convex deploy`. | Planned |

## Room kept for later

Keep these possible when you change the model.

| ID | Later feature | What the model keeps room for |
|---|---|---|
| T1 | Browser extension | It uses WXT and lives in `apps/extension`. A save calls the same `save_ref` function. |
| T2 | Public sharing | A `/s/{token}` route and a public R2 path. |
| T3 | Co-op | Live queries carry other people's edits. Add presence. C19's single revision counter needs another look first. |
| T4 | AI tags | A `source` on each tag with the values user, agent, and model. |
| T5 | Semantic search | Convex vector search, in its own table keyed by ref and model. |
| T6 | Video | A `kind` on Ref and a set of blobs per Ref. |
| T7 | A custom renderer | The `Renderer` interface and a `levels` field on blobs for more image sizes. |

## Open decisions

The owner decides these. Each row above shows the current default.

- **E5.** Choose whether saving a duplicate adds a second Ref or returns the existing one.
- **H7.** Confirm the 50 MB limit.
- **G2.** Choose which OAuth providers to add.
- **E1.** Choose the gallery layout.
- **D6, D7, D12, D21.** Canvas zoom range, input, snapping, and background. D6 and D7 run on their defaults until the owner decides.
- **A6.** Mobile behavior.
- **K4.** The CLI's license.
