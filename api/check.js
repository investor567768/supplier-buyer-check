// Supplier buyer check: investigate a marketplace supplier before paying them.
// Paid answers come from Telegraph providers (through the Anjoman API, paid from the account's
// escrow balance with an API key). Free answers come from GLEIF. Comparisons are done here, in code,
// so every finding says which source it rests on.
//
// Environment (set in Vercel, never in the repo):
//   TELEGRAPH_API_KEY  the Anjoman API key (starts with anjoman_)
//   RUN_PASSCODE       optional. If set, paid live runs need this passcode. If unset, anyone can run (testnet funds)
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
const SUFFIXES = ['co', 'ltd', 'limited', 'company', 'inc', 'incorporated', 'corp', 'corporation', 'llc', 'gmbh', 'ag', 'sa', 'srl', 'spa', 'bv', 'plc', 'pte', 'pvt', 'private', 'group', 'holdings', 'holding', 'international', 'intl', 'trading', 'industrial', 'industry', 'technology', 'technologies', 'tech', 'aktiengesellschaft', 'gesellschaft', 'mit', 'beschrankter', 'haftung', 'kg', 'kgaa', 'se', 'kabushiki', 'kaisha', 'kk', 'sociedad', 'anonima', 'societe', 'anonyme', 'sas', 'sarl', 'naamloze', 'vennootschap', 'nv', 'besloten', 'limitada', 'ltda', 'oy', 'ab', 'as', 'asa', 'spa', 'sp', 'zoo', 'jsc', 'pjsc', 'ooo', 'oao', 'zao', 'pt', 'tbk', 'bhd', 'sdn', 'the'];
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
// Two-way: every distinctive word must appear on both sides ("Siemens AG" is not "Siemens Healthineers AG").
function nameMatchStrict(a, b) {
  const x = core(a), y = core(b);
  if (!x.length || !y.length) return 0;
  const X = new Set(x), Y = new Set(y);
  const hit = x.filter(w => Y.has(w)).length;
  return hit / Math.max(X.size, Y.size);
}
const COUNTRY = { china: 'CN', cn: 'CN', prc: 'CN', 'hong kong': 'HK', hk: 'HK', taiwan: 'TW', tw: 'TW', 'united states': 'US', usa: 'US', us: 'US', 'united kingdom': 'GB', uk: 'GB', gb: 'GB', germany: 'DE', de: 'DE', india: 'IN', in: 'IN', vietnam: 'VN', 'viet nam': 'VN', vn: 'VN', turkey: 'TR', turkiye: 'TR', tr: 'TR', japan: 'JP', jp: 'JP', korea: 'KR', 'south korea': 'KR', kr: 'KR', singapore: 'SG', sg: 'SG', malaysia: 'MY', my: 'MY', thailand: 'TH', th: 'TH', italy: 'IT', it: 'IT', france: 'FR', fr: 'FR', spain: 'ES', es: 'ES', netherlands: 'NL', nl: 'NL', canada: 'CA', ca: 'CA', mexico: 'MX', mx: 'MX', brazil: 'BR', br: 'BR', nigeria: 'NG', ng: 'NG', 'united arab emirates': 'AE', uae: 'AE', ae: 'AE', pakistan: 'PK', pk: 'PK', indonesia: 'ID', id: 'ID', russia: 'RU', ru: 'RU', iran: 'IR', ir: 'IR' };
function cc(s) { const k = String(s || '').trim().toLowerCase(); return COUNTRY[k] || (k.length === 2 ? k.toUpperCase() : null); }
function domainOf(u) {
  try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}
// Marketplace storefronts are hosted on the marketplace's own domain, so they say nothing about the company.
const MARKETPLACE = /(^|\.)(alibaba|aliexpress|1688|made-in-china|globalsources|indiamart|dhgate|tradeindia|ec21|tradekey)\.(com|cn|net|org)$/;

