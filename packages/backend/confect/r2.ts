import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

let deleter: S3Client | undefined;

/**
 * Deletes an object, in one attempt. R2 answers a delete of a missing key as a success. A delete
 * whose answer never comes fails here and is not sent again. The client's default would retry,
 * and the caller would then go on while the first request may still be on its way to R2.
 */
export const deleteObject = (key: string) => {
  deleter ??= new S3Client({
    region: "auto",
    endpoint: r2.config.endpoint,
    credentials: {
      accessKeyId: r2.config.accessKeyId,
      secretAccessKey: r2.config.secretAccessKey,
    },
    maxAttempts: 1,
  });
  return deleter.send(new DeleteObjectCommand({ Bucket: r2.config.bucket, Key: key }));
};
