// Finds the English subtitle file inside a DASH manifest (.mpd).

// Text of a direct child <BaseURL> of this element, if any.
function baseUrlOf(el: Element): string | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === 'BaseURL') return child.textContent?.trim() || null;
  }
  return null;
}

export function findSubtitleUrl(mpd: Document, mpdUrl: string): string | null {
  const sets = Array.from(mpd.getElementsByTagName('AdaptationSet'));
  const textSet = sets.find((set) => {
    const isText = set.getAttribute('mimeType') === 'text/vtt' || set.getAttribute('contentType') === 'text';
    const lang = (set.getAttribute('lang') ?? '').toLowerCase();
    return isText && lang.startsWith('en');
  });
  if (!textSet) return null;

  const representation = textSet.getElementsByTagName('Representation')[0];
  // Each BaseURL is resolved against the one above it, starting at the .mpd URL.
  const chain: Element[] = [];
  for (let el: Element | null = representation ?? textSet; el; el = el.parentElement) chain.unshift(el);

  let url = new URL(mpdUrl);
  for (const el of chain) {
    const base = baseUrlOf(el);
    if (base) url = new URL(base, url);
  }
  // Relative resolving drops the query string, so put the token back.
  if (!url.search) url.search = new URL(mpdUrl).search;
  return url.href;
}
