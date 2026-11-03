import { photoError } from './model';

/** Resize before transport, preserving orientation and transparency. */
export async function preparePhoto(file: File): Promise<File> {
  const error = photoError(file);
  if (error) throw new Error(error);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Image encoding failed')), 'image/webp', 0.78));
    // Unsupported WebP encoders return PNG. Use the encoder's actual MIME type.
    if (blob.size >= file.size && scale === 1) return file;
    const extension = blob.type === 'image/webp' ? 'webp' : 'png';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type: blob.type });
  } catch {
    throw new Error('This photo could not be prepared. Please choose another JPG, PNG or WebP photo.');
  } finally {
    bitmap?.close();
  }
}
