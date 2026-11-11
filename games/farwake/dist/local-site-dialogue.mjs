/** Read authored acknowledgements of actual local choices; no simulated aftermath. */
const own = (value, key) => value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key) ? value[key] : undefined;
const text = (value, max = 420) => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';
const id = value => {
  const result = text(value, 160);
  return result && !['__proto__', 'constructor', 'prototype'].includes(result) ? result : '';
};

/**
 * data.localSiteResponses contains {bodyId,siteId,choiceId,options:{id:{greeting}}}.
 * Current encounter state wins over a saved copy. Even a matching remembered
 * choice is insufficient if captain and speaker are elsewhere.
 */
export function localSiteResponse(state, entity) {
  if (own(state, 'mode') !== 'person') return null;
  const data = own(entity, 'data'), rules = own(data, 'localSiteResponses');
  if (!Array.isArray(rules)) return null;
  const active = own(state, 'exploration'), interior = own(state, 'interior'), location = own(interior, 'location');
  const bodyId = id(own(active, 'bodyId')) || id(own(location, 'parentId'));
  const siteId = id(own(active, 'siteId')) || id(own(location, 'siteId'));
  const systemId = id(own(state, 'systemId'));
  if (!bodyId || !siteId || !systemId || id(own(data, 'bodyId')) !== bodyId || id(own(data, 'siteId')) !== siteId) return null;
  const siteKey = `${bodyId}:site:${siteId}`, recordKey = `${systemId}:${bodyId}:${siteId}`;
  if (own(state, 'locationId') !== siteKey) return null;
  let encounter;
  if (active !== undefined && active !== null) {
    if (own(active, 'key') !== recordKey || own(active, 'bodyId') !== bodyId || own(active, 'siteId') !== siteId) return null;
    encounter = own(active, 'encounter');
  } else {
    if (own(interior, 'kind') !== 'site' || own(location, 'id') !== siteKey) return null;
    encounter = own(own(state, 'explorationRecords'), recordKey);
  }
  if (own(encounter, 'id') !== siteKey) return null;
  const choices = own(encounter, 'choices');
  for (const rule of rules.slice(0, 8)) {
    if (own(rule, 'bodyId') !== bodyId || own(rule, 'siteId') !== siteId) continue;
    const choiceId = id(own(rule, 'choiceId')), selected = id(own(choices, choiceId));
    if (!choiceId || !selected) continue;
    const response = own(own(rule, 'options'), selected), greeting = text(own(response, 'greeting'));
    if (!greeting) continue;
    const rumor = text(own(response, 'rumor'));
    return { context: 'local-choice', greeting, ...(rumor ? { rumor } : {}) };
  }
  return null;
}
