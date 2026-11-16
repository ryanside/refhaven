# refhaven decision list

This list covers the decisions refhaven needs to start building. refhaven is a hobby project: a reference library you can view as a gallery or arrange on a canvas, with agent access through MCP and a CLI. It is built for its author first. It may later offer a free plan and subscription plans. The code is open source under AGPL.

Updated 2026-11-16. Facts with a link were read from that source on that date.

## How to read a row

| Status | Meaning |
|---|---|
| Settled | You decided it. |
| Default | Recommended, and applied unless you change it. |
| Your call | Taste or preference. A default is shown. |
| Later | Decide when you build that part. A default is shown. |

"Lock" marks a decision that is painful to change once there is real data.

## A. Scope

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| A1 | Who it is for | You first. Others later, on a free plan and subscription plans. | Settled | |
| A2 | First version | A library with a gallery view, collections, a canvas view, uploads, and text search. Then the CLI and MCP. | Settled | Uploads mean paste, drop, and the file picker. |
| A3 | Not in the first version | The browser extension, public sharing, co-op editing, AI tags, semantic search, video, offline editing, desktop shell, mobile editing, PureRef import | Settled | Section T keeps room for them. |
| A4 | Speed work | Product first. The custom renderer and image tuning come after. | Settled | |
| A5 | Priorities | Good developer experience, low hosting cost, and room to grow | Settled | |
| A6 | Mobile | The gallery is responsive. Canvases are view-only. | Your call | |

## B. Product model

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| B1 | Library | Everything you have saved. Each saved thing is a Ref. | Settled, lock | |
| B2 | Collection | A named set of Refs. A Ref can sit in many collections. | Settled, lock | |
| B3 | Two views | Any set of Refs can be shown as a gallery or as a canvas. The set is the whole library, a filter, or one collection. | Settled, lock | |
| B4 | What a canvas is | The canvas view of a collection, or of the whole library. There are no separate boards. | Default, lock | A moodboard is a collection you look at as a canvas. |
| B5 | Canvas layout | Each collection keeps one saved layout. The whole library keeps one too. | Default, lock | |
| B6 | New items on a canvas | An item dropped on the canvas lands where you dropped it. An item added anywhere else is placed beside the existing layout the next time the canvas opens. | Default | |
| B7 | Removing an item from a canvas | Removes it from that collection. It stays in the library. | Default | |
| B8 | Repeats | One canvas item per Ref per canvas | Default | Duplicates can come later. |
| B9 | Canvas-only items | Notes and groups live on the canvas and not in the library | Default | |
| B10 | The whole library on one canvas | Works like any canvas. Loading thousands of items in pieces comes with the speed work. | Later | This is the case your own renderer is for. |
| B11 | Filters in canvas view | Dim the items that do not match | Later | |

