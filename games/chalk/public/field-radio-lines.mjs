// Human radio performances by VoiceBosch, adapted under CC BY-SA 4.0.
// This catalog and field-radio-bank.wav retain CC BY-SA 4.0. See audio/CREDITS.txt.
export const FIELD_RADIO_LINES = Object.freeze([
  {
    "id": "dispatch-six",
    "sample": "fieldRadio",
    "offset": 0.0,
    "duration": 2.5653061224489795,
    "text": "Watch your six.",
    "categories": [
      "dispatch_six"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-sniper",
    "sample": "fieldRadio",
    "offset": 2.6853061224489796,
    "duration": 2.7151020408163267,
    "text": "Take out that sniper.",
    "categories": [
      "dispatch_sniper"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-extraction",
    "sample": "fieldRadio",
    "offset": 5.520408163265306,
    "duration": 2.7829478458049888,
    "text": "Get to the extraction point.",
    "categories": [
      "dispatch_extraction"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-ammo",
    "sample": "fieldRadio",
    "offset": 8.423356009070295,
    "duration": 2.2323356009070294,
    "text": "Watch your ammo.",
    "categories": [
      "dispatch_ammo"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-recovered",
    "sample": "fieldRadio",
    "offset": 10.775691609977324,
    "duration": 2.2993197278911564,
    "text": "Good work, soldier.",
    "categories": [
      "dispatch_recovered"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-moving",
    "sample": "fieldRadio",
    "offset": 13.19501133786848,
    "duration": 2.346530612244898,
    "text": "Enemy on the move.",
    "categories": [
      "dispatch_moving"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-perimeter",
    "sample": "fieldRadio",
    "offset": 15.661541950113378,
    "duration": 2.5606802721088435,
    "text": "Secure the perimeter.",
    "categories": [
      "dispatch_perimeter"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-hold",
    "sample": "fieldRadio",
    "offset": 18.342222222222222,
    "duration": 2.315419501133787,
    "text": "Hold your position.",
    "categories": [
      "dispatch_hold"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-attack",
    "sample": "fieldRadio",
    "offset": 20.77764172335601,
    "duration": 2.3435374149659864,
    "text": "We're under attack.",
    "categories": [
      "dispatch_attack"
    ],
    "radioOnly": true
  },
  {
    "id": "dispatch-arrival",
    "sample": "fieldRadio",
    "offset": 23.241179138321996,
    "duration": 2.790294784580499,
    "text": "Entering hostile territory.",
    "categories": [
      "dispatch_arrival"
    ],
    "radioOnly": true
  }
].map(line => Object.freeze({ ...line, categories: Object.freeze(line.categories) })));
