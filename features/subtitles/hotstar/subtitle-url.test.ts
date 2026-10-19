// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findSubtitleUrl } from './subtitle-url';

const mpdUrl = 'https://ak-mediavod.hotstar.com/videos/abc/master.mpd?hdnea=TOKEN';

const xml = (extra = '') => `<?xml version="1.0"?>
<MPD>
  <Period>
    <BaseURL>dash/</BaseURL>
    <AdaptationSet contentType="video" mimeType="video/mp4"><Representation id="v"/></AdaptationSet>
    ${extra || `<AdaptationSet contentType="text" mimeType="text/vtt" lang="en">
      <Representation id="s"><BaseURL>../subtitle.vtt</BaseURL></Representation>
    </AdaptationSet>`}
  </Period>
</MPD>`;

const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

describe('findSubtitleUrl', () => {
  it('resolves chained BaseURLs and keeps the token', () => {
    expect(findSubtitleUrl(parse(xml()), mpdUrl)).toBe(
      'https://ak-mediavod.hotstar.com/videos/abc/subtitle.vtt?hdnea=TOKEN',
    );
  });
  it('returns null when there is no English subtitle', () => {
    const hindi = `<AdaptationSet contentType="text" mimeType="text/vtt" lang="hi">
      <Representation id="s"><BaseURL>hi.vtt</BaseURL></Representation></AdaptationSet>`;
    expect(findSubtitleUrl(parse(xml(hindi)), mpdUrl)).toBeNull();
  });
});