const num = v => { const n = Number(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const list = v => String(v || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).slice(0, 8);
// Flatten any answer (object or text) into lowercase text for evidence matching.
const flat = v => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).toLowerCase();
const hasTerm = (text, term) => new RegExp(`(^|[^a-z0-9])${String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]*')}($|[^a-z0-9])`).test(text);

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
      signal: AbortSignal.timeout(25000),
    });
    status = r.status;
    const text = await r.text();
    try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
  } catch (e) { err = e.name === 'TimeoutError' ? 'no answer within 25 s' : 'could not reach Telegraph'; }
  return { status, json, err };
}
function errText(status, json) {
  if (!json) return `HTTP ${status}`;
  const e = json.error || json.message || json.detail;
  const extra = json.details || json.reason || json.hint;
  return [typeof e === 'string' ? e : JSON.stringify(e), extra && (typeof extra === 'string' ? extra : JSON.stringify(extra))].filter(Boolean).join(': ').slice(0, 300) || `HTTP ${status}`;
}

async function telegraph(intent, params, query, key, minerId, altParams = []) {
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
  if (minerId) {
    ok = await attempt(`miner ${minerId}`, { intent, params, query }, minerId);
    // Refused asks are not charged, so try the other parameter shapes before falling back to plain text.
    for (const alt of altParams) { if (ok) break; ok = await attempt(`miner ${minerId} (${Object.keys(alt).join('+')})`, { intent, params: alt, query }, minerId); }
    if (!ok) ok = await attempt(`miner ${minerId} (plain)`, { query }, minerId);
  }
  // A timeout means the provider is busy; asking again in another form only doubles the wait.
  const timedOut = () => /no answer within/.test(String(err));
  if (!ok) ok = await attempt('router', { intent, params })
    || (!timedOut() && await attempt('router (plain)', { query }));
  if (!ok) err = tried.join('; ');
  // Direct asks come back wrapped: { result: { miner_id, miner_name, result, cost_usd, signal_hash, ... } }.
  let body = json || {};
  if (body.result && typeof body.result === 'object' && (body.result.miner_id || body.result.miner_name) && 'result' in body.result) body = { ...body.result, fulfillment: body.fulfillment || body.result.fulfillment };
  const f = body.fulfillment || {};
  return {
    intent, params, form, http_status: status,
    first_try_refused: ok && tried.length ? tried.join('; ').slice(0, 400) : null,
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
    return { records: (Array.isArray(j.data) ? j.data : j.data ? [j.data] : []).map(d => {
      const e = d.attributes.entity;
      return { lei: d.id, legal_name: e.legalName && e.legalName.name, status: e.status, country: e.legalAddress && e.legalAddress.country, city: e.legalAddress && e.legalAddress.city, registered_as: e.registeredAs || null };
    }) };
  } catch { return { error: 'could not reach GLEIF', records: [] }; }
}
// Search in the listing's country first, so an affiliate abroad is not mistaken for the supplier.
async function gleif(name, code) {
  const base = 'https://api.gleif.org/api/v1/lei-records?page[size]=10';
  const tries = [
    code && `${base}&filter[entity.legalName]=${encodeURIComponent(name)}&filter[entity.legalAddress.country]=${code}`,
    `${base}&filter[entity.legalName]=${encodeURIComponent(name)}`,
    code && `${base}&filter[fulltext]=${encodeURIComponent(name)}&filter[entity.legalAddress.country]=${code}`,
    `${base}&filter[fulltext]=${encodeURIComponent(name)}`,
  ].filter(Boolean);
  const log = [];
  let seen = null;
  for (const url of tries) {
    const r = await gleifQuery(url);
    log.push(`${r.error || r.records.length + ' records'}`);
    if (r.records.some(x => nameMatchStrict(name, x.legal_name) >= 0.67)) return { url, log, ...r };
    if (r.records.length && !seen) seen = { url, ...r };
  }
  if (seen) return { log, ...seen };
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
    // The buyer's order
    product: String(input.product || '').trim(),
    quantity: num(input.quantity),
    deadline_days: num(input.deadline_days),
    unit_price: num(input.unit_price),
    deposit_pct: num(input.deposit_pct) || 30,
    // What the listing claims
    claimed_certifications: list(input.claimed_certifications),
    claimed_years: num(input.claimed_years),
    claimed_monthly_capacity: num(input.claimed_monthly_capacity),
    claimed_export_markets: list(input.claimed_export_markets),
    staff: num(input.staff),
    factory_m2: num(input.factory_m2),
    business_type: String(input.business_type || '').trim(),
  };
  if (!s.supplier) throw new InputError('supplier (the company name exactly as the listing shows it) is required.');
  if (!s.country) throw new InputError('country is required, as the listing shows it.');
  const code = cc(s.country);
  const domain = s.website ? domainOf(s.website) : null;

  // Paid and free calls in parallel.
  const claimsAsked = s.claimed_certifications.length || s.claimed_export_markets.length || s.claimed_years || s.claimed_monthly_capacity;
  const jobs = [
    telegraph('B2B_IDENTITY_ENRICHMENT', { name: s.supplier }, `Is "${s.supplier}" (${s.country}) a real, active company? Give its registered legal name, LEI, jurisdiction, status and headquarters.`, key, IDENTITY_MINER, [{ company: s.supplier, name: s.supplier }, { company: s.supplier, jurisdiction: code || s.country }]),
    telegraph('CORPORATE_REGISTRY_LOOKUP_GENERAL', { company: s.supplier, jurisdiction: code || s.country }, `Official company register record for "${s.supplier}" in ${s.country}: legal name, registration number, status, incorporation date.`, key),
    telegraph('SANCTIONS_SCREENING_MATCH_GENERAL', { name: s.supplier }, `Is the company "${s.supplier}" (${s.country}) clear to transact with? Screen it against the OFAC, UN, EU and UK sanctions lists.`, key, SANCTIONS_MINER),
    domain && !MARKETPLACE.test(domain) ? telegraph('URL_SAFE_GENERAL', { url: `https://${domain}` }, `Is https://${domain} listed as malicious or phishing on threat feeds?`, key) : null,
    gleif(s.supplier, code),
    claimsAsked ? telegraph('WEB_SEARCH_GENERAL', { query: `"${s.supplier}" ${s.city} ${[...s.claimed_certifications, ...s.claimed_export_markets].join(' ')} manufacturer certification export` }, `What independent evidence is there that "${s.supplier}" (${s.city ? s.city + ', ' : ''}${s.country}) holds ${s.claimed_certifications.join(', ') || 'any'} certification, exports to ${s.claimed_export_markets.join(', ') || 'other countries'}, and how long it has operated?`, key) : null,
    telegraph('NEWS_SEARCH_GENERAL', { query: `"${s.supplier}" fraud OR dispute OR lawsuit OR recall OR scam` }, `Find news coverage of fraud, disputes, lawsuits, recalls or scams involving "${s.supplier}" (${s.country}).`, key),
  ];
  const [idc, reg, sanc, web, lei, ws, news] = await Promise.all(jobs);

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
  const regSame = regName ? nameMatch(s.supplier, regName) >= 0.67 : false;
  const regInc = regSame ? pick(reg.result, 'incorporated', 'incorporation_date', 'date_of_incorporation', 'founded') : undefined;
  const prof = idc.result && typeof idc.result === 'object' && ('employee_count' in idc.result || 'headquarters' in idc.result || 'industry' in idc.result) ? idc.result : null;
  if (!prof) textAnswer(idc, 'Company profile');
  if (prof) {
    const bits = [prof.company && `name ${prof.company}`, prof.headquarters && `headquarters ${prof.headquarters}`, prof.employee_count != null && `about ${Number(prof.employee_count).toLocaleString('en-US')} employees`, prof.industry && `industry ${prof.industry}`, prof.domain && `domain ${prof.domain}`].filter(Boolean);
    add('Company profile', 'check', `Business profile from the Telegraph identity provider: ${bits.join(', ') || 'no details'}. This is a profile, not a register record, so it does not by itself confirm the legal entity.`, `Telegraph identity provider (${idc.miner || 'miner not named'})`);
    if (s.city && prof.headquarters && !words(prof.headquarters).some(w => words(s.city).includes(w))) add('Headquarters vs listing', 'check', `The listing says ${s.city}; the provider gives headquarters ${prof.headquarters}. Large companies often have several sites, but ask which entity you are buying from.`, 'Telegraph profile vs listing');
  }
  // Newer identity provider answer: found, legal_name, lei, jurisdiction, legal_form, confidence, source.
  const ident = idc.result && typeof idc.result === 'object' && 'found' in idc.result ? idc.result : null;
  let providerLei = null;
  if (ident) {
    const src = `Telegraph identity provider (${idc.miner || 'miner not named'})`;
    const conf = ident.confidence != null ? ` Provider confidence ${ident.confidence}.` : '';
    if (ident.found === false || !ident.legal_name) {
      add('Identity provider', 'not_found', `The identity provider searched company registers and found no registered entity matching "${s.supplier}"${ident.source ? ` (${String(ident.source).slice(0, 160)})` : ''}.${conf} Not found is not the same as clean.`, src);
    } else {
      const m = nameMatchStrict(s.supplier, ident.legal_name);
      if (m >= 0.67) {
        if (/^[A-Z0-9]{20}$/i.test(String(ident.lei || ''))) providerLei = String(ident.lei).toUpperCase();
        add('Identity provider', 'ok', `${ident.legal_name}${ident.lei ? `, LEI ${ident.lei}` : ''}${ident.jurisdiction ? `, ${ident.jurisdiction}` : ''}${ident.legal_form ? `, ${ident.legal_form}` : ''}. Name agreement with the listing: ${Math.round(m * 100)}%.${conf}`, src);
      } else add('Identity provider', 'unverified', `Provider error, not a supplier problem: the identity provider answered with a different company: ${ident.legal_name}. Name agreement with the listing: ${Math.round(m * 100)}%.${conf}`, src);
    }
  }
  if (!providerLei && regSame && /^[A-Z0-9]{20}$/i.test(String(regId || ''))) providerLei = String(regId).toUpperCase();
  if (regText) { /* shown above */ }
  else if (reg.error || !regName) {
    add('Registered identity', 'not_found', `The Telegraph registry provider did not return a record for "${s.supplier}"${reg.error ? ` (${reg.error})` : ''}. Not found is not the same as clean.`, 'Telegraph CORPORATE_REGISTRY_LOOKUP_GENERAL');
  } else {
    const m = nameMatch(s.supplier, regName);
    add('Registered identity', m >= 0.67 ? 'ok' : 'unverified',
      `${m >= 0.67 ? 'Registry record' : 'Provider error, not a supplier problem: the registry provider answered with a different company'}: ${regName}${regId ? `, registration ${regId}` : ''}${regJur ? `, ${regJur}` : ''}${regActive !== undefined ? `, active: ${regActive}` : ''}. Name agreement with the listing: ${Math.round(m * 100)}%.`,
      `Telegraph CORPORATE_REGISTRY_LOOKUP_GENERAL (${reg.miner || 'miner not named'})`);
    if (m >= 0.67 && s.claimed_registration && regId && String(regId).replace(/\W/g, '').toUpperCase() !== s.claimed_registration.replace(/\W/g, '').toUpperCase())
      add('Registration number', 'mismatch', `The listing or document gives ${s.claimed_registration}, the registry record says ${regId}.`, 'Telegraph registry vs listing');
  }
  // Free second source
  const nameBest = lei.records.map(r => ({ ...r, m: nameMatchStrict(s.supplier, r.legal_name) })).sort((a, b) => b.m - a.m)[0];
  let byLei = null;
  if (providerLei && !(nameBest && nameBest.m >= 0.67)) {
    const r = await gleifQuery(`https://api.gleif.org/api/v1/lei-records/${providerLei}`);
    if (r.records[0]) byLei = { ...r.records[0], m: nameMatchStrict(s.supplier, r.records[0].legal_name) };
  }
  const best = byLei && byLei.m >= 0.67 ? byLei : nameBest;
  if (lei.error && !(best && best === byLei)) add('Legal Entity Identifier', 'unverified', `GLEIF could not be read (${lei.error}).`, 'GLEIF');
  else if (!best || best.m < 0.67) add('Legal Entity Identifier', 'not_found', `No LEI record closely matching "${s.supplier}". Many small manufacturers have no LEI, so this alone is not a warning.`, 'GLEIF public API');
  else if (code && best.country && best.country !== code) {
    add('Legal Entity Identifier', 'not_found', `No LEI record for "${s.supplier}" in ${s.country}.`, 'GLEIF public API');
    add('Country', 'check', `No LEI record in ${s.country}; the closest is ${best.legal_name} in ${best.country}, which may be an affiliate rather than this supplier.`, 'GLEIF vs listing');
  } else {
    add('Legal Entity Identifier', best.status === 'ACTIVE' ? 'ok' : 'mismatch', `${best.legal_name}, LEI ${best.lei}, ${best.status}, ${best.city || ''} ${best.country || ''}${best.registered_as ? `, registered as ${best.registered_as}` : ''}.`, best === byLei ? 'GLEIF public API (looked up by the LEI the identity provider returned)' : 'GLEIF public API');
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
      const good = verdict === true || /^(safe|clean|benign|ok|not (listed|flagged|malicious))/i.test(String(verdict));
      add('Website safety', bad ? 'stop' : good ? 'ok' : 'unverified', `${domain}: ${String(verdict)}.${bad || good ? '' : ' The provider could not rate this site, so it is not treated as safe.'}`, `Telegraph URL_SAFE_GENERAL (${web.miner || 'miner not named'})`);
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

  // 5. The order and the listing's claims
  const wsText = ws && !ws.error ? flat(ws.result) : '';
  const wsSrc = ws ? `Telegraph WEB_SEARCH_GENERAL (${ws.miner || 'miner not named'})` : '';
  for (const c of s.claimed_certifications) {
    if (!ws || ws.error) add(`Claim: ${c}`, 'unverified', `Claimed by the listing. The web search gave no usable answer${ws && ws.error ? ` (${ws.error})` : ''}, so the claim is unchecked.`, wsSrc || 'Listing');
    else if (hasTerm(wsText, c)) add(`Claim: ${c}`, 'check', `Claimed by the listing, and mentioned in independent search results. A mention is not a certificate: ask for the certificate number and check it with the issuing body.`, wsSrc);
    else add(`Claim: ${c}`, 'not_found', `Claimed by the listing, but no independent evidence found. Treat it as unproven until the supplier sends the certificate.`, wsSrc);
  }
  for (const m of s.claimed_export_markets) {
    if (!ws || ws.error) add(`Claim: exports to ${m}`, 'unverified', 'Claimed by the listing. Not checked.', wsSrc || 'Listing');
    else add(`Claim: exports to ${m}`, hasTerm(wsText, m) ? 'check' : 'not_found', hasTerm(wsText, m) ? 'Claimed, and mentioned in independent search results. Ask for a past bill of lading or customs record to confirm.' : 'Claimed, but no independent evidence found.', wsSrc);
  }
  if (s.claimed_years) {
    const y = regInc ? (Date.now() - new Date(regInc).getTime()) / 3.156e10 : null;
    if (y && Number.isFinite(y)) add('Claim: years in business', Math.abs(y - s.claimed_years) <= 1.5 ? 'ok' : 'mismatch', `The listing claims ${s.claimed_years} years; the register shows incorporation on ${String(regInc).slice(0, 10)}, about ${Math.floor(y)} years.`, 'Telegraph registry vs listing');
    else add('Claim: years in business', 'not_found', `The listing claims ${s.claimed_years} years. No incorporation date was available to check it.`, 'Listing');
  }
  if (s.quantity) {
    if (!s.claimed_monthly_capacity) add('Can they fulfil the order', 'unverified', `The order is ${s.quantity.toLocaleString('en-US')} units${s.product ? ` of ${s.product}` : ''}, but the listing gives no production capacity. Ask for it in writing.`, 'Order vs listing');
    else {
      const days = Math.ceil(s.quantity / s.claimed_monthly_capacity * 30);
      const fits = !s.deadline_days || days <= s.deadline_days;
      add('Can they fulfil the order', fits ? 'check' : 'mismatch', `${s.quantity.toLocaleString('en-US')} units at the claimed ${s.claimed_monthly_capacity.toLocaleString('en-US')} a month takes about ${days} days${s.deadline_days ? `; the deadline is ${s.deadline_days} days` : ''}. ${fits ? 'It fits on paper, but the capacity figure is the supplier\'s own claim.' : 'The claimed capacity cannot meet the deadline.'}`, 'Order vs listing (computed)');
    }
  }
  // 5b. Is the seller big enough to make this order itself?
  if (s.quantity && (s.staff || s.factory_m2)) {
    const months = s.deadline_days ? s.deadline_days / 30 : 1;
    const perMonth = s.quantity / months;
    // Rough benchmark for assembled electrical equipment: about 25 units per worker per month.
    const staffCap = s.staff ? s.staff * 25 : null;
    const bits = [s.staff && `${s.staff.toLocaleString('en-US')} staff`, s.factory_m2 && `${s.factory_m2.toLocaleString('en-US')} m² of floor space`].filter(Boolean).join(' and ');
    if (staffCap && perMonth > staffCap * 1.5)
      add('Seller size vs order', 'mismatch', `The order needs about ${Math.round(perMonth).toLocaleString('en-US')} units a month. With ${bits}, a rough benchmark of 25 units per worker per month gives about ${staffCap.toLocaleString('en-US')}. The seller may subcontract or resell another factory's goods. Ask which factory makes the order and visit or audit it.`, 'Listing figures vs order (rough benchmark, computed)');
    else if (staffCap)
      add('Seller size vs order', 'ok', `The order needs about ${Math.round(perMonth).toLocaleString('en-US')} units a month; ${bits} is plausible for that on a rough benchmark of 25 units per worker per month.`, 'Listing figures vs order (rough benchmark, computed)');
    if (s.claimed_monthly_capacity && staffCap && s.claimed_monthly_capacity > staffCap * 3)
      add('Claimed capacity vs seller size', 'mismatch', `The listing claims ${s.claimed_monthly_capacity.toLocaleString('en-US')} units a month, more than three times what ${bits} would suggest. Treat the capacity figure as unproven.`, 'Listing figures (computed)');
  }
  if (/trad/i.test(s.business_type)) add('Manufacturer or trader', 'check', `The listing describes the seller as "${s.business_type}". A trading company may not make the goods itself. Ask for the name and address of the factory and check that company too.`, 'Listing');

  // 6. Disputes and adverse news
  if (news) {
    const nt = flat(news.result);
    const count = Number(pick(news.result, 'result_count'));
    const brief = pick(news.result, 'brief', 'answer');
    const GENERIC = ['electric', 'electrical', 'electronic', 'electronics', 'machinery', 'machine', 'equipment', 'power', 'energy', 'control', 'controls', 'industrial', 'manufacturing', 'products', 'trade', 'import', 'export', 'global', 'new', 'china', 'zhejiang', 'guangdong', 'shenzhen'];
    const key = core(s.supplier).filter(w => !GENERIC.includes(w) && w.length > 2);
    const body = nt.split(flat(s.supplier)).join(' ').replace(/"[^"]*(fraud or dispute|lawsuit or recall)[^"]*"/g, ' ');
    const named = key.length && key.every(w => new RegExp(`\\b${w}\\b`).test(body));
    const bad = /fraud|scam|lawsuit|sued|dispute|recall|sanction|counterfeit|seized|indicted/.test(body) && named;
    if (news.error) add('Disputes and adverse news', 'unverified', `The news search gave no usable answer (${news.error}).`, 'Telegraph NEWS_SEARCH_GENERAL');
    else if (bad && count !== 0) add('Disputes and adverse news', 'check', `News coverage mentions problems that may involve this supplier${brief ? `: "${String(brief).slice(0, 300)}"` : ''}. Read the sources: a name match can be a different company.`, `Telegraph NEWS_SEARCH_GENERAL (${news.miner || 'miner not named'})`);
    else add('Disputes and adverse news', 'ok', 'No news coverage of fraud, disputes, lawsuits or recalls naming this supplier. One news source; absence is not proof.', `Telegraph NEWS_SEARCH_GENERAL (${news.miner || 'miner not named'})`);
  }

  // 7. Recommendation
  const has = st => findings.some(f => f.status === st);
  const identityConfirmed = findings.some(f => (f.area === 'Registered identity' || f.area === 'Legal Entity Identifier') && f.status === 'ok');
  let verdict, why;
  if (has('stop')) { verdict = 'STOP'; why = 'At least one check found a serious problem. Resolve it before paying anything.'; }
  else if (has('mismatch') || !identityConfirmed || findings.some(f => f.status === 'unverified' && f.area !== 'Website safety') || sancText || findings.some(f => f.area === 'Sanctions' && f.status === 'check')) { verdict = 'VERIFY FIRST'; why = identityConfirmed ? 'Some details disagree or could not be checked.' : 'The company behind the listing could not be confirmed from an independent register. Ask for the business licence and check it before paying, and use the marketplace\'s payment protection.'; }
  else { verdict = 'PROCEED WITH STANDARD CARE'; why = 'Identity confirmed from an independent register, no sanctions match, no red flags in the documents checked. This is not a guarantee of product quality.'; }

  const calls = [idc, reg, sanc, web, ws, news].filter(Boolean);
  const total = calls.reduce((t, c) => t + (c.cost_usd || 0), 0);
  // Money at risk
  const usd = n => '$' + Math.round(n).toLocaleString('en-US');
  let money = null;
  if (s.quantity && s.unit_price) {
    const value = s.quantity * s.unit_price, deposit = value * Math.min(s.deposit_pct, 100) / 100;
    const blocking = findings.filter(f => f.status === 'stop' || f.status === 'mismatch').map(f => f.area);
    money = { order_value: value, deposit_pct: s.deposit_pct, deposit_at_risk: deposit,
      summary: verdict === 'STOP'
        ? `Order value ${usd(value)}. Paying now would put the ${s.deposit_pct}% deposit, ${usd(deposit)}, at risk, and the full ${usd(value)} if paid in full. This check stops that payment because of: ${blocking.join(', ')}.`
        : verdict.startsWith('VERIFY')
          ? `Order value ${usd(value)}. Hold the ${s.deposit_pct}% deposit (${usd(deposit)}) until the open points are answered${blocking.length ? `: ${blocking.join(', ')}` : ''}.`
          : `Order value ${usd(value)}, ${s.deposit_pct}% deposit ${usd(deposit)}. No blocking problem found; standard payment protection still applies.` };
  }
  const W = { ok: 3, check: -1, not_found: -2, unverified: -3, mismatch: -8, stop: -100 };
  const score = findings.reduce((t, f) => t + (W[f.status] ?? 0), 0);
  return {
    input: s, verdict, why, findings, score, money,
    telegraph_calls: calls,
    free_sources: [{ source: 'GLEIF', url: lei.url, records: lei.records.length, attempts: lei.log, error: lei.error || null }],
    total_cost_usd: Math.round(total * 10000) / 10000,
    network: 'Telegraph testnet',
    checked_at: new Date().toISOString(),
  };
}

