import type { Renderer } from "@refhaven/renderer";
import type { ImageRole } from "@refhaven/scene";
import { usableForMs } from "@/library/use-ref-urls";

export type Need = { readonly refId: string; readonly role: ImageRole };

export type Sign = (
  refIds: ReadonlyArray<string>,
  role: ImageRole,
) => Promise<ReadonlyArray<{ refId: string; url: string }>>;

/** At most this many textures of each role stay uploaded. A display texture is up to 16 MB. */
const budgets: Record<ImageRole, number> = { thumbnail: 200, display: 12 };
const concurrentLoads = 4;
const urlsPerCall = 100;
const retryAfterMs = 2000;
const longestRetryMs = 30_000;

export const textureKey = ({ refId, role }: Need) => `${refId}/${role}`;

/**
 * Loads the textures the canvas needs, a few at a time, and keeps each role within its budget by
 * evicting the textures needed least recently.
 */
export function createTextureLoader(renderer: Renderer, sign: Sign, onChange: () => void) {
  const loaded = new Map<string, { role: ImageRole; lastNeeded: number }>();
  const loading = new Map<string, ImageRole>();
  const urls = new Map<string, { url: string; signedAt: number }>();
  const signing = new Map<string, Promise<void>>();
  const failed = new Map<string, { attempts: number; retryAt: number }>();
  let queue: Array<Need> = [];
  let pass = 0;
  let stopped = false;

  const freshUrl = (key: string) => {
    const signed = urls.get(key);
    return signed && Date.now() - signed.signedAt < usableForMs ? signed.url : undefined;
  };

  /** Signs the URL for `need`, together with the queued needs of its role that lack one. */
  const signFor = (need: Need) => {
    const inFlight = signing.get(textureKey(need));
    if (inFlight) return inFlight;
    const batch = [need, ...queue.filter(({ role }) => role === need.role)]
      .filter((next) => !freshUrl(textureKey(next)) && !signing.has(textureKey(next)))
      .slice(0, urlsPerCall);
    const signedAt = Date.now();
    const call = sign(
      batch.map(({ refId }) => refId),
      need.role,
    )
      .then((signed) => {
        for (const { refId, url } of signed) {
          urls.set(textureKey({ refId, role: need.role }), { url, signedAt });
        }
      })
      .finally(() => {
        for (const next of batch) signing.delete(textureKey(next));
      });
    for (const next of batch) signing.set(textureKey(next), call);
    return call;
  };

  const makeRoom = (role: ImageRole) => {
    const ofRole = [...loaded].filter(([, entry]) => entry.role === role);
    const inFlight = [...loading.values()].filter((loadingRole) => loadingRole === role).length;
    if (ofRole.length + inFlight < budgets[role]) return true;
    const [oldest] = ofRole
      .filter(([, entry]) => entry.lastNeeded < pass)
      .sort(([, a], [, b]) => a.lastNeeded - b.lastNeeded);
    if (!oldest) return false;
    renderer.evictTexture(oldest[0]);
    loaded.delete(oldest[0]);
    onChange();
    return true;
  };

  const load = async (need: Need) => {
    const key = textureKey(need);
    loading.set(key, need.role);
    try {
      if (!freshUrl(key)) await signFor(need);
      const url = freshUrl(key);
      if (!url) throw new Error("no signed URL");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`R2 answered ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      if (stopped) {
        bitmap.close();
        return;
      }
      renderer.uploadTexture(key, bitmap);
      loaded.set(key, { role: need.role, lastNeeded: pass });
      failed.delete(key);
      onChange();
    } catch {
      // A failed load is tried again after a wait that doubles each time, with no input needed.
      // Until then `update` leaves it out, so panning does not repeat the request every frame.
      const attempts = (failed.get(key)?.attempts ?? 0) + 1;
      const wait = Math.min(retryAfterMs * 2 ** (attempts - 1), longestRetryMs);
      failed.set(key, { attempts, retryAt: Date.now() + wait });
      if (!stopped) setTimeout(onChange, wait);
    } finally {
      loading.delete(key);
      if (!stopped) pump();
    }
  };

  const pump = () => {
    while (loading.size < concurrentLoads && queue.length > 0) {
      const need = queue.shift()!;
      if (makeRoom(need.role)) void load(need);
    }
  };

  return {
    /** Sets the textures needed now, most important first. */
    update(needs: ReadonlyArray<Need>) {
      pass += 1;
      for (const need of needs) {
        const entry = loaded.get(textureKey(need));
        if (entry) entry.lastNeeded = pass;
      }
      const now = Date.now();
      queue = needs.filter((need) => {
        const key = textureKey(need);
        return !loaded.has(key) && !loading.has(key) && (failed.get(key)?.retryAt ?? 0) <= now;
      });
      pump();
    },
    has: (need: Need) => loaded.has(textureKey(need)),
    stop() {
      stopped = true;
    },
  };
}
