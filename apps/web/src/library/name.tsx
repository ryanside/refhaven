/** A trailing image extension, which a name shown as a title or a caption leaves out of sight. */
const imageExtension = /\.(png|jpe?g|webp|gif|avif)$/i;

/** A file name as its stem and its image extension. A name with no image extension has none. */
export const splitName = (fileName: string): readonly [string, string] => {
  const match = imageExtension.exec(fileName);
  return match && match.index > 0 ? [fileName.slice(0, match.index), match[0]] : [fileName, ""];
};

/**
 * A file name as a title or a caption shows it, without its image extension. The extension stays in
 * the line of text at no size, so a screen reader and a copy read the whole name as one word.
 */
export function ShownName({ fileName }: { fileName: string }) {
  const [stem, extension] = splitName(fileName);
  return (
    <>
      {stem}
      {extension ? <span className="text-[0px]">{extension}</span> : null}
    </>
  );
}
