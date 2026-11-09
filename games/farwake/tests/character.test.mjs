import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_TRAITS, DEFAULT_APPEARANCE, SKIN_TONES, SUIT_COLORS, HAIR_COLORS, HAIR_STYLES,
  normalizeAppearance, normalizeCharacter, characterModifiers, appearancePalette, drawCaptainPortrait
} from '../dist/character.mjs';

const baseline = { walkSpeed:1,maxHealth:1,sidearmDamage:1,sidearmCooldown:1,mining:1,jobRewards:1,serviceCost:1 };

test('old captains and malformed character data retain baseline rules and valid cosmetics',()=>{
  for(const value of [undefined,null,false,42,'captain',[],{traits:'hot_cell'},{appearance:null}]) {
    assert.deepEqual(normalizeCharacter(value),{appearance:{...DEFAULT_APPEARANCE},traits:[]});
    assert.deepEqual(characterModifiers(value),baseline);
  }
  const raw={appearance:{skin:'copper',suit:'rust',hair:'silver',style:'swept'},traits:['long_stride'],characterLocked:false,credits:9000};
  const normalized=normalizeCharacter(raw);
  assert.deepEqual(normalized,{appearance:{skin:'copper',suit:'rust',hair:'silver',style:'swept'},traits:['long_stride']});
  normalized.appearance.skin='pale';normalized.traits.push('hot_cell');
  assert.equal(raw.appearance.skin,'copper');assert.deepEqual(raw.traits,['long_stride']);
});

test('appearance admits palette IDs only and has no effect on character statistics',()=>{
  assert.deepEqual(normalizeAppearance({skin:'#ffffff',suit:'url(https://example.invalid)',hair:'<script>',style:'unknown'}),DEFAULT_APPEARANCE);
  for(const skin of SKIN_TONES)for(const suit of SUIT_COLORS)for(const hair of HAIR_COLORS)for(const style of HAIR_STYLES) {
    const appearance={skin:skin.id,suit:suit.id,hair:hair.id,style:style.id};
    assert.deepEqual(appearancePalette(appearance),{skin:skin.color,suit:suit.color,hair:hair.color,style:style.id,accent:suit.accent});
    assert.deepEqual(characterModifiers({appearance,traits:[]}),baseline);
  }
});

test('trait normalization rejects fabricated benefits, duplicates, and more than two choices',()=>{
  const raw={traits:['invented',null,'hot_cell','hot_cell',{id:'bulkhead_born'},'quick_hands','belt_born'],modifiers:{maxHealth:1000}};
  assert.deepEqual(normalizeCharacter(raw).traits,['hot_cell','quick_hands']);
  assert.deepEqual(characterModifiers(raw),{...baseline,sidearmDamage:1.0625,sidearmCooldown:1.04});
  assert.deepEqual(characterModifiers({traits:['long_stride','long_stride','bulkhead_born']}),{...baseline,walkSpeed:1.012,maxHealth:1.02});
  assert.deepEqual(raw.traits,['invented',null,'hot_cell','hot_cell',{id:'bulkhead_born'},'quick_hands','belt_born']);
});

test('every advertised trait has a real bounded benefit and cost, including paired effects',()=>{
  assert.equal(CHARACTER_TRAITS.length,6);
  const lowerIsBetter=new Set(['sidearmCooldown','serviceCost']);
  for(const trait of CHARACTER_TRAITS) {
    assert.ok(trait.benefit&&trait.cost);
    const effects=Object.entries(trait.modifiers);
    assert.ok(effects.some(([key,value])=>lowerIsBetter.has(key)?value<1:value>1),trait.id+' needs a benefit');
    assert.ok(effects.some(([key,value])=>lowerIsBetter.has(key)?value>1:value<1),trait.id+' needs a cost');
    assert.ok(Object.isFrozen(trait)&&Object.isFrozen(trait.modifiers));
    for(const other of CHARACTER_TRAITS)for(const value of Object.values(characterModifiers({traits:[trait.id,other.id]}))) {
      assert.ok(Number.isFinite(value)&&value>=.65&&value<=1.5,trait.id+' + '+other.id);
    }
  }
  assert.deepEqual(characterModifiers({traits:['belt_born','port_regular']}),{...baseline,mining:1.0625,jobRewards:.9,serviceCost:.85});
});

test('pixel portraits render each style with integer geometry and without changing identity',()=>{
  const calls=[],ctx={save(){},restore(){},fillRect(...rect){calls.push({color:this.fillStyle,rect});},imageSmoothingEnabled:true};
  for(const style of HAIR_STYLES) {
    calls.length=0;
    const appearance={skin:'deep',suit:'moss',hair:'silver',style:style.id},before=structuredClone(appearance);
    const bounds=drawCaptainPortrait(ctx,appearance,{x:.4,y:10.8,size:105});
    assert.deepEqual(bounds,{x:5,y:15,width:96,height:96,pixelSize:3});
    assert.equal(ctx.imageSmoothingEnabled,false);
    assert.ok(calls.length>25);
    assert.ok(calls.every(({rect})=>rect.every(Number.isInteger)));
    assert.ok(calls.some(({color})=>color===appearancePalette(appearance).skin));
    assert.ok(calls.some(({color})=>color===appearancePalette(appearance).suit));
    assert.deepEqual(appearance,before);
  }
});
