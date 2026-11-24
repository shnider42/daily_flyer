// Complete human performances from Kenney's CC0 Voiceover Pack.
// Male voice: Jeffrey M. Smith. See audio/CREDITS.txt and tools/prepare-squad-voice.py.
// Full bandwidth; local/radio filtering belongs to the live audio graph.
import { FIELD_RADIO_LINES } from './field-radio-lines.mjs';
export const VOICE_SAMPLE_FILES = Object.freeze({ squadVoice: 'squad-voice-bank.wav', fieldRadio: 'field-radio-bank.wav' });
export const VOICE_LINES = Object.freeze([...[
  {
    "id": "go",
    "sample": "squadVoice",
    "offset": 0.0,
    "duration": 0.6509297052154195,
    "text": "Go!",
    "categories": [
      "move"
    ]
  },
  {
    "id": "hurry-up",
    "sample": "squadVoice",
    "offset": 0.7509297052154195,
    "duration": 0.6763265306122449,
    "text": "Hurry up!",
    "categories": [
      "move"
    ]
  },
  {
    "id": "go-go-go",
    "sample": "squadVoice",
    "offset": 1.5272562358276645,
    "duration": 0.984625850340136,
    "text": "Go, go, go!",
    "categories": [
      "move",
      "smoke"
    ]
  },
  {
    "id": "hold",
    "sample": "squadVoice",
    "offset": 2.6118820861678005,
    "duration": 0.6946031746031746,
    "text": "Hold!",
    "categories": [
      "hold"
    ]
  },
  {
    "id": "watch-my-back",
    "sample": "squadVoice",
    "offset": 3.406485260770975,
    "duration": 0.9594557823129252,
    "text": "Watch my back!",
    "categories": [
      "cover"
    ]
  },
  {
    "id": "cover-me",
    "sample": "squadVoice",
    "offset": 4.4659410430839,
    "duration": 0.6023582766439909,
    "text": "Cover me!",
    "categories": [
      "cover"
    ]
  },
  {
    "id": "look-out",
    "sample": "squadVoice",
    "offset": 5.1682993197278915,
    "duration": 0.6076190476190476,
    "text": "Look out!",
    "categories": [
      "warning",
      "flash"
    ]
  },
  {
    "id": "get-down",
    "sample": "squadVoice",
    "offset": 5.875918367346939,
    "duration": 0.8536961451247166,
    "text": "Get down!",
    "categories": [
      "warning",
      "flash"
    ]
  },
  {
    "id": "reloading",
    "sample": "squadVoice",
    "offset": 6.829614512471656,
    "duration": 0.9219954648526077,
    "text": "Reloading!",
    "categories": [
      "reload"
    ]
  },
  {
    "id": "medic",
    "sample": "squadVoice",
    "offset": 7.851609977324263,
    "duration": 0.6668480725623582,
    "text": "Medic!",
    "categories": [
      "help"
    ]
  },
  {
    "id": "suppressing-fire",
    "sample": "squadVoice",
    "offset": 8.618458049886621,
    "duration": 1.2361451247165534,
    "text": "Suppressing fire!",
    "categories": [
      "suppression"
    ]
  },
  {
    "id": "fire-in-the-hole",
    "sample": "squadVoice",
    "offset": 9.954603174603175,
    "duration": 1.3806349206349207,
    "text": "Fire in the hole!",
    "categories": [
      "frag"
    ]
  },
  {
    "id": "target-engaged",
    "sample": "squadVoice",
    "offset": 11.435238095238095,
    "duration": 1.1206802721088436,
    "text": "Target engaged!",
    "categories": [
      "contact"
    ]
  },
  {
    "id": "sniper",
    "sample": "squadVoice",
    "offset": 12.655918367346938,
    "duration": 0.8180952380952381,
    "text": "Sniper!",
    "categories": [
      "sniper"
    ]
  },
  {
    "id": "call-for-backup",
    "sample": "squadVoice",
    "offset": 13.574013605442177,
    "duration": 1.0323809523809524,
    "text": "Call for backup!",
    "categories": [
      "backup"
    ]
  }
], ...FIELD_RADIO_LINES].map(line => Object.freeze({ ...line, categories: Object.freeze(line.categories) })));
