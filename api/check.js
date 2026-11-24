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
async function telegraph(intent, params, key) {
  const started = Date.now();
  let status = 0, body = null, err = null;
  try {
    const r = await fetch(`${BASE}/engine/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ intent, params, max_budget_usdc: BUDGET }),
      signal: AbortSignal.timeout(55000),
    });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch (e) { err = e.name === 'TimeoutError' ? 'no answer within 55 s' : 'could not reach Telegraph'; }
  const f = body && body.fulfillment || {};
  return {
    intent, params, http_status: status, error: err || (status && status >= 400 ? (body && (body.error || body.message)) || `HTTP ${status}` : null),
    miner: body && (body.miner_name || body.miner_id) || null,
    result: body && body.result !== undefined ? body.result : null,
    result_shape: body && body.result_shape || null,
    fulfillment_status: f.status || null,
    cost_usd: body && body.cost_usd != null ? Number(body.cost_usd) : null,
    signal_hash: body && body.signal_hash || null,
    payments: Array.isArray(f.payments) ? f.payments.map(p => ({ miner: p.miner, intent: p.intent, amount_uusdc: p.amount_uusdc, receipt_hash: p.receipt_hash })) : [],
    ms: Date.now() - started,
  };
}

async function gleif(name) {
  const url = `https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${encodeURIComponent(name)}&page[size]=5`;
  try {
    const r = await fetch(url, { headers: { accept: 'application/vnd.api+json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { url, error: `HTTP ${r.status}`, records: [] };
    const j = await r.json();
    const records = (j.data || []).map(d => {
      const e = d.attributes.entity;
      return { lei: d.id, legal_name: e.legalName && e.legalName.name, status: e.status, country: e.legalAddress && e.legalAddress.country, city: e.legalAddress && e.legalAddress.city, registered_as: e.registeredAs || null };
    });
    return { url, records };
  } catch { return { url, error: 'could not reach GLEIF', records: [] }; }
}

// Read a value from a Telegraph result whether it came back shaped to the Intent or raw.
function pick(result, ...keys) {
  if (!result || typeof result !== 'object') return undefined;
  for (const k of keys) if (result[k] !== undefined && result[k] !== null && result[k] !== '') return result[k];
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
    telegraph('CORPORATE_REGISTRY_LOOKUP_GENERAL', { company: s.supplier, jurisdiction: code || s.country }, key),
    telegraph('SANCTIONS_SCREENING_MATCH_GENERAL', { name: s.supplier }, key),
    domain && !MARKETPLACE.test(domain) ? telegraph('URL_SAFE_GENERAL', { url: `https://${domain}` }, key) : null,
    gleif(s.supplier),
  ];
  const [reg, sanc, web, lei] = await Promise.all(jobs);

  const findings = [];
  const add = (area, status, text, source) => findings.push({ area, status, text, source });

  // 1. Registered identity
  const regName = pick(reg.result, 'legal_name', 'name', 'company');
  const regId = pick(reg.result, 'registration_id', 'company_number', 'registration_number');
  const regActive = pick(reg.result, 'active', 'status');
  const regJur = pick(reg.result, 'jurisdiction', 'country');
  if (reg.error || !regName) {
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
  else {
    add('Legal Entity Identifier', best.status === 'ACTIVE' ? 'ok' : 'mismatch', `${best.legal_name}, LEI ${best.lei}, ${best.status}, ${best.city || ''} ${best.country || ''}${best.registered_as ? `, registered as ${best.registered_as}` : ''}.`, 'GLEIF public API');
    if (code && best.country && best.country !== code) add('Country', 'mismatch', `The listing says ${s.country}; the LEI record is in ${best.country}.`, 'GLEIF vs listing');
    if (s.claimed_registration && best.registered_as && best.registered_as.replace(/\W/g, '').toUpperCase() !== s.claimed_registration.replace(/\W/g, '').toUpperCase())
      add('Registration number', 'mismatch', `The listing or document gives ${s.claimed_registration}; GLEIF has ${best.registered_as} for ${best.legal_name}.`, 'GLEIF vs listing');
  }

  // 2. Sanctions
  const matched = pick(sanc.result, 'matched');
  const lists = pick(sanc.result, 'lists');
  if (sanc.error || matched === undefined) add('Sanctions', 'unverified', `The sanctions provider gave no usable answer${sanc.error ? ` (${sanc.error})` : ''}. Screening not done, so this is not a clean result.`, 'Telegraph SANCTIONS_SCREENING_MATCH_GENERAL');
  else if (matched === true || matched === 'true') add('Sanctions', 'stop', `Possible sanctions match${lists ? ` on ${[].concat(lists).join(', ')}` : ''}. Check the exact entry before any further contact; a name match can be a different party.`, `Telegraph SANCTIONS_SCREENING_MATCH_GENERAL (${sanc.miner || 'miner not named'})`);
  else add('Sanctions', 'ok', `No match reported${lists ? ` on ${[].concat(lists).join(', ')}` : ''}. One provider only.`, `Telegraph SANCTIONS_SCREENING_MATCH_GENERAL (${sanc.miner || 'miner not named'})`);

  // 3. Website
  if (!s.website) add('Company website', 'not_found', 'The listing gives no company website, only the marketplace storefront.', 'Listing');
  else if (!domain) add('Company website', 'unverified', `"${s.website}" is not a valid web address.`, 'Listing');
  else if (MARKETPLACE.test(domain)) add('Company website', 'not_found', `${domain} is the marketplace itself, not the company's own site.`, 'Listing');
  else {
    const verdict = web && pick(web.result, 'verdict', 'safe');
    if (!web || web.error || verdict === undefined) add('Website safety', 'unverified', `No usable website-safety answer for ${domain}${web && web.error ? ` (${web.error})` : ''}.`, 'Telegraph URL_SAFE_GENERAL');
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
  else if (has('mismatch') || !identityConfirmed || has('unverified')) { verdict = 'VERIFY FIRST'; why = identityConfirmed ? 'Some details disagree or could not be checked.' : 'The company behind the listing could not be confirmed from an independent register. Ask for the business licence and check it before paying, and use the marketplace\'s payment protection.'; }
  else { verdict = 'PROCEED WITH STANDARD CARE'; why = 'Identity confirmed from an independent register, no sanctions match, no red flags in the documents checked. This is not a guarantee of product quality.'; }

  const calls = [reg, sanc, web].filter(Boolean);
  const total = calls.reduce((t, c) => t + (c.cost_usd || 0), 0);
  return {
    input: s, verdict, why, findings,
    telegraph_calls: calls,
    free_sources: [{ source: 'GLEIF', url: lei.url, records: lei.records.length, error: lei.error || null }],
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
