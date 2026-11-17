const day = 24 * 60 * 60 * 1000;

/** An image in the trash is deleted for good this many days after it was deleted. */
export const trashDays = 30;
export const trashMs = trashDays * day;

/** An object is deleted from R2 this long after the last Blob row of its bytes was. */
export const sweepMs = 7 * day;

/** The whole days, rounded up, before an image deleted at `deletedAt` is deleted for good. */
export const daysLeft = (deletedAt: number, now: number) =>
  Math.max(0, Math.ceil((deletedAt + trashMs - now) / day));
