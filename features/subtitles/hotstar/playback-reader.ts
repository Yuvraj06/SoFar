import type { PlaybackInfo } from '../../../shared/messages';

// Runs on the Hotstar page. Reads the <video> element.
export function readPlayback(): PlaybackInfo | null {
  const videos = Array.from(document.querySelectorAll('video'));
  // Prefer a video that has loaded (has a real duration).
  const video = videos.find((v) => Number.isFinite(v.duration) && v.duration > 0) ?? videos[0];
  if (!video) return null;
  return {
    currentTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    pageTitle: document.title,
  };
}
