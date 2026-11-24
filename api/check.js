// Supplier buyer check: investigate a marketplace supplier before paying them.
// Paid answers come from Telegraph providers (through the Anjoman API, paid from the account's
// escrow balance with an API key). Free answers come from GLEIF. Comparisons are done here, in code,
// so every finding says which source it rests on.
//
// Environment (set in Vercel, never in the repo):
//   TELEGRAPH_API_KEY  the Anjoman API key (starts with anjoman_)
//   RUN_PASSCODE       a passcode needed for paid live runs, so strangers cannot spend the balance
// Optional:
//   TELEGRAPH_BASE     defaults to https://backend.telegraphprotocol.com
//   MAX_BUDGET_UUSDC   per paid call, in micro-USDC, defaults to 100000 (0.10 USD)

const BASE = process.env.TELEGRAPH_BASE || 'https://backend.telegraphprotocol.com';
const BUDGET = Number(process.env.MAX_BUDGET_UUSDC || 100000);
// Named specialists on the Telegraph network (direct ask by miner id). Override in Vercel if they change.
const IDENTITY_MINER = process.env.IDENTITY_MINER || '731005';   // GLEIF-based legal entity identity
const SANCTIONS_MINER = process.env.SANCTIONS_MINER || '731002'; // CLEAR / REVIEW / BLOCK across OFAC, UN, EU, UK

class InputError extends Error { constructor(msg) { super(msg); this.status = 400; } }

// ---------- name and place helpers ----------
const SUFFIXES = ['co', 'ltd', 'limited', 'company', 'inc', 'incorporated', 'corp', 'corporation', 'llc', 'gmbh', 'ag', 'sa', 'srl', 'spa', 'bv', 'plc', 'pte', 'pvt', 'private', 'group', 'holdings', 'holding', 'international', 'intl', 'trading', 'industrial', 'industry', 'technology', 'technologies', 'tech'];
function words(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}
function core(s) { return words(s).filter(w => !SUFFIXES.includes(w)); }
// Share of the listed name's distinctive words found in the other name (0..1).
function nameMatch(listed, found) {
  const a = core(listed), b = new Set(core(found));
  if (!a.length || !b.size) return 0;
  return a.filter(w => b.has(w)).length / a.length;
}
const COUNTRY = { china: 'CN', cn: 'CN', prc: 'CN', 'hong kong': 'HK', hk: 'HK', taiwan: 'TW', tw: 'TW', 'united states': 'US', usa: 'US', us: 'US', 'united kingdom': 'GB', uk: 'GB', gb: 'GB', germany: 'DE', de: 'DE', india: 'IN', in: 'IN', vietnam: 'VN', 'viet nam': 'VN', vn: 'VN', turkey: 'TR', turkiye: 'TR', tr: 'TR', japan: 'JP', jp: 'JP', korea: 'KR', 'south korea': 'KR', kr: 'KR', singapore: 'SG', sg: 'SG', malaysia: 'MY', my: 'MY', thailand: 'TH', th: 'TH', italy: 'IT', it: 'IT', france: 'FR', fr: 'FR', spain: 'ES', es: 'ES', netherlands: 'NL', nl: 'NL', canada: 'CA', ca: 'CA', mexico: 'MX', mx: 'MX', brazil: 'BR', br: 'BR', nigeria: 'NG', ng: 'NG', 'united arab emirates': 'AE', uae: 'AE', ae: 'AE', pakistan: 'PK', pk: 'PK', indonesia: 'ID', id: 'ID', russia: 'RU', ru: 'RU', iran: 'IR', ir: 'IR' };
function cc(s) { const k = String(s || '').trim().toLowerCase(); return COUNTRY[k] || (k.length === 2 ? k.toUpperCase() : null); }
function domainOf(u) {
  try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}
// Marketplace storefronts are hosted on the marketplace's own domain, so they say nothing about the company.
const MARKETPLACE = /(^|\.)(alibaba|aliexpress|1688|made-in-china|globalsources|indiamart|dhgate|tradeindia|ec21|tradekey)\.(com|cn|net|org)$/;

