export const MAX_IMAGE_DIMENSION = 1600;
/** The upload route's limit (docs/frontend.md "IPFS upload"). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export class ImageError extends Error {
  override name = "ImageError";
}

/** Scales `w × h` down (never up) so the longest side is at most `max`. */
export function fitWithin(w: number, h: number, max = MAX_IMAGE_DIMENSION): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Gets a picked file ready to upload: longest side at most 1600 px (drawn through a canvas),
 * re-encoded as WebP (JPEG where WebP isn't supported) and squeezed under 4 MB. Files that are
 * already small enough are kept as they are, so a GIF keeps its animation.
 */
export async function prepareImage(file: File, max = MAX_IMAGE_DIMENSION): Promise<Blob> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageError("Use a PNG, JPEG, WebP or GIF image.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That image couldn't be read. Try a different file.");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const unchanged = width === bitmap.width && height === bitmap.height;
    if (unchanged && file.size <= MAX_IMAGE_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("This browser can't resize images. Try a smaller file.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.86, 0.72, 0.58, 0.45]) {
      const blob = await toBlob(canvas, "image/webp", quality);
      if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
    throw new ImageError("That image is too large even after shrinking it. Try a different one.");
  } finally {
    bitmap.close();
  }
}
