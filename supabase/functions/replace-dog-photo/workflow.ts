export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export function imageExtension(bytes: Uint8Array, type: string): string {
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v);
  if (type === 'image/jpeg' && starts(255, 216, 255)) return 'jpg';
  if (type === 'image/png' && starts(137, 80, 78, 71, 13, 10, 26, 10)) return 'png';
  if (type === 'image/webp' && starts(82, 73, 70, 70) && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp';
  throw new Error('Choose a valid JPG, PNG or WebP image.');
}
export interface PhotoOperations {
  reserve(extension: string): Promise<string>;
  upload(path: string, bytes: Uint8Array, type: string): Promise<void>;
  commit(path: string): Promise<void>;
  retire(path: string): Promise<void>;
  cleanup(): Promise<void>;
}
export async function replacePhoto(bytes: Uint8Array, type: string, ops: PhotoOperations) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('Photos must be between 1 byte and 8 MB.');
  const extension = imageExtension(bytes, type);
  const path = await ops.reserve(extension);
  try {
    await ops.upload(path, bytes, type);
    await ops.commit(path);
  } catch (error) {
    // An ambiguous commit may already have succeeded. The server retires pending
    // objects only; it never deletes a current image in response to a client error.
    await ops.retire(path).catch(() => {});
    await ops.cleanup().catch(() => {});
    throw error;
  }
  let cleanupPending = false;
  try { await ops.cleanup(); } catch { cleanupPending = true; }
  return { saved: true, cleanupPending };
}
