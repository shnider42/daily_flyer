/* A saved publication timestamp, never the visitor's clock. */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HLLVFreshness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !validDay(value.slice(0,10))) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,19) === value.slice(0,19) ? d : null;
  }
  function describe(data) {
    const d = timestamp(data && data.page_updated_at);
    if (d) return {datetime:data.page_updated_at, label:d.toLocaleString('en-US', {month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short', timeZone:'America/New_York'}), precise:true};
    if (validDay(data && data.generated_at)) return {datetime:data.generated_at, label:new Date(data.generated_at+'T00:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})+' (time not recorded)', precise:false};
    return {datetime:'',label:'Not available',precise:false};
  }
  function render(data, doc) {
    const target = (doc || document).getElementById('pageLastUpdated');
    if (!target) return;
    const result = describe(data);
    target.textContent = result.label;
    if (result.datetime) target.setAttribute('datetime',result.datetime);
    else target.removeAttribute('datetime');
  }
  return Object.freeze({describe,render,timestamp,validDay});
});
