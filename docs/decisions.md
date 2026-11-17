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
- CI runs the typecheck, lint, the format check, and the unit tests on `main` and on every pull request. The browser checks need the dev deployment and R2, so they run locally, through the `verify-refhaven` skill.

### R2

- The bucket is private. Its CORS policy lists the app's origin, the methods `GET` and `PUT`, and the header `Content-Type`.
- The Convex deployment needs `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. `R2_ENDPOINT` is the account URL, `https://<account-id>.r2.cloudflarestorage.com`, with no bucket name after it.

### Sign-in

- Passkeys are bound to their `rpId` for good. `AUTH_RP_ID` and `AUTH_ORIGIN` on the Convex deployment set it, and they default to `localhost` and `http://localhost:3000`. Set both before the first real user signs up.

## Scope

| ID | Rule | State |
|---|---|---|
| A2 | The first version is a library with a gallery view, collections, a canvas view, uploads, and text search. The CLI and MCP come after it. | Planned |
| A3 | Not in the first version: the browser extension, public sharing, co-op editing, AI tags, semantic search, video, offline editing, a desktop shell, mobile editing, and PureRef import. | Planned |
| A4 | Product first. A custom renderer and image tuning come after the product works. | Planned |
| A6 | On mobile the gallery is responsive and canvases are view-only. | Open |

## Product model

| ID | Rule | State |
|---|---|---|
| B1 | The library is everything you have saved. Each saved thing is a Ref. | Built, lock |
| B2 | A collection is a named set of Refs. A Ref can sit in many collections. | Planned, lock |
| B3 | Any set of Refs can be shown as a gallery or as a canvas. The set is the whole library, a filter, or one collection. | Planned, lock |
| B4 | A canvas is the canvas view of a collection or of the whole library. There are no separate boards. | Planned, lock |
| B5 | Each collection keeps one saved layout. The whole library keeps one too. | Planned, lock |
| B6 | An item dropped on the canvas lands where you dropped it. An item added anywhere else is placed beside the existing layout the next time the canvas opens. | Planned |
| B7 | Removing an item from a canvas removes it from that collection. It stays in the library. | Planned |
| B8 | A canvas holds one item per Ref. | Planned |
| B9 | Notes and groups live on the canvas and not in the library. | Planned |
| B10 | The whole library on one canvas works like any canvas. Loading thousands of items in pieces comes with the speed work. | Later |
| B11 | In canvas view, a filter dims the items that do not match. | Later |

## Data

| ID | Rule | State |
|---|---|---|
| C4 | Every document carries `workspaceId`. Each user gets a personal workspace at sign-up. The lab tables `canvases` and `canvasItems` still use the user and move over in the canvas step. | Built, lock |
| C5 | The tables are Workspace, Blob, Ref, Collection, CollectionRef, Tag, Canvas, and CanvasItem. Workspace, Blob, and Ref exist. | Planned, lock |
| C6 | A Blob is bytes keyed by SHA-256 inside a workspace. A Ref points at its original Blob, in `blobs.original`. The Blob records its variants, a thumbnail and a display copy, because they derive from its bytes. Every Ref that shares the Blob shares them. A page asks for a role, original, thumbnail, or display, and gets the variant when the Blob has it and the original otherwise. | Built, lock |
| C16 | A Ref records its file name, and its creation time is the upload time. The Blob records the hash, byte size, MIME type, pixel size, ThumbHash, and the byte size and pixel size of each variant, because they describe the bytes. Source URL and note join the Ref with the first feature that sets them. | Built, lock |
| C8 | IDs are Convex document IDs. A canvas item also carries a client-made `key`, so the canvas can create it at once. | Planned, lock |
| C15 | A delete is a soft delete with a 30-day trash. | Planned |
| C17 | The URLs are `/library`, `/c/{collectionId}`, and `/r/{refId}`, with `view=gallery` or `view=canvas`. Only `/library` exists. | Planned, lock |
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
| H6 | The browser uploads straight to R2 through a signed URL. The server makes the object key from the workspace and the hash. After the upload the server reads the object's size and first 12 bytes from R2 before it records anything. | Built |
| L1 | The server records the file type that the bytes show and ignores the client's claim. | Built |
| D18 | The formats are PNG, JPEG, WebP, GIF, and AVIF. SVG is rasterized at upload. The server refuses SVG until the rasterizing step exists. Variants are WebP, and the server refuses a variant whose bytes are not WebP. | Built |
| H7 | An image is at most 50 MB. The server checks the size when the image is saved, after the upload. | Built |
| E5 | Saving bytes the library already holds reuses the Blob, uploads the original no second time, and tells you. It adds a second Ref. It also adds any variant or ThumbHash the Blob still lacks. | Built |
| H10 | Images are served through signed R2 URLs. A mutation signs each URL for one hour, for the role the page asks for, and the page asks for a new one after 50 minutes. The gallery asks for the thumbnail. | Built |
| L2 | The server checks the workspace before it signs a URL. | Built |
| H8 | An image gets a 512 px WebP thumbnail when its longer edge is over 512 px, and a 2048 px WebP display copy when it is over 2048 px. A variant keeps the aspect ratio, and its longer edge is the role's edge. Every image gets a ThumbHash, which the gallery shows until the thumbnail loads. An image saved before variants existed has none and is served from its original. | Built |
| H9 | The browser makes the variants and the ThumbHash at upload. A browser that cannot encode WebP, such as Safari, saves the original alone. For a CLI or agent save, the app makes them the first time it shows the image. There is no server image code. Only the browser part exists. | Built |
| L4 | A save from a URL fetches http and https only, with a cap on size and time. | Planned |