// ---------- sources ----------
// One paid ask. Tries the typed form (intent + params) first; if the node rejects the body (400),
// retries once in the plain-language form (query), which every ask endpoint accepts.
async function postAsk(body, key, minerId) {
  let status = 0, json = null, err = null;
  try {
    const r = await fetch(`${BASE}/engine/ask${minerId ? '/' + minerId : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50000),
    });
    status = r.status;
    const text = await r.text();
    try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
  } catch (e) { err = e.name === 'TimeoutError' ? 'no answer within 50 s' : 'could not reach Telegraph'; }
  return { status, json, err };
}
function errText(status, json) {
  if (!json) return `HTTP ${status}`;
  const e = json.error || json.message || json.detail;
  const extra = json.details || json.reason || json.hint;
  return [typeof e === 'string' ? e : JSON.stringify(e), extra && (typeof extra === 'string' ? extra : JSON.stringify(extra))].filter(Boolean).join(': ').slice(0, 300) || `HTTP ${status}`;
}

async function telegraph(intent, params, query, key, minerId) {
  const started = Date.now();
  let form = minerId ? `miner ${minerId}` : 'intent';
  // Named specialist first (direct ask): typed form, then plain question. Then the router.
  const tried = [];
  let status = 0, json = null, err = null;
  const attempt = async (label, body, id) => {
    ({ status, json, err } = await postAsk(body, key, id));
    form = label;
    if (err || status >= 400) tried.push(`${label}: ${err || errText(status, json)}`);
    return !err && status < 400;
  };
  let ok = false;
  if (minerId) ok = await attempt(`miner ${minerId}`, { intent, params, query }, minerId)
    || await attempt(`miner ${minerId} (plain)`, { query }, minerId);
  if (!ok) ok = await attempt('router', { intent, params, max_budget_usdc: BUDGET })
    || await attempt('router (plain)', { query, max_budget_usdc: BUDGET });
  if (!ok) err = tried.join('; ');
  // Direct asks come back wrapped: { result: { miner_id, miner_name, result, cost_usd, signal_hash, ... } }.
  let body = json || {};
  if (body.result && typeof body.result === 'object' && (body.result.miner_id || body.result.miner_name) && 'result' in body.result) body = { ...body.result, fulfillment: body.fulfillment || body.result.fulfillment };
  const f = body.fulfillment || {};
  return {
    intent, params, form, http_status: status,
    error: err || (status >= 400 ? errText(status, body) : null),
    miner: body.miner_name || body.miner_id || body.miner || (minerId && !String(form).startsWith('router') ? `#${minerId}` : null),
    result: body.result !== undefined ? body.result : (body.answer !== undefined ? body.answer : null),
    result_shape: body.result_shape || null,
    fulfillment_status: f.status || null,
    cost_usd: body.cost_usd != null ? Number(body.cost_usd) : body.costUsd != null ? Number(body.costUsd) : body.price_usd != null ? Number(body.price_usd) : null,
    signal_hash: body.signal_hash || body.signalHash || body.receipt_hash || null,
    payments: Array.isArray(f.payments) ? f.payments.map(p => ({ miner: p.miner, intent: p.intent, amount_uusdc: p.amount_uusdc, receipt_hash: p.receipt_hash })) : [],
    raw_keys: json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [],
    raw_preview: json ? JSON.stringify(json).slice(0, 600) : null,
    ms: Date.now() - started,
  };
}

async function gleifQuery(url) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/vnd.api+json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { error: `HTTP ${r.status}`, records: [] };
    const j = await r.json();
    return { records: (j.data || []).map(d => {
      const e = d.attributes.entity;
      return { lei: d.id, legal_name: e.legalName && e.legalName.name, status: e.status, country: e.legalAddress && e.legalAddress.country, city: e.legalAddress && e.legalAddress.city, registered_as: e.registeredAs || null };
    }) };
  } catch { return { error: 'could not reach GLEIF', records: [] }; }
}
// Search in the listing's country first, so an affiliate abroad is not mistaken for the supplier.
async function gleif(name, code) {
  const base = 'https://api.gleif.org/api/v1/lei-records?page[size]=5';
  const tries = [
    code && `${base}&filter[entity.legalName]=${encodeURIComponent(name)}&filter[entity.legalAddress.country]=${code}`,
    `${base}&filter[entity.legalName]=${encodeURIComponent(name)}`,
    code && `${base}&filter[fulltext]=${encodeURIComponent(name)}&filter[entity.legalAddress.country]=${code}`,
    `${base}&filter[fulltext]=${encodeURIComponent(name)}`,
  ].filter(Boolean);
  const log = [];
  for (const url of tries) {
    const r = await gleifQuery(url);
    log.push(`${r.error || r.records.length + ' records'}`);
    if (r.records.length) return { url, log, ...r };
  }
  return { url: tries[tries.length - 1], log, records: [], error: log.every(x => /HTTP|reach/.test(x)) ? log[0] : null };
}

