const day = 24 * 60 * 60 * 1000;

/** An image in the trash is deleted for good this many days after it was deleted. */
export const trashDays = 30;
export const trashMs = trashDays * day;

/** An object is deleted from R2 this long after the last Blob row of its bytes was. */
export const sweepMs = 7 * day;

/**
 * A sweep that set `sweepingAt` this long ago is dead, and another may finish its work. Convex ends
 * an action after 30 minutes at most. The rest of the wait is for a delete that the dead sweep had
 * already sent: R2 must have applied or dropped it by now, or it could delete bytes saved again
 * after the takeover. R2 promises no limit on that, so the wait is far longer than any request
 * lasts.
 */
export const sweepLockMs = 12 * 60 * 60 * 1000;

/** The whole days, rounded up, before an image deleted at `deletedAt` is deleted for good. */
export const daysLeft = (deletedAt: number, now: number) =>
  Math.max(0, Math.ceil((deletedAt + trashMs - now) / day));
