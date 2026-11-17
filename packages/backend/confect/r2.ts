import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/components";
import { type Sha256, sha256Base64 } from "./blob";

export const r2 = new R2(components.r2);

const checksumHeader = "x-amz-checksum-sha256";

/**
 * A signed upload that R2 accepts only for bytes with this SHA-256. The URL can neither store
 * other bytes under the key nor replace the object with other bytes later.
 */
export async function hashBoundUpload(key: string, sha256: Sha256) {
  const checksum = sha256Base64(sha256);
  const url = await getSignedUrl(
    r2.client,
    new PutObjectCommand({ Bucket: r2.config.bucket, Key: key, ChecksumSHA256: checksum }),
    // R2 checks the hash only when it is a signed header. The presigner's default moves it
    // into the URL, where R2 ignores it.
    { unhoistableHeaders: new Set([checksumHeader]) },
  );
  return { url, headers: { [checksumHeader]: checksum } };
}
