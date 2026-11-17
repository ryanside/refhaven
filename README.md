# refhaven

A reference library for images. You save images into a library, group them into collections, and view any set as a gallery or as a canvas. The rules for working in this repo are in [docs/decisions.md](docs/decisions.md).

This repository is early. You can sign in with a passkey, save images into your library by picking, pasting, or dropping them on a gallery, and view the library as a gallery or as a canvas. On the canvas you can pan, zoom, select, and move images. You can group images into collections, rename a collection, and view it as a gallery or as its own canvas at `/c/{collectionId}`. You can delete an image from the library's gallery. It goes to the trash at `/trash`, and a restore brings it back to its collections and to its place on each canvas. Each image has its own page at `/r/{refId}`, opened from its card, where you edit its name, a note, the link it came from, and its tags, and see the collections it is in. Nothing empties the trash yet, and a collection cannot be deleted yet.

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
| `bun run check:canvas` | The canvas functions: placing saved images, a patch, a removal, refused edits, and the rules between two users. It needs R2. |
| `bun run check:canvas-page` | The canvas page with the real mouse and wheel: drawing, pan, zoom, selection, saved moves, a second page, the 2048 px copy, and a collection's canvas. It needs R2. |
| `bun run check:paste-drop` | Dropping and pasting images on the library's and a collection's gallery, a file that is not an image refused with an outcome, text and a paste into a field left alone, a drag from the page itself ignored, and a canvas and the trash page refusing a drop. It needs R2. |
| `bun run check:ref-page` | An image's page: opening it from a card, the 2048 px copy, saving its name, note, source, and tags, refused values on the page and on the server, its collections, the trash, and the rules between two users. It needs R2. |
| `bun run check:renderer` | A local bitmap drawn as a WebGL texture by the PixiJS renderer. |
| `bun run check:trash` | Deleting an image on the page, the trash page, a second page's canvas, restoring to every gallery and canvas place, deleting and restoring twice, refused edits in the trash, and the rules between two users. It needs R2. |

Agents verify a change in the running app with the `verify-refhaven` skill in `.agents/skills/verify-refhaven`. Its helper script starts the app, checks it, runs a drive script, and keeps the evidence.

## Layout

| Path | Contents |
|---|---|
| `apps/web` | The TanStack Start app. |
| `packages/backend` | The Convex backend. You write code in `confect/`. `confect codegen` writes `convex/` and `confect/_generated/`. |
| `packages/scene` | The pure canvas model: the scene store, camera math, hit testing, and placement. |
| `packages/renderer` | The renderer interface and its PixiJS backend. |
| `packages/ui` | The shadcn components. |

## License

AGPL-3.0. See [LICENSE](LICENSE).
