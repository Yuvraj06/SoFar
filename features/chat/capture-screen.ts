import type { ChatImage } from '../ai/types';

export type CaptureResult =
  | { ok: true; image: ChatImage }
  | { ok: false; reason: 'black' | 'failed' };

// Average brightness of RGBA pixels (0 to 255). Sampled, so it stays fast.
export function averageBrightness(rgba: Uint8ClampedArray, step = 16): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4 * step) {
    total += ((rgba[i] ?? 0) + (rgba[i + 1] ?? 0) + (rgba[i + 2] ?? 0)) / 3;
    count++;
  }
  return count === 0 ? 0 : total / count;
}

// Protected (DRM) video can come out as a black rectangle. We detect that.
export function isMostlyBlack(rgba: Uint8ClampedArray): boolean {
  return averageBrightness(rgba) < 6;
}

const MAX_WIDTH = 768; // smaller image = faster and cheaper

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

// Takes a picture of the visible tab. Runs in the side panel.
// It only sees the CURRENT moment, so it cannot spoil anything.
export async function captureScreen(): Promise<CaptureResult> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId === undefined) return { ok: false, reason: 'failed' };
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });

    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_WIDTH / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'failed' };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (isMostlyBlack(ctx.getImageData(0, 0, canvas.width, canvas.height).data)) {
      return { ok: false, reason: 'black' };
    }
    const data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? '';
    return data ? { ok: true, image: { mimeType: 'image/jpeg', data } } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
