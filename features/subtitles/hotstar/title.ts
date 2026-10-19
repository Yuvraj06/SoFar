export type ParsedTitle = {
  name: string;
  season?: number;
  episode?: number;
};

// "Watch The Office S5 Episode 19 on JioHotstar" -> { name: "The Office", season: 5, episode: 19 }
export function parseTitle(pageTitle: string): ParsedTitle {
  let text = pageTitle
    .replace(/^Watch\s+/i, '')
    .replace(/\s+on\s+(Jio\s?Hotstar|Disney\+?\s*Hotstar|Hotstar).*$/i, '')
    .trim();

  const match = text.match(/^(.*?)\s+S(\d+)\s+(?:Episode|E)\s*(\d+)\b/i);
  if (match) {
    return { name: (match[1] ?? '').trim(), season: Number(match[2]), episode: Number(match[3]) };
  }
  text = text.replace(/\s+Online$/i, '');
  return { name: text };
}

// { name: "The Office", season: 5, episode: 19 } -> "The Office S5 E19"
export function formatTitle(t: ParsedTitle): string {
  if (t.season === undefined) return t.name;
  return t.episode === undefined ? `${t.name} S${t.season}` : `${t.name} S${t.season} E${t.episode}`;
}
