/* Source context v1. Presentation of stored evidence, not a credibility classifier.
 * Pure functions: never mutate the dataset, issue status, or review dates.
 * Common source roles describe what a record can support, not whether it is true.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HLLVEvidence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const profiles = Object.freeze({
    'patch notes': {
      key: 'release', label: 'Official release note', speaker: 'Publisher / development team',
      strength: 'Strong for the publisher record',
      limit: 'A changelog establishes what the publisher documented. It does not independently prove that a fix worked for every affected player, or that a similar incident had the same cause.'
    },
    'official update': {
      key: 'official', label: 'Official update', speaker: 'Publisher / development team',
      strength: 'Strong for the stated position',
      limit: 'An acknowledgment, candidate fix, future target or early improvement report is not independent proof of a released and effective resolution.'
    },
    'official known issues': {
      key: 'known', label: 'Official known issue', speaker: 'Publisher / development team',
      strength: 'Strong for historical acknowledgment',
      limit: 'A historical known-issues list does not establish whether the issue still occurs on the current build, or whether a later fix worked.'
    },
    'support thread': {
      key: 'support', label: 'Support acknowledgment', speaker: 'Team17 Support and reporting players',
      strength: 'Moderate · acknowledgment, not reproduction',
      limit: 'Receiving or escalating a report is not developer reproduction, a confirmed technical cause or a shipped fix. A platform developer badge does not turn a support reply into engineering sign-off.'
    },
    'player report': {
      key: 'player', label: 'Player observation', speaker: 'Reporting player(s)',
      strength: 'Preliminary · reported symptoms',
      limit: 'A report does not establish prevalence, a shared root cause or failure of a previous fix. A linked screenshot or recording is not an independent reproduction.'
    },
    'developer AMA': {
      key: 'ama', label: 'Developer Q&A', speaker: 'The cited official answer; not every comment',
      strength: 'Scoped to the cited developer answer',
      limit: 'Only identified official replies support developer statements. Questions and ordinary comments do not inherit that authority; a possible explanation remains a hypothesis.'
    },
    plan: {
      key: 'plan', label: 'Official plan', speaker: 'Publisher / development team',
      strength: 'Strong for the announced intention',
      limit: 'A planned fix or release window does not prove the change shipped, passed final testing or resolved the issue. Issue-specific scope cannot be inferred from a general scheduling announcement.'
    },
    hypothesis: {
      key: 'hypothesis', label: 'Developer hypothesis', speaker: 'The cited developer answer',
      strength: 'Provisional · possible explanation',
      limit: 'A developer discussing a possible contributing factor is not confirmation of a root cause. Other comments in the same thread are separate claims.'
    },
    unknown: {
      key: 'unknown', label: 'Unassessed source', speaker: 'Not classified in this record',
      strength: 'Needs assessment',
      limit: 'The source role and evidentiary scope have not been assessed. No acknowledgment, reproduction, root cause or effective fix should be inferred from the link alone.'
    }
  });
  // Explicit claim-level exceptions from the existing ledger. No keyword-based
  // upgrading of a report, and no domain-based or numeric trust scoring.
  const plans = new Set([
    'HLLV-017|hllv-patch-1-3', 'HLLV-018|hllv-patch-1-2',
    'HLLV-019|hllv-patch-1-2', 'HLLV-020|hllv-patch-1-2',
    'HLLV-025|hllv-patch-1-2', 'HLLV-027|hllv-patch-1-2',
    'HLLV-058|community-update-5', 'HLLV-058|community-update-6',
    'HLLV-059|community-update-6', 'HLLV-060|community-update-5',
    'HLLV-061|community-update-6', 'HLLV-063|community-update-6',
    'HLLV-034|community-update-6', 'HLLV-006|community-update-6'
  ]);
  // Known underspecified legacy descriptions. Flag gaps, do not fabricate a quote
  // or copy the latest issue summary onto a different, older source.
  const topicOnly = new Set([
    'documents the issue and stated status', 'publisher documents this issue and its stated status',
    'the linked official evidence documents this issue', 'documented in the linked official release',
    'stability monitoring', 'stability, memory and pc guidance', 'voip reliability',
    'silent muting', 'voip follow-up', 'server degradation', 'server browser filters',
    'server browser ordering', 'aim assist', 'console visuals and hdr guidance'
  ]);
  const text = value => typeof value === 'string' ? value.trim() : '';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'}[ch]));
  function safeURL(value) {
    try {
      const url = new URL(text(value));
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function dateLabel(value) {
    return validDate(value) ? new Date(value + 'T00:00:00Z').toLocaleDateString('en-US',
      {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}) : 'Not separately recorded';
  }
  function references(issue) {
    return issue && Array.isArray(issue.sources) ? issue.sources.filter(s => s && typeof s === 'object') : [];
  }
  function counts(issue) {
    const refs = references(issue);
    const urls = refs.map(s => {
      const raw = safeURL(s.url);
      if (!raw) return '';
      const url = new URL(raw);
      url.hash = '';
      url.pathname = url.pathname.replace(/\/$/, '') || '/';
      return url.href;
    }).filter(Boolean);
    return {references: refs.length, urls: new Set(urls).size};
  }
  function sourceProfile(issue, source) {
    const url = safeURL(source.url);
    const slug = url ? new URL(url).pathname.replace(/\/$/, '').split('/').pop() : '';
    if (slug === '676259427855107286' || plans.has(text(issue && issue.id) + '|' + slug)) return profiles.plan;
    if (issue && issue.id === 'HLLV-001' && source.type === 'developer AMA') return profiles.hypothesis;
    return Object.prototype.hasOwnProperty.call(profiles, source.type) ? profiles[source.type] : profiles.unknown;
  }
  function claimNeedsDetail(source) {
    const claim = text(source.claim).toLowerCase().replace(/[.\s]+$/, '');
    return !claim || topicOnly.has(claim);
  }
  // Optional future schema. A bare 'verified' flag, link check, publisher badge,
  // issue status, or review date can never manufacture independent verification.
  function outcome(source) {
    const record = source && source.outcome_verification;
    if (!record || record.independent !== true || !validDate(record.date) ||
        !safeURL(record.url) || !text(record.method) || !text(record.scope) ||
        !['verified', 'not_resolved', 'mixed'].includes(record.result)) return null;
    return record;
  }
  function assessment(issue, source) {
    const profile = sourceProfile(issue, source);
    const needsDetail = claimNeedsDetail(source);
    return {profile, needsDetail, claim: text(source.claim) || 'No precise claim is recorded.',
      strength: needsDetail ? 'Claim needs detail' : profile.strength,
      limit: (needsDetail ? 'This reference names a topic rather than a precise supporting statement. It needs source-level review before it can carry a stronger conclusion. ' : '') + profile.limit,
      outcome: outcome(source)};
  }
  function outcomeHTML(record) {
    if (!record) return '<p class="evidence-outcome"><strong>Independent outcome check:</strong> Not recorded.</p>';
    const labels = {verified:'A scoped check is recorded', not_resolved:'A check still found the problem', mixed:'Mixed results were recorded'};
    return `<div class="evidence-outcome"><p><strong>Independent outcome check:</strong> ${esc(labels[record.result])} · ${esc(dateLabel(record.date))}</p><p>${esc(record.scope)} — ${esc(record.method)}</p><a href="${esc(safeURL(record.url))}" target="_blank" rel="noopener noreferrer">Read outcome evidence ↗</a><p>This applies to the recorded test conditions, not every affected player.</p></div>`;
  }
  function renderSummary(issue) {
    const refs = references(issue), n = counts(issue);
    const hasOutcome = refs.some(s => outcome(s));
    return `<aside class="evidence-summary" aria-label="Evidence behind this status"><div><span class="evidence-kicker">Evidence behind this status</span><p>${n.urls} distinct source ${n.urls === 1 ? 'URL' : 'URLs'} · ${n.references} linked ${n.references === 1 ? 'reference' : 'references'}</p><p class="evidence-muted">${hasOutcome ? 'Outcome evidence is linked; inspect its scope and result.' : 'Independent outcome check: not recorded.'}</p></div><button class="evidence-inspect" type="button" data-tab="sources">Inspect evidence <span aria-hidden="true">→</span></button></aside>`;
  }
  function renderSource(issue, source) {
    const a = assessment(issue, source), url = safeURL(source.url), title = text(source.title) || 'Untitled source';
    const sourceDate = validDate(source.date) ? `<time datetime="${esc(source.date)}">${esc(dateLabel(source.date))}</time>` : 'Date not recorded';
    const link = url ? `<a class="evidence-open" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Read source: ${esc(title)}">Read source <span aria-hidden="true">↗</span></a>` : '<span class="evidence-muted">Link unavailable</span>';
    return `<article class="evidence-source" data-evidence-role="${esc(a.profile.key)}"><div class="evidence-source-head"><div><div class="evidence-tags"><span class="evidence-role">${esc(a.profile.label)}</span><span class="evidence-strength${a.needsDetail ? ' evidence-gap' : ''}">${esc(a.strength)}</span></div><h3>${esc(title)}</h3><p class="evidence-byline">${esc(text(source.publisher) || 'Publisher not recorded')} · Evidence dated ${sourceDate}</p></div>${link}</div><p class="evidence-claim"><strong>${a.needsDetail ? 'Recorded claim — needs detail' : 'Supports (recorded)'}:</strong> ${esc(a.claim)}</p><details class="evidence-limits"><summary>Limits &amp; verification <span class="evidence-detail-hint">${a.outcome ? 'Outcome evidence linked' : 'Outcome not independently checked here'}</span></summary><div class="evidence-detail-body"><p class="evidence-limit"><strong>Does not prove:</strong> ${esc(a.limit)}</p>${outcomeHTML(a.outcome)}<dl class="evidence-provenance"><div><dt>Who is speaking</dt><dd>${esc(a.profile.speaker)}</dd></div><div><dt>Publication date</dt><dd>${esc(dateLabel(source.source_published_at))}</dd></div><div><dt>Full source review date</dt><dd>${esc(dateLabel(source.source_reviewed_at))}</dd></div><div><dt>Issue record reviewed</dt><dd>${esc(dateLabel(issue && issue.last_reviewed))}</dd></div><div><dt>Link last checked</dt><dd>${esc(dateLabel(source.link_checked_at))}${validDate(source.link_checked_at) ? ' · accessibility only, not claim validation' : ''}</dd></div></dl><div class="evidence-review-context">${text(source.source_locator)?`<p><strong>Where to look:</strong> ${esc(source.source_locator)}</p>`:''}${safeURL(source.source_reviewed_via)?`<p><a href="${esc(safeURL(source.source_reviewed_via))}" target="_blank" rel="noopener noreferrer">Read the reviewed publisher copy ↗</a> · same publisher, not independent corroboration</p>`:''}${source.link_check&&source.link_check.http_status!==200?`<p><strong>Latest link attempt:</strong> ${esc(dateLabel(source.link_check.date))} · ${Number.isInteger(source.link_check.http_status)?'HTTP '+esc(source.link_check.http_status):'request unavailable'}. This is not evidence the claim is false or the source was deleted.</p>`:''}</div><p class="evidence-basis">Assessment basis: the stored source type and claim. This display is not a fresh reread or gameplay test. Evidence dates, publication dates and review dates are not interchangeable.</p></div></details></article>`;
  }
  function renderSources(issue, dataset) {
    const n = counts(issue), refs = references(issue);
    return `<div class="evidence-intro"><h2>What does the evidence support?</h2><p>${n.references} linked ${n.references === 1 ? 'reference' : 'references'} · ${n.urls} distinct source ${n.urls === 1 ? 'URL' : 'URLs'}. Different URLs are not necessarily independent confirmation.</p><details class="evidence-guide"><summary>How to read these labels</summary><div><p><strong>Strength is scoped to the claim, not a trust score for a website.</strong> A patch note can strongly document the publisher's change without independently proving that the fix worked.</p><p><strong>Support is not reproduction.</strong> Player reports and support responses remain separate from identified developer answers, plans and release notes.</p><p><strong>Missing detail stays visible.</strong> Vague recorded claims are flagged for review, not silently upgraded. A successful link check is not factual verification. No independent outcome check is claimed without a dated method, scope, result and evidence link.</p><p>Evidence snapshot: ${esc(dateLabel(dataset && dataset.generated_at))}. This presentation update does not refresh that evidence date or the issue's status.</p></div></details></div><div class="evidence-list">${refs.length ? refs.map(s => renderSource(issue, s)).join('') : '<p class="evidence-muted">No sources are recorded for this issue.</p>'}</div>`;
  }
  return Object.freeze({version:1, safeURL, validDate, dateLabel, counts, sourceProfile,
    claimNeedsDetail, outcome, assessment, renderSummary, renderSource, renderSources});
});
