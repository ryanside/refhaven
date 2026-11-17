# Trash

Each card in the library's grid has a `Delete` button. A deleted image goes to the trash at `/trash`. It leaves the library, every collection's grid, and every canvas at once, also in other open pages, without a reload. `/trash` lists the deleted images, newest deleted first, each with a `Restore` button. A restored image comes back to the library, to its collections, and to the same place on each canvas. `/trash` says that images there are deleted for good 30 days after they were deleted, and each card shows its days left. A daily job purges an image 30 days after it was deleted, and another sweeps its bytes from R2 a week later. A check runs both on a pretend clock. Each user sees only their own trash.

## Sub-features

- `trash-delete` takes an image out of the library with the card's `Delete` button on `/library`.
- `trash-list` shows the deleted images on `/trash`, newest deleted first, with their thumbnails and no file picker.
- `trash-empty` shows `The trash is empty.` when nothing is deleted.
- `trash-everywhere` takes a deleted image out of every collection's grid and every canvas, also in a page that is already open.
- `trash-restore` brings an image back with the card's `Restore` button on `/trash`, to the library, its collections, and its place on each canvas.
- `trash-days-left` says on `/trash` that images are deleted for good 30 days after they were deleted, and shows `30 days left` on a card deleted today.
- `trash-purge` deletes an image 30 days in the trash with every row that points at it, and its objects in R2 a week later unless the same bytes are saved again. A save of bytes that the sweep is deleting fails with `UploadNotFound`.
- `trash-private` refuses another user's image to `library.remove` and `library.restore` with `RefNotFound`.

## How to get to it (user POV)

- Choose the `Trash` link on `/library`.
- Open `/trash` directly.
- Choose the `Library` link on `/trash` to go back.

The `Delete` button exists only on `/library`. A collection's page keeps `Remove from collection`, and the canvas page has no delete key.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`, who saved images through the Library recipe. For the canvas path, add one to a collection and open both canvases once.

- **Delete.** On `/library`, run `page.locator('[data-ref-id="<refId>"]').getByRole("button", { name: "Delete" }).click()`. The page shows no confirmation. Wait for the card with `waitFor({ state: "detached" })`.
- **List.** Click `page.getByRole("link", { name: "Trash", exact: true })` and wait for `page.getByRole("heading", { name: "Trash" })`. Each deleted image is a card with `data-ref-id`. The latest deleted is first. Wait for the thumbnails as the Library recipe does.
- **Everywhere.** Before the delete, open `/library?view=canvas` in a second page with `page.context().newPage()`. Its `page.getByTestId("canvas-readout")` drops `data-items` by one after the delete. A collection's grid on `/c/{collectionId}` no longer shows the card.
- **Restore.** On `/trash`, click the card's `Restore` button. The card leaves `/trash`. Click `Library` and wait for the card. The open canvas page's `data-items` rises by one.
- **Days left.** On `/trash`, `page.getByText("Images in the trash are deleted for good 30 days after they were deleted.")` shows once, and `page.locator('[data-ref-id="<refId>"]').getByText("30 days left")` shows on a card deleted today.
- **Purge.** No page triggers it. Run `bunx convex run trash:purge '{"pretend":{"workspaceId":"<workspaceId>","now":<ms>}}'` from `packages/backend`, then `trash:sweep` the same way, with the run's own workspace from the `workspaceId` of one of its `refs` rows. An open `/trash` drops the purged cards without a reload.
- **Private.** Call `library.remove` and `library.restore` with the first user's Ref from a second user's `clientFor(page)`. Both fail with `RefNotFound`.
- **Proof.** Screenshot `/trash` with an image in it. Read `verify.sh rows refs` for the Ref's `deletedAt`, and `verify.sh rows collectionRefs` to see that its membership stays. Read `canvas.changes` through the API from the rev before the delete. It returns the item with a `deletedAt`, and after the restore without one, at the same `x`, `y`, `scale`, and `z`.

`apps/web/checks/purge.ts` runs the purge and the sweep: every row of a purged image, Refs that share a Blob, the objects in R2 before and after the sweep, the same bytes saved again, a save during a sweep, a second sweep beside a running one and after a dead one, 150 Refs, a second run, and a second user's image left alone.

`apps/web/checks/trash.ts` runs this journey and adds the rules the UI cannot reach: deleting and restoring twice, a Ref in the trash refused by `collections.addRefs` and `canvas.apply`, an item removed from a canvas before the delete, a Ref deleted before any canvas placed it, saving the same bytes again, byte-exact serving, and a call that mixes an own and a foreign Ref.

## Gotchas

- `Delete` and `Restore` save with no message on the page. Wait for the card to leave, not for text.
- The Ref keeps its collection memberships and canvas items while it is in the trash. `verify.sh rows` still shows them. Only the readers leave them out.
- An item removed from a canvas before the delete stays removed after the restore. Count the canvas's items with that in mind.
- A restored Ref that had an item on a canvas comes back at once, at its old place, through `canvas.changes`. A restored Ref that never had one is placed by the next `open`, beside the layout. `canvas.open` through the API places images.
- Saving bytes whose Ref is in the trash adds a new card to the library and leaves the old Ref in the trash.
- Never run `trash:purge` or `trash:sweep` without `pretend`, and never name a workspace other than the run's own. Without `pretend` they purge every workspace on the real clock, the owner's included. The daily jobs do that, and nothing else should.
- `trash:sweepBatch` alone begins a sweep and deletes nothing, which is how the check holds a sweep open. A `trash:sweep` an hour later by the pretend clock finishes it.
- The pretend time is compared with the real `deletedAt`, so a Ref deleted seconds ago is 30 days old at a pretend now 30 days ahead. An orphan row takes the pretend time of the purge that wrote it.