// Read a value from a Telegraph result whether it came back shaped to the Intent or raw.
function pick(result, ...keys) {
  if (!result || typeof result !== 'object') return undefined;
  const layers = [result, result.data, result.answer, result.entity, result.result].filter(x => x && typeof x === 'object');
  for (const L of layers) for (const k of keys) if (L[k] !== undefined && L[k] !== null && L[k] !== '') return L[k];
  return undefined;
}

// ---------- the investigation ----------
async function investigate(input, key) {
  const s = {
    supplier: String(input.supplier || '').trim(),
    country: String(input.country || '').trim(),
    city: String(input.city || '').trim(),
    website: String(input.website || '').trim(),
    listing_url: String(input.listing_url || '').trim(),
    claimed_registration: String(input.claimed_registration || '').trim(),
    invoice_beneficiary: String(input.invoice_beneficiary || '').trim(),
    invoice_bank_country: String(input.invoice_bank_country || '').trim(),
  };
  if (!s.supplier) throw new InputError('supplier (the company name exactly as the listing shows it) is required.');
  if (!s.country) throw new InputError('country is required, as the listing shows it.');
  const code = cc(s.country);
  const domain = s.website ? domainOf(s.website) : null;

  // Paid and free calls in parallel.
  const jobs = [
    telegraph('CORPORATE_REGISTRY_LOOKUP_GENERAL', { company: s.supplier, jurisdiction: code || s.country }, `Is "${s.supplier}" (${s.country}) a real, active company? Give its registered legal name, LEI, jurisdiction, status and headquarters.`, key, IDENTITY_MINER),
    telegraph('SANCTIONS_SCREENING_MATCH_GENERAL', { name: s.supplier }, `Is the company "${s.supplier}" (${s.country}) clear to transact with? Screen it against the OFAC, UN, EU and UK sanctions lists.`, key, SANCTIONS_MINER),
    domain && !MARKETPLACE.test(domain) ? telegraph('URL_SAFE_GENERAL', { url: `https://${domain}` }, `Is https://${domain} listed as malicious or phishing on threat feeds?`, key) : null,
    gleif(s.supplier, code),
  ];
  const [reg, sanc, web, lei] = await Promise.all(jobs);

  const findings = [];
  const add = (area, status, text, source) => findings.push({ area, status, text, source });

  // Plain-language answers come back as text. Show them as they are, never scored as clean.
  const textAnswer = (call, area) => {
    if (call && !call.error && typeof call.result === 'string' && call.result.trim()) {
      add(area, 'check', `Provider's answer (plain text, read it yourself): "${call.result.trim().slice(0, 400)}"`, `Telegraph ${call.intent} (${call.miner || 'miner not named'}, plain-language ask)`);
      return true;
    }
    return false;
  };
  const regText = textAnswer(reg, 'Registered identity');
  const sancText = textAnswer(sanc, 'Sanctions');
  const webText = web ? textAnswer(web, 'Website safety') : false;

  // 1. Registered identity
  const regName = pick(reg.result, 'legal_name', 'legalName', 'registered_name', 'name', 'company');
  const regId = pick(reg.result, 'registration_id', 'company_number', 'registration_number', 'lei', 'LEI');
  const regActive = pick(reg.result, 'active', 'status');
  const regJur = pick(reg.result, 'jurisdiction', 'country');
  const prof = reg.result && typeof reg.result === 'object' && ('employee_count' in reg.result || 'headquarters' in reg.result || 'industry' in reg.result) && !pick(reg.result, 'legal_name', 'legalName', 'registered_name', 'lei', 'LEI') ? reg.result : null;
  if (prof) {
    const bits = [prof.company && `name ${prof.company}`, prof.headquarters && `headquarters ${prof.headquarters}`, prof.employee_count != null && `about ${Number(prof.employee_count).toLocaleString('en-US')} employees`, prof.industry && `industry ${prof.industry}`, prof.domain && `domain ${prof.domain}`].filter(Boolean);
    add('Company profile', 'check', `Business profile from the Telegraph identity provider: ${bits.join(', ') || 'no details'}. This is a profile, not a register record, so it does not by itself confirm the legal entity.`, `Telegraph identity provider (${reg.miner || 'miner not named'})`);
    if (s.city && prof.headquarters && !words(prof.headquarters).some(w => words(s.city).includes(w))) add('Headquarters vs listing', 'check', `The listing says ${s.city}; the provider gives headquarters ${prof.headquarters}. Large companies often have several sites, but ask which entity you are buying from.`, 'Telegraph profile vs listing');
  }
  if (prof) { /* shown above */ }
  else if (regText) { /* shown above */ }
  else if (reg.error || !regName) {
    add('Registered identity', 'not_found', `The Telegraph registry provider did not return a record for "${s.supplier}"${reg.error ? ` (${reg.error})` : ''}. Not found is not the same as clean.`, 'Telegraph CORPORATE_REGISTRY_LOOKUP_GENERAL');
  } else {
    const m = nameMatch(s.supplier, regName);
    add('Registered identity', m >= 0.67 ? 'ok' : 'mismatch',
      `Registry record: ${regName}${regId ? `, registration ${regId}` : ''}${regJur ? `, ${regJur}` : ''}${regActive !== undefined ? `, active: ${regActive}` : ''}. Name agreement with the listing: ${Math.round(m * 100)}%.`,
      `Telegraph CORPORATE_REGISTRY_LOOKUP_GENERAL (${reg.miner || 'miner not named'})`);
    if (s.claimed_registration && regId && String(regId).replace(/\W/g, '').toUpperCase() !== s.claimed_registration.replace(/\W/g, '').toUpperCase())
      add('Registration number', 'mismatch', `The listing or document gives ${s.claimed_registration}, the registry record says ${regId}.`, 'Telegraph registry vs listing');
  }
  // Free second source
  const best = lei.records.map(r => ({ ...r, m: nameMatch(s.supplier, r.legal_name) })).sort((a, b) => b.m - a.m)[0];
  if (lei.error) add('Legal Entity Identifier', 'unverified', `GLEIF could not be read (${lei.error}).`, 'GLEIF');
  else if (!best || best.m < 0.67) add('Legal Entity Identifier', 'not_found', `No LEI record closely matching "${s.supplier}". Many small manufacturers have no LEI, so this alone is not a warning.`, 'GLEIF public API');
  else if (code && best.country && best.country !== code) {
    add('Legal Entity Identifier', 'not_found', `No LEI record for "${s.supplier}" in ${s.country}.`, 'GLEIF public API');
    add('Country', 'check', `No LEI record in ${s.country}; the closest is ${best.legal_name} in ${best.country}, which may be an affiliate rather than this supplier.`, 'GLEIF vs listing');
  } else {
    add('Legal Entity Identifier', best.status === 'ACTIVE' ? 'ok' : 'mismatch', `${best.legal_name}, LEI ${best.lei}, ${best.status}, ${best.city || ''} ${best.country || ''}${best.registered_as ? `, registered as ${best.registered_as}` : ''}.`, 'GLEIF public API');
    if (s.claimed_registration && best.registered_as && best.registered_as.replace(/\W/g, '').toUpperCase() !== s.claimed_registration.replace(/\W/g, '').toUpperCase())
      add('Registration number', 'mismatch', `The listing or document gives ${s.claimed_registration}; GLEIF has ${best.registered_as} for ${best.legal_name}.`, 'GLEIF vs listing');
  }

  // 2. Sanctions
  let matched = pick(sanc.result, 'matched', 'listed', 'match');
  const sv = String(pick(sanc.result, 'verdict', 'decision', 'status') || '').toUpperCase();
  if (matched === undefined && sv) matched = sv.includes('BLOCK') ? true : sv.includes('CLEAR') ? false : sv.includes('REVIEW') ? 'review' : undefined;
  const lists = pick(sanc.result, 'lists');
  if (sancText) { /* shown above */ }
  else if (sanc.error || matched === undefined) add('Sanctions', 'unverified', `The sanctions provider gave no usable answer${sanc.error ? ` (${sanc.error})` : ''}. Screening not done, so this is not a clean result.`, 'Telegraph SANCTIONS_SCREENING_MATCH_GENERAL');
  else if (matched === 'review') add('Sanctions', 'check', `The screen returned REVIEW: a partial name match that needs a person to compare the entry with this supplier.`, `Telegraph sanctions specialist (${sanc.miner || 'miner not named'})`);
  else if (matched === true || matched === 'true') add('Sanctions', 'stop', `Possible sanctions match${lists ? ` on ${[].concat(lists).join(', ')}` : ''}. Check the exact entry before any further contact; a name match can be a different party.`, `Telegraph SANCTIONS_SCREENING_MATCH_GENERAL (${sanc.miner || 'miner not named'})`);
  else add('Sanctions', 'ok', `No match reported${lists ? ` on ${[].concat(lists).join(', ')}` : ''}. One provider only.`, `Telegraph SANCTIONS_SCREENING_MATCH_GENERAL (${sanc.miner || 'miner not named'})`);

  // 3. Website
  if (!s.website) add('Company website', 'not_found', 'The listing gives no company website, only the marketplace storefront.', 'Listing');
  else if (!domain) add('Company website', 'unverified', `"${s.website}" is not a valid web address.`, 'Listing');
  else if (MARKETPLACE.test(domain)) add('Company website', 'not_found', `${domain} is the marketplace itself, not the company's own site.`, 'Listing');
  else {
    const verdict = web && pick(web.result, 'verdict', 'safe');
    if (webText) { /* shown above */ }
    else if (!web || web.error || verdict === undefined) add('Website safety', 'unverified', `No usable website-safety answer for ${domain}${web && web.error ? ` (${web.error})` : ''}.`, 'Telegraph URL_SAFE_GENERAL');
    else {
      const bad = verdict === false || /malicious|phish|unsafe|suspicious/i.test(String(verdict));
      add('Website safety', bad ? 'stop' : 'ok', `${domain}: ${String(verdict)}.`, `Telegraph URL_SAFE_GENERAL (${web.miner || 'miner not named'})`);
    }
    const dm = nameMatch(s.supplier, domain.split('.').slice(0, -1).join(' '));
    if (dm === 0) add('Website vs company name', 'check', `The domain ${domain} shares no distinctive word with "${s.supplier}". Common for brands, but confirm the site belongs to this company.`, 'Listing');
  }

  // 4. Payment document
  if (s.invoice_beneficiary) {
    const m = nameMatch(s.supplier, s.invoice_beneficiary);
    add('Payment beneficiary', m >= 0.67 ? 'ok' : 'stop', m >= 0.67 ? `The invoice pays "${s.invoice_beneficiary}", which matches the supplier.` : `The invoice pays "${s.invoice_beneficiary}", not "${s.supplier}". Paying a different account holder is the most common marketplace payment fraud. Do not pay until the supplier confirms in writing through the marketplace.`, 'Invoice vs listing');
  }
  if (s.invoice_bank_country) {
    const b = cc(s.invoice_bank_country);
    if (code && b && b !== code) add('Bank country', 'check', `The bank is in ${s.invoice_bank_country}, the company in ${s.country}. Can be legitimate (for example Hong Kong accounts for mainland firms), but ask why.`, 'Invoice vs listing');
  }

  // 5. Recommendation
  const has = st => findings.some(f => f.status === st);
  const identityConfirmed = findings.some(f => (f.area === 'Registered identity' || f.area === 'Legal Entity Identifier') && f.status === 'ok');
  let verdict, why;
  if (has('stop')) { verdict = 'STOP'; why = 'At least one check found a serious problem. Resolve it before paying anything.'; }
  else if (has('mismatch') || !identityConfirmed || has('unverified') || sancText || findings.some(f => f.area === 'Sanctions' && f.status === 'check')) { verdict = 'VERIFY FIRST'; why = identityConfirmed ? 'Some details disagree or could not be checked.' : 'The company behind the listing could not be confirmed from an independent register. Ask for the business licence and check it before paying, and use the marketplace\'s payment protection.'; }
  else { verdict = 'PROCEED WITH STANDARD CARE'; why = 'Identity confirmed from an independent register, no sanctions match, no red flags in the documents checked. This is not a guarantee of product quality.'; }

  const calls = [reg, sanc, web].filter(Boolean);
  const total = calls.reduce((t, c) => t + (c.cost_usd || 0), 0);
  return {
    input: s, verdict, why, findings,
    telegraph_calls: calls,
    free_sources: [{ source: 'GLEIF', url: lei.url, records: lei.records.length, attempts: lei.log, error: lei.error || null }],
    total_cost_usd: Math.round(total * 10000) / 10000,
    network: 'Telegraph testnet',
    checked_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Use POST with a JSON body.' })); }
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d || '{}')); }));
    if (!process.env.TELEGRAPH_API_KEY) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'This deployment has no Telegraph API key set, so it cannot buy answers.' })); }
    if (!process.env.RUN_PASSCODE || body.passcode !== process.env.RUN_PASSCODE) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Live checks spend real testnet funds, so they need the passcode. The saved runs on this page are free to read.' })); }
    const out = await investigate(body, process.env.TELEGRAPH_API_KEY);
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = e.status || 500;
    res.end(JSON.stringify({ error: e.status ? e.message : 'The check failed unexpectedly.' }));
  }
}

export { investigate, nameMatch, core, cc, domainOf, MARKETPLACE };