Known gaps in the upload path:

- Nothing checks that the uploaded bytes match the hash in the key. The upload URL also stays valid for 15 minutes, so a client can replace the bytes after the server read them. Signing the hash into the upload URL closes both. R2 enforces a signed SHA-256 only when the browser sends it as the `x-amz-checksum-sha256` header, so the bucket's CORS policy must list that header first. As a URL parameter R2 ignores it.
- A retried save adds another Ref, because nothing identifies one save attempt. The web app never retries. Give each save a client-made ID before the CLI or an agent saves.
- An upload that is too large, refused, or abandoned stays in R2 with no Blob. The same holds for a variant.
- A new signed URL makes the browser download the image again, so an open page reloads its images about once an hour. Signing with a rounded date gives a URL the browser can cache.

## Canvas

| ID | Rule | State |
|---|---|---|
| C19 | Each canvas document carries a revision counter. A mutation raises the counter and stamps the items it wrote. The client loads a snapshot, then subscribes to the items written after the snapshot's revision. The client takes a new snapshot on every page load and when the change list passes a set size. A snapshot must not outlive the trash period of C15, or a purged item comes back. The page `/lab/canvas-sync` is a prototype of this. | Planned, lock |
| C7 | A canvas item is a tagged union of image, note, and group. An image item points at a Ref. | Planned, lock |
| C9 | A canvas stores one document per item. | Planned, lock |
| C10 | An edit is saved as one mutation per gesture, carrying a list of item operations. | Planned, lock |
| C11 | Each operation patches only the fields it changed, so the last write wins per field. | Planned |
| C12 | An item has x, y, uniform scale, rotation, flip, crop rectangle, opacity, and grayscale. They are stored on the item and never baked into pixels. | Planned, lock |
| C13 | Z-order is a fractional index string per item. | Planned, lock |
| C14 | A group is a parent reference on its items. The UI shows one level at first. | Planned |
| D1 | The canvas draws with PixiJS 8 on WebGL behind the `Renderer` interface in `packages/renderer`. The interface is set camera, upsert items, remove items, upload texture, evict texture, and draw. | Built |
| D2 | Pixi types stay inside `packages/renderer`. The scene and the canvas model never import them. | Built, lock |
| D5 | World units are float64 with y down. An item's x and y are its center. The renderer turns positions into camera-relative values before the GPU sees them. | Built, lock |
| D3 | Scene state is a plain TypeScript store owned by the canvas, outside React state. React reads selection, tool, and zoom from it. | Planned, lock |
| D4 | The scene applies changes from the server, except to items in a gesture. A drag stays local until release. | Planned |
| D9 | Shortcuts come from one keymap table through TanStack Hotkeys. They do not fire while a text field has focus. | Planned |
| D11 | Handles and outlines are drawn in an overlay above the GPU layer. The renderer draws textured quads only. | Planned |
| D14 | Undo is a client-side stack of inverse operations per session. | Planned |
| D16 | Files can be dragged in, and a Ref can be dragged from the gallery onto a canvas, with native drag and drop. | Planned |
| D17 | A note is plain text with a size and a color. It is drawn to a texture with Canvas2D and edited in a DOM overlay. | Planned |
| D20 | The canvas shows the 2048 px copy and loads the original when zoomed past it. | Planned |
| D6 | Zoom runs from 1% to 6400%, toward the cursor. | Later |
| D8 | Touch and pen do pan and pinch only at first. | Later |
| D10 | Selection is click, shift-add, and marquee, with eight handles plus rotate and a locked aspect ratio. | Later |
| D13 | Arrange offers grid, pack, align, and distribute. The same packing places new items for B6. | Later |
| D15 | Paste takes images, files, and image URLs. Copy puts the selection on the clipboard as PNG. | Later |
| D19 | An animated image shows its first frame at first. | Later |
| D22 | A cached snapshot is shown before the server answers. This is part of the speed work. | Later |
| D7 | The wheel pans. Pinch or Ctrl+wheel zooms. Space-drag and middle-drag pan. A mouse preset makes the wheel zoom. | Open |
| D12 | There is no snapping at first. | Open |
| D21 | A canvas has one background color. | Open |

## Gallery

| ID | Rule | State |
|---|---|---|
| E3 | Images are added by paste, drop, and the file picker, from the gallery or a canvas. Only the file picker exists. | Planned |
| E4 | Uploading inside a collection adds the Ref to that collection. | Planned |
| E2 | Filters are tags, collection, and search text, and they are kept in the URL. | Planned |
| E6 | Search is a Convex full-text search index over name, note, tags, and source. | Planned |
| E7 | Bulk actions are tag, add to collection, and delete. | Later |
| E1 | The gallery is a masonry grid with TanStack Virtual. Today it is a plain grid. | Open |

## Web app

| ID | Rule | State |
|---|---|---|
| G3 | App routes render in the browser, behind sign-in. | Built |
| F7 | The landing page is a route in the same app. | Built |
| F4 | Use TanStack Virtual, Form, Hotkeys, and Pacer for those jobs when they come up. Router and Query are set up. | Planned |
| F6 | Edits show at once through Convex optimistic updates. | Planned |
| F5 | Pages call Confect functions with the hooks from `@confect/react`, which decode results with the function's schema. TanStack Query is for data that is not a live Convex subscription. | Built |

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
- **D7, D12, D21.** Canvas input, snapping, and background.
- **A6.** Mobile behavior.
- **K4.** The CLI's license.