## C. Backend and data

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| C1 | Backend | Convex | Settled, lock | Free up to 1M function calls and 0.5 GB of data a month ([pricing](https://www.convex.dev/pricing)). |
| C2 | Effect on Convex | Confect | Settled | Version 10.6 needs `effect ~4.1.0`, checked on npm. It is pre-1.0 and maintained outside Convex. Test 2 passed. Confect adds about 40 ms of server time to a query that returns 1,000 documents (215 ms against 175 ms, 30 calls each in test 3). A one-time probe with temporary functions, 5 to 6 calls each, put the cost of loading Effect and Confect at about 17 ms per call, and Confect's `experimental_reuseContext` option removed it. That option is off. |
| C3 | Live updates | Convex live queries. A canvas does not use one live query for all of its items. See C19. | Default | Online only. Changed by test 3. |
| C4 | Ownership | Every document carries `workspaceId`. Each user gets a personal workspace. | Default, lock | Leaves room for co-op and teams. |
| C5 | Tables | Workspace, Blob, Ref, Collection, CollectionRef, Tag, Canvas, CanvasItem | Default, lock | |
| C6 | Blob and Ref | A Blob is bytes keyed by SHA-256 inside a workspace. A Ref points to blobs by role. | Default, lock | Roles are original, thumbnail, and display. |
| C7 | CanvasItem kinds | A tagged union of image, note, and group | Default, lock | An image item points at a Ref. |
| C8 | IDs | Convex document IDs. Canvas items also carry a client-made `key`, so the canvas can create them at once. | Default, lock | |
| C9 | Canvas storage | One document per item | Default, lock | A document caps at 1 MiB and a query can read 16 MiB ([limits](https://docs.convex.dev/production/state/limits)). |
| C10 | Saving edits | One mutation per gesture, carrying a list of item operations | Default, lock | |
| C11 | Conflicts | Each operation patches only the fields it changed, so the last write wins per field | Default | |
| C12 | Item properties | x, y, uniform scale, rotation, flip, crop rectangle, opacity, grayscale | Default, lock | Stored on the item. Never baked into pixels. |
| C13 | Z-order | A fractional index string per item | Default, lock | |
| C14 | Groups | A parent reference on items. One level in the UI at first. | Default | |
| C15 | Deletes | Soft delete with a 30-day trash | Default | C19 depends on this. A deleted item must stay a document so that the changes query can report it. |
| C16 | What a Ref records | Source URL when there is one, file name, upload time, dimensions, MIME type, byte size, hash, note | Default, lock | |
| C17 | URLs | `/library`, `/c/{collectionId}`, and `/r/{refId}`, with `view=gallery` or `view=canvas` | Default, lock | |
| C18 | Export | A zip with `manifest.json` and the original files | Later | |
| C19 | Canvas sync | Each canvas document carries a revision counter. A mutation raises the counter and stamps the items it wrote. The client loads a snapshot, then subscribes to the items written after the snapshot's revision. The client takes a new snapshot on every page load and when the change list passes a set size. | Default, lock | Added by test 3. One live query resends every item on each change. The change list grows with every distinct item changed since the snapshot, so a session that never takes a new snapshot ends up resending the whole canvas. A snapshot must not outlive the trash period of C15. Once a deleted item's document is purged, the change list stops reporting it, and a client that still holds an older snapshot would show the item again. Every write to a canvas updates the one canvas document, so two writers to the same canvas conflict and Convex retries one of them. Look at this again before co-op. |

## D. Canvas behavior

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| D1 | Renderer | PixiJS 8 on WebGL, behind a small renderer interface | Settled | The interface is set camera, upsert items, remove items, upload texture, evict texture, draw. |
| D2 | Pixi types | Kept out of the scene and canvas model | Default, lock | Makes your own engine a backend swap later. |
| D3 | Scene state | A plain TypeScript store owned by the canvas, outside React state | Default, lock | React reads selection, tool, and zoom from it. |
| D4 | Live query and the scene | The scene applies changes from the live query, except to items in a gesture | Default | Drags stay local until release. |
| D5 | Coordinates | World units as float64 with y down. The renderer gets camera-relative float32. | Default, lock | |
| D6 | Zoom range | 1% to 6400%, toward the cursor | Later | |
| D7 | Input | Wheel pans. Pinch or Ctrl+wheel zooms. Space-drag and middle-drag pan. A mouse preset makes the wheel zoom, as PureRef does. | Your call | |
| D8 | Touch and pen | Pan and pinch only at first | Later | |
| D9 | Shortcuts | One keymap table through TanStack Hotkeys. Shortcuts do not fire while a text field has focus. | Default | |
| D10 | Selection | Click, shift-add, marquee. Eight handles plus rotate. Aspect ratio locked. | Later | |
| D11 | Handles and outlines | Drawn in an overlay above the GPU layer | Default | The renderer then draws textured quads only. |
| D12 | Snapping | None at first | Your call | PureRef has none. |
| D13 | Arrange | Grid, pack, align, and distribute | Later | The same packing places new items for B6. |
| D14 | Undo | A client-side stack of inverse operations per session | Default | |
| D15 | Clipboard | Paste images, files, and image URLs. Copy the selection as PNG. | Later | |
| D16 | Drag and drop | Native drag and drop for files, and from the gallery onto a canvas | Default | |
| D17 | Notes | Plain text with size and color, drawn to a texture with Canvas2D and edited in a DOM overlay | Default | |
| D18 | Formats | PNG, JPEG, WebP, GIF, AVIF. SVG is rasterized at upload. | Default | |
| D19 | Animated images | First frame at first | Later | |
| D20 | Large images | The canvas shows the 2048 px copy and loads the original when zoomed past it | Default | |
| D21 | Canvas background | One color per canvas | Your call | |
| D22 | Instant open from a local copy | A cached snapshot shown before the live query answers | Later | Part of the speed work. |

## E. Gallery and library behavior

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| E1 | Gallery | A masonry grid with TanStack Virtual | Your call | |
| E2 | Filters | Tags, collection, and search text, kept in the URL | Default | |
| E3 | Uploads | Paste, drop, and the file picker, from the gallery or a canvas | Settled | |
| E4 | Uploading inside a collection | Adds the Ref to that collection | Default | |
| E5 | Duplicates | The same hash reuses the blob and tells you | Default | |
| E6 | Search | A Convex full-text search index over name, note, tags, and source | Default | At most 16 terms a query and 1,024 results ([limits](https://docs.convex.dev/production/state/limits)). |
| E7 | Bulk actions | Tag, add to collection, delete | Later | |

## F. User interface

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| F1 | Framework | TanStack Start with React | Settled | Convex has an official TanStack Start setup ([quickstart](https://docs.convex.dev/quickstart/tanstack-start)). |
| F2 | Components | shadcn, created with `--preset b1VlJAwK` | Settled | |
| F3 | Styling | Tailwind 4 | Settled | |
| F4 | TanStack libraries | Router, Query, Virtual, Form, Hotkeys, Pacer | Settled | |
| F5 | Server data | Convex queries through TanStack Query, with `@convex-dev/react-query` | Your call | Results update live. Confect's React hooks in `@confect/react` decode results with the function's schema, and they use `convex/react`, not TanStack Query. The router sets up both on one Convex client. Choose which one calls Confect functions. |
| F6 | Optimistic edits | Convex optimistic updates | Default | |
| F7 | Landing page | A route in the same Start app | Default | One app to deploy. |
| F8 | Look | Whatever the preset gives. The UI stays plain for now. | Settled | The first UI is throwaway. The polished design comes later. |

## G. Sign-in

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| G1 | Library | Convex Auth 2.0 | Default | Stable since November 2026. Convex recommends it over Better Auth for new apps ([docs](https://docs.convex.dev/auth/convex-auth)). Test 1 passed under TanStack Start. |
| G2 | Methods | GitHub, Google, and passkeys | Your call | Emailed codes and magic links are not in 2.0 yet ([launch post](https://stack.convex.dev/convex-auth-v2)). A passkey account is a username plus a passkey. It has no email address. |
| G3 | App routes | Rendered in the browser, behind sign-in | Default | Tested. The signed-in routes set `ssr: false`. The session tokens live in `localStorage`, because the cookie mode of Convex Auth is for Next.js only. |
| G4 | Fallback | Convex's Better Auth component | Later | It documents TanStack Start. Not needed, because test 1 passed. |
| G5 | CLI and agents | A personal API key, stored hashed | Default | |
| G6 | Key scopes | Read, or read and write. No delete. | Default, lock | |

## H. Storage and images

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| H1 | API | The S3 API | Settled | |
| H2 | Store | Cloudflare R2, through Convex's R2 component | Default | Convex's own file storage charges $0.12 per GB served ([pricing](https://www.convex.dev/pricing)). R2 serves for free. Test 4 passed. |
| H3 | Originals | Kept byte-exact | Default, lock | |
| H4 | Keys | `w/{workspaceId}/o/{sha256}` and `w/{workspaceId}/v/{sha256}/{spec}.webp` | Default, lock | |
| H5 | De-duplication | Per workspace, never global | Default, lock | |
| H6 | Uploads | A signed URL, then the browser uploads straight to R2 | Default | The server issues the object key. The R2 component's `syncMetadata` mutation accepts any key the client sends, so the server must refuse a key outside the caller's prefix. `images.ts` does this, and `check:upload-keys` tests it. |
| H7 | Upload limit | 50 MB per image | Your call | |
| H8 | Variants | A 512 px WebP thumbnail, a 2048 px WebP display copy, and a ThumbHash | Default | |
| H9 | Who makes variants | The browser, at upload. For CLI and agent saves, the app makes them the first time it shows the image. | Default | No server image code. |
| H10 | Serving | Signed URLs from R2 | Default | Test 4 passed with the bucket's CORS policy listing the app's origin. The component signs a URL for 15 minutes unless told otherwise, so a canvas that stays open needs fresh URLs. |

## I. Hosting, runtime, and repository

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| I1 | Backend host | Convex Cloud, free plan | Default | |
| I2 | Web host | Vercel | Default | The Hobby plan is for personal, non-commercial use. A web host is quick to change later. |
| I3 | Runtime and package manager | Bun | Settled | Convex functions run on Convex's own runtime. |
| I4 | Repository | One monorepo with Bun workspaces and Turborepo, public on GitHub | Settled | See "Repository layout" below. Nothing is pushed until you have reviewed it locally. |
| I5 | API for the CLI and agents | A Confect HTTP API inside Convex, calling the same functions as the browser | Default | One write path for every client. |
| I6 | Background jobs | Convex's scheduler and cron | Default | |
| I7 | Access checks | One helper that resolves the workspace and scopes, used by every function | Default, lock | Started as the `RequireUser` Confect middleware, which provides the signed-in user. |
| I8 | Deploys | `convex deploy` and Vercel's Git deploys | Default | |
| I9 | What stays from Ratstack | Effect, the contract-first habit, and the lint setup | Default | |

## J. Agent interface

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| J1 | Transport | A local MCP server over stdio, started by the CLI | Default | A remote MCP endpoint comes later. |
| J2 | Tools | `search_refs`, `get_ref`, `view_refs`, `list_collections`, `get_collection`, `save_ref`, `add_to_collection` | Default | Each is also a CLI command. |
| J3 | Deletes by agents | None | Default | |
| J4 | Images in results | Text and metadata first. Pixels on request, at most four per call. | Default | |
| J5 | CLI | Effect's CLI module on Bun, published to npm | Default | |

## K. Plans, license, and tooling

| ID | Decision | Choice | Status | Note |
|---|---|---|---|---|
| K1 | Payments | Polar, through Convex's Polar component | Settled | Not needed while it is only you. |
| K2 | Plans | A free plan and subscription plans | Settled | Tiers and prices are open. |
| K3 | License | AGPL-3.0 | Settled | |
| K4 | License for the CLI | MIT | Your call | |
| K5 | TypeScript | 7.0 with the Effect language service | Default | TypeScript 7.0.2 type-checks every package. For TypeScript 7 the Effect language service is the `@effect/tsgo` package, not `@effect/language-service`. It is not set up yet. |
| K6 | Lint and format | Oxlint and Oxfmt | Default | |
| K7 | Tests | Vitest, with `convex-test` for functions | Default | Start with the pure canvas logic. |
| K8 | Git hooks | lefthook with a light pre-commit | Default | |
| K9 | Versions | Exact pins | Default | |
| K10 | Name | refhaven | Settled | You have the domain, and the GitHub name is free on your account. The npm name is not checked. |
| K11 | Convex help for agents | Convex's agent skills, installed globally | Settled | |

## L. Safety basics

| ID | Decision | Choice | Status |
|---|---|---|---|
| L1 | Uploads | The server records the real file type and ignores the client's claim | Default |
| L2 | Image access | The server checks the workspace before it signs a URL | Default |
| L3 | API keys | Hashed at rest and revocable | Default |
| L4 | Fetching a URL for a save | http and https only. Cap size and time. | Default |

## T. Room kept for later

| ID | Later feature | What the model keeps room for now |
|---|---|---|
| T1 | Browser extension | WXT. Saves call the same `save_ref` function. A Ref already records a source URL. |
| T2 | Public sharing | A `/s/{token}` route and a public R2 path |
| T3 | Co-op | Live queries already carry other people's edits. Add presence. |
| T4 | AI tags | A `source` on each tag with the values user, agent, and model |
| T5 | Semantic search | Convex vector search, in its own table keyed by ref and model |
| T6 | Video | A `kind` on Ref and a set of blobs per Ref |
| T7 | Your own renderer | The renderer interface and a `levels` field on blobs for more image sizes |

## Repository layout

```
apps/
	web/         TanStack Start app
	cli/         CLI and the stdio MCP server
packages/
	backend/     Convex functions with Confect, and the schema
	scene/       pure canvas model with transforms, hit testing, and undo
	renderer/    the renderer interface and the Pixi backend
	ui/          shared shadcn components
```

`apps/extension` joins later. `apps/cli` does not exist yet.

## Try these first

Each is a small test that could change a decision above.

1. Sign in with Convex Auth 2.0 under TanStack Start.
2. Write one Confect function on Effect 4.1 that reads the signed-in user.
3. Open a canvas of 1,000 items as one live query. Check how much data each update sends.
4. Load an R2 image into a WebGL texture from the browser through a signed URL.

### Results on 2026-11-16

Each test has a script in `apps/web/checks`. The scripts drive headless Chromium against the cloud dev deployment.

1. **Passed.** Sign-up with a passkey, a page reload, sign-out, and sign-in with the same passkey all work. A query without a session fails with `NotSignedIn`. The passkey came from Chromium's virtual passkey device, not from a real fingerprint prompt.
2. **Passed.** `users.whoAmI` returns the signed-in user to the browser. Convex rejects a wrong argument type and an undeclared argument. Effect Schema rejects an empty or too long `greeting`. The return check was seen once by hand and no script repeats it: with `message` set to a number in the implementation, the call failed with `SchemaError: Expected string`.
3. **The whole result is resent.** The numbers are the median of 25 changes per design, with the range in parentheses.

	| Design | JSON received per change | Bytes on the wire per change | Time from the mutation call to the new items in React |
	|---|---|---|---|
	| One live query through Confect | 247,952 bytes, all 1,000 items | 42.2 KB | 367 ms (338 to 430) |
	| One live query as a plain Convex function | 247,952 bytes, all 1,000 items | 42.2 KB | 321 ms (304 to 389) |
	| Snapshot plus the changes since a revision (C19) | 881 bytes for the first change after a snapshot, 1,873 bytes for the fifth | 214 to 248 bytes | 180 ms (168 to 202) |

	The change list grows by about 250 bytes of JSON for each distinct item changed since the snapshot. The test stops at five changes, so it does not show a long session.

	Opening the canvas costs about 248 KB of JSON and 46 KB on the wire in every design. That is from a production build, 5 loads per design. On the dev server the two live designs sometimes receive the result twice, 496 KB, because the page subscribes, unsubscribes, and subscribes again.

	Most of the time is server function time. `convex logs` for the same run gives these medians: `canvas.moveItems` takes 63 ms, and the query that reruns after it takes 215 ms through Confect, 175 ms as a plain Convex function, and 59 ms for the change list. The other 60 to 90 ms cover the network round trip, the transfer, and the browser, and the test does not split them further. From the WebSocket frame that carries the items to the React update, the browser takes 14 ms through Confect, 10 ms for the plain function, and 3 ms for the change list.

	Each rerun of a live query reads 1,002 documents and 403 KB from the database. A rerun of the change list reads 2 to 7 documents.
4. **Passed.** An image uploaded through the R2 component was fetched through a signed URL and drawn by the PixiJS renderer. The canvas pixel at the item's center matched the image's color, and the console showed no error. R2 answered with `access-control-allow-origin: http://localhost:3000`. The same signed URL was refused from an origin that the CORS policy does not list. The browser loads the image with `fetch`, then `createImageBitmap`, then a texture upload.

	The R2 settings it needed:

	- A private bucket. It needs no public access.
	- A CORS policy on the bucket with `AllowedOrigins` set to the app's origin, `AllowedMethods` set to `GET` and `PUT`, and `AllowedHeaders` set to `Content-Type`. The test shows the origin matters. It does not test each of the other fields alone.
	- An API token with **Object Read & Write**, limited to the bucket.
	- Four environment variables on the Convex deployment: `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. `R2_ENDPOINT` is the account URL, `https://<account-id>.r2.cloudflarestorage.com`, without the bucket name after it. The component does not need `R2_TOKEN`.

## The backend that was not chosen

PlanetScale Postgres with a Bun server on Railway, Ratstack's capability package, and Alchemy. It costs about $10 to $15 a month and has no live updates. It fits if plain SQL ever matters more than free hosting.

## Parked until this is more than a hobby

Terms and a privacy page, a copyright takedown contact, a process for reporting illegal content, rules for EU and UK users, a contributor agreement, a trademark, and a legal entity.

## Versions checked on npm on 2026-11-16

| Package | Version |
|---|---|
| bun | 1.4.4 |
| turbo | 2.11.11 |
| effect | 4.1.4 |
| convex | 1.50.0 |
| @confect/server | 10.6.0 |
| @confect/core | 10.6.0 |
| @confect/cli | 10.6.0 |
| @confect/react | 10.6.0 |
| @effect/platform-node | 4.1.4 |
| @convex-dev/auth | 2.0.0 |
| @convex-dev/react-query | 0.1.0 |
| @convex-dev/r2 | 0.10.4 |
| @convex-dev/polar | 0.9.2 |
| pixi.js | 8.23.0 |
| react | 19.3.1 |
| @tanstack/react-start | 1.169.5 |
| @tanstack/react-router | 1.170.46 |
| @tanstack/react-router-ssr-query | 1.167.3 |
| vite | 8.3.8 |
| @tanstack/react-query | 5.107.1 |
| @tanstack/react-virtual | 3.14.26 |
| @tanstack/react-form | 1.33.5 |
| @tanstack/react-hotkeys | 0.27.0 |
| @tanstack/react-pacer | 0.24.1 |
| shadcn | 4.23.0 |
| tailwindcss | 4.3.5 |
| vitest | 5.1.0 |
| typescript | 7.0.2 |
| oxlint | 1.94.0 |
| oxfmt | 0.79.0 |
| lefthook | 2.2.2 |
| playwright | 1.65.1 |
