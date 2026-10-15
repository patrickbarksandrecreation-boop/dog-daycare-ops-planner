import { expect, it, vi } from 'vitest';
import { photoError } from '../src/model';
import { imageExtension, replacePhoto, MAX_PHOTO_BYTES } from '../supabase/functions/replace-dog-photo/workflow';
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
function fixture() {
  const order: string[] = [];
  const ops = {
    reserve: vi.fn(async () => { order.push('reserve'); return 'new.png'; }),
    upload: vi.fn(async () => { order.push('upload'); }),
    commit: vi.fn(async () => { order.push('commit'); }),
    retire: vi.fn(async () => { order.push('retire'); }),
    cleanup: vi.fn(async () => { order.push('cleanup'); }),
  };
  return { ops, order };
}
it('uploads before committing and cleans only after commit', async () => {
  const {ops,order} = fixture();
  await expect(replacePhoto(png,'image/png',ops)).resolves.toEqual({saved:true,cleanupPending:false});
  expect(order).toEqual(['reserve','upload','commit','cleanup']);
});
it.each(['upload','commit'] as const)('safely retires pending uploads after a failed %s', async step => {
  const {ops,order}=fixture(); ops[step].mockRejectedValueOnce(new Error('Network failed'));
  await expect(replacePhoto(png,'image/png',ops)).rejects.toThrow('Network failed');
  expect(order.slice(-2)).toEqual(['retire','cleanup']);
  if(step==='upload') expect(ops.commit).not.toHaveBeenCalled();
});
it('does not report a saved photo as failed when deletion needs retrying', async () => {
  const {ops}=fixture(); ops.cleanup.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(replacePhoto(png,'image/png',ops)).resolves.toEqual({saved:true,cleanupPending:true});
  expect(ops.retire).not.toHaveBeenCalled();
});
it('rejects mismatched signatures, unsupported MIME types, empty and oversize uploads before reserve', async () => {
  const {ops}=fixture();
  expect(()=>imageExtension(png,'image/jpeg')).toThrow('valid');
  expect(()=>imageExtension(png,'image/svg+xml')).toThrow('valid');
  await expect(replacePhoto(new Uint8Array(),'image/png',ops)).rejects.toThrow('8 MB');
  await expect(replacePhoto(new Uint8Array(MAX_PHOTO_BYTES+1),'image/png',ops)).rejects.toThrow('8 MB');
  expect(ops.reserve).not.toHaveBeenCalled();
});

it.each([5 * 1024 * 1024 + 1, 8 * 1024 * 1024])('accepts a %i-byte photo in both client and replacement validation', async size => {
  const bytes = new Uint8Array(size); bytes.set(png);
  expect(photoError(new File([bytes], 'dog.png', { type: 'image/png' }))).toBeNull();
  const { ops } = fixture();
  await expect(replacePhoto(bytes, 'image/png', ops)).resolves.toEqual({ saved: true, cleanupPending: false });
});
it('rejects photos above 8 MB in the client', () => {
  expect(photoError(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'dog.png', { type: 'image/png' }))).toBe('Photos must be 8 MB or smaller.');
});
