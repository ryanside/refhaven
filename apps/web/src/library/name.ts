/** A file name as a title or a caption shows it, without its image extension. */
export const shownName = (fileName: string) =>
  fileName.replace(/(?<=.)\.(png|jpe?g|webp|gif|avif)$/i, "");
