import { CHAPTERS, DIFFICULTIES } from './catalog.mjs';
import { freshProfile, normalizeProfile, bank } from './core.mjs';

import {emptyWatch} from './deck.mjs';
function readWatch(raw={}) {
  const result=emptyWatch();
  for(const key of Object.keys(result))result[key]=Math.max(0,Math.floor(Number(raw?.[key])||0));
  return result;
}
export const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
export function newId() {
  return [...globalThis.crypto.getRandomValues(new Uint8Array(12))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function charterInfo(raw) {
  if (!raw || !validId(raw.id)) return null;
  return {
    id: raw.id,
    name: String(raw.name || 'Lantern Company').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,36) || 'Lantern Company',
    chapter: Math.max(0, Math.min(CHAPTERS.length, Math.floor(Number(raw.chapter) || 0))),
    difficulty: Object.hasOwn(DIFFICULTIES,raw.difficulty) ? raw.difficulty : 'normal',
  };
}
// Only progress tagged for this pirate AND this charter may supply a loadout.
export function crewLoadout(envelope, charter, pirate) {
  if (!envelope || envelope.campaignId !== charter.id || envelope.pirateId !== pirate) return freshProfile();
  return normalizeProfile(envelope.profile || {});
}

export class CampaignLog {
  constructor(storage) {
    this.storage = storage;
    this.memory = new Map();
    this.temporary = false;
    this.pirateId = this.read('saltbound.pirate.v1');
    if (!validId(this.pirateId)) {
      this.pirateId = newId();
      this.write('saltbound.pirate.v1',this.pirateId);
    }
    this.prefix = 'saltbound.crew.v1.' + this.pirateId + '.';
  }
  read(key) {
    try { return JSON.parse(this.storage.getItem(key)) ?? this.memory.get(key); }
    catch { this.temporary=true; return this.memory.get(key); }
  }
  write(key,value) {
    this.memory.set(key,value);
    try { this.storage.setItem(key,JSON.stringify(value)); }
    catch { this.temporary=true; }
  }
  list() {
    const ids=this.read(this.prefix+'index');
    return (Array.isArray(ids)?ids:[]).filter(validId).map(id=>this.get(id)).filter(Boolean);
  }
  get(id) {
    if (!validId(id)) return null;
    const entry=this.read(this.prefix+id);
    if (!entry || entry.pirateId!==this.pirateId || entry.charter?.id!==id) return null;
    return {pirateId:this.pirateId,charter:charterInfo(entry.charter),profile:normalizeProfile(entry.profile),watch:readWatch(entry.watch)};
  }
  remember(raw) {
    const charter=charterInfo(raw);
    if (!charter) throw Error('Invalid campaign charter.');
    const entry=this.get(charter.id) || {pirateId:this.pirateId,profile:freshProfile(),watch:emptyWatch()};
    charter.chapter=Math.max(charter.chapter,entry.charter?.chapter || 0);
    entry.charter=charter;
    this.write(this.prefix+charter.id,entry);
    const ids=this.read(this.prefix+'index') || [];
    if (!ids.includes(charter.id)) this.write(this.prefix+'index',[charter.id,...ids]);
    return entry;
  }
  create(name,difficulty) { return this.remember({id:newId(),name,difficulty,chapter:0}); }
  envelope(id) {
    return {pirateId:this.pirateId,campaignId:id,profile:this.get(id)?.profile || freshProfile()};
  }
  storeProfile(id, profile) {
    const entry=this.get(id);
    if (!entry) throw Error('Campaign is missing from the captain’s log.');
    entry.profile=normalizeProfile(profile);
    this.write(this.prefix+id,entry);
  }
  settle(raw,receipt,watch) {
    if (!receipt || !validId(raw?.id) || raw.id!==receipt.campaignId) return false;
    const entry=this.get(raw.id),charter=charterInfo(raw);
    if (!entry || !charter || !bank(entry.profile,receipt)) return false;
    charter.chapter=Math.max(charter.chapter,entry.charter.chapter);
    entry.charter=charter;
    // One browser write commits the wallet, chapter, watch and duplicate receipt together.
    const tally=readWatch(watch);
    for(const key of Object.keys(tally))entry.watch[key]+=tally[key];
    this.write(this.prefix+raw.id,entry);
    return true;
  }
}
