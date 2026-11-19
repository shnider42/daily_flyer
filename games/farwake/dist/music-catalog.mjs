import { MUSIC_CUES as COMPOSED_CUES } from './music-score.mjs';
import { MENU_THEME, RECORDED_MUSIC } from './recorded-theme.mjs';

// Keep the original compositions available for listening and voyage music.
export const THEME_ID = MENU_THEME.id;
export const MUSIC_CUES = Object.freeze([...RECORDED_MUSIC.map(({ cue }) => cue), ...COMPOSED_CUES]);