// Free-use brake. Counters live in memory, so they reset when the server restarts or scales out:
// a safety net for testnet funds, not exact accounting. Set RUN_PASSCODE to bypass it for your own runs.
const PER_IP_PER_DAY = Number(process.env.RUNS_PER_IP_PER_DAY || 5);
const ALL_PER_DAY = Number(process.env.RUNS_ALL_PER_DAY || 150);
const usage = { day: '', all: 0, ips: new Map() };
function allowRun(ip, today = new Date().toISOString().slice(0, 10)) {
  if (usage.day !== today) { usage.day = today; usage.all = 0; usage.ips = new Map(); }
  const n = usage.ips.get(ip) || 0;
  if (n >= PER_IP_PER_DAY) return { ok: false, why: `You have used today's ${PER_IP_PER_DAY} free checks. They reset at 00:00 UTC.` };
  if (usage.all >= ALL_PER_DAY) return { ok: false, why: 'Today\'s free checks for everyone are used up. They reset at 00:00 UTC.' };
  usage.ips.set(ip, n + 1); usage.all += 1;
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Use POST with a JSON body.' })); }
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d || '{}')); }));
    if (!process.env.TELEGRAPH_API_KEY) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'This deployment has no Telegraph API key set, so it cannot buy answers.' })); }
    if (process.env.RUN_PASSCODE && body.passcode !== process.env.RUN_PASSCODE) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Live checks spend real testnet funds, so they need the passcode. The saved runs on this page are free to read.' })); }
    if (!(process.env.RUN_PASSCODE && body.passcode === process.env.RUN_PASSCODE)) {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const a = allowRun(ip);
      if (!a.ok) { res.statusCode = 429; return res.end(JSON.stringify({ error: a.why })); }
    }
    const out = await investigate(body, process.env.TELEGRAPH_API_KEY);
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = e.status || 500;
    res.end(JSON.stringify({ error: e.status ? e.message : 'The check failed unexpectedly.' }));
  }
}

export { investigate, nameMatch, core, cc, domainOf, MARKETPLACE, allowRun };
