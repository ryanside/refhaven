# refhaven

A reference library for images. You save images into a library, group them into collections, and view any set as a gallery or as a canvas. The decisions behind the stack are in [docs/decisions.md](docs/decisions.md).

This repository is at its first build step. It holds the project setup and four small tests of the stack. The pages under `/lab` are throwaway.

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
| `bun run check:confect` | A Confect function returns the signed-in user and refuses bad arguments. |
| `bun run check:canvas-sync` | The bytes and time one change costs on a canvas of 1,000 items. |
| `bun run check:renderer` | A local bitmap drawn as a WebGL texture by the PixiJS renderer. |
| `bun run check:upload-keys` | An upload key outside the caller's prefix is refused. |
| `bun run check:texture` | An image uploaded to R2 drawn as a WebGL texture. It needs the R2 environment variables on the Convex deployment. |

## Layout

| Path | Contents |
|---|---|
| `apps/web` | The TanStack Start app. |
| `packages/backend` | The Convex backend. You write code in `confect/`. `confect codegen` writes `convex/` and `confect/_generated/`. |
| `packages/scene` | The pure canvas model. |
| `packages/renderer` | The renderer interface and its PixiJS backend. |
| `packages/ui` | The shadcn components. |

## License

AGPL-3.0. See [LICENSE](LICENSE).
