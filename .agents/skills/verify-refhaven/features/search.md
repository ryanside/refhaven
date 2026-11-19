# Search and tag filter

The library's gallery and each collection's gallery have a field labelled `Search` and a select labelled `Tag` above the grid. Search finds an image by a word of its name, its note, its source link, or its tags. The Tag select offers `All tags` and the user's tags. Both write to the URL as `q` and `tag`, so a filtered gallery survives a reload and the back button. A filtered gallery shows at most 200 images with the same cards, says so when there are more, and says `No images match.` when none do. A `Clear filters` link brings the whole gallery back. Images in the trash are never found. Each user finds only their own images.

## Sub-features

- `search-text` finds an image by words of its name, note, source, or tags. An image is found only when it holds every word typed. The last word matches by its beginning, and every other word matches whole. Best matches come first.
- `search-tag` shows exactly the images with the chosen tag, newest tagged first. With a search text, it shows only images that match both.
- `search-url` keeps the filters in the URL. An empty field is absent from it. A reload keeps them, and one press of the back button leaves the filtered view.
- `search-clear` brings the whole gallery back with `Clear filters`.
- `search-collection` filters a collection's page to that collection's members.
- `search-live` follows a rename, a note, a removed tag, a delete, a restore, and a new save at once.
- `search-tag-link` links each tag on an image's page to `/library?tag={name}`.
- `search-more` shows `Showing the first 200 matches.` when more images match.
- `search-private` finds none of another user's images. `library.filter` on another user's collection fails with `CollectionNotFound`.

## How to get to it (user POV)

- Type in `Search` or choose a tag in `Tag` on `/library` or on a collection's gallery, `/c/{collectionId}?view=gallery`.
- Open `/library?q=<text>&tag=<name>` or `/c/{collectionId}?view=gallery&q=<text>&tag=<name>` directly. A tag in any case, such as `?tag=Mood`, filters by its lowercase form.
- Click a tag on an image's page at `/r/{refId}`.

A collection's canvas shows neither control and ignores the filters. `/library` has no canvas. It ignores a `view` in its URL and leaves it there.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports that the deployment has the four R2 variables.
- A new user, signed in with `signInWithPasskey`, who saved images through the Library recipe. Give them unambiguous names, notes, sources, and tags, on the image page or through `ref.update` and `ref.addTags`.

- **Search.** Run `page.getByLabel("Search", { exact: true }).pressSequentially("<word>", { delay: 50 })`, or `fill`. The URL changes about 300 ms after the last key. Wait until `new URL(page.url()).searchParams.get("q")` is the trimmed text and the card names, `page.locator("[data-ref-id] p")`, are the expected ones.
- **Tag.** Run `page.getByLabel("Tag", { exact: true }).selectOption("<name>")`. The URL holds `tag` at once. `selectOption("")` is `All tags`.
- **No match.** `page.getByText("No images match.")` shows and there is no card.
- **History.** Open `/library` from another page, type twice with a pause, and call `page.goBack()`. The URL is `/library` with no `q`, and the field is empty.
- **Clear.** Click `page.getByRole("link", { name: "Clear filters" })`. The whole gallery shows and both controls are empty.
- **Tag link.** On `/r/{refId}`, click `page.getByRole("link", { name: "<tag>", exact: true })`. It opens `/library?tag=<tag>`.
- **More.** Save 201 images whose names share a word, as `apps/web/checks/search.ts` does with `library.save` and one Blob's hash. Search for the word. The page shows 200 cards and `Showing the first 200 matches.`
- **Private.** Search in a second user's page. It shows `No images match.` Call `library.filter` with the first user's `collectionId` from the second user's `clientFor(page)`. It fails with `CollectionNotFound`.
- **Proof.** Screenshot a library with a search text and a tag set. `verify.sh rows refs` shows each Ref's `searchText`.

`apps/web/checks/search.ts` runs this journey and the same rules through `library.filter`.

## Gotchas

- Wait for the URL and the cards together. Right after typing, the old results still show until the pause ends.
- The last word matches by its beginning and every other word whole. `harb` finds `harbor`, `lantern harb` finds it too, and `harb lantern` does not.
- An image matches only when its text holds every word typed, so each added word narrows the result. Convex's index alone would return an image that holds any one word, and `library.filter` drops those.
- Words after the 16th are ignored without an error, by Convex's index and by `library.filter` alike.
- The Search field waits 300 ms after the last key before the URL changes. "Clear filters" and the back button cancel typing that has not reached the URL.
- Tags are lowercase. Choose `seascape`, not `Seascape`, in the select.
