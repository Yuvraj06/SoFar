import { describe, expect, it } from 'vitest';
import { parseTitle } from './title';

describe('parseTitle', () => {
  it('parses show, season and episode', () => {
    expect(parseTitle('Watch The Office S5 Episode 19 on JioHotstar')).toEqual({
      name: 'The Office',
      season: 5,
      episode: 19,
    });
  });
  it('parses a movie', () => {
    expect(parseTitle('Watch Some Movie Online on JioHotstar')).toEqual({ name: 'Some Movie' });
  });
  it('leaves unknown titles alone', () => {
    expect(parseTitle('Something')).toEqual({ name: 'Something' });
  });
});
