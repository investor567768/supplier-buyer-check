import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigate, nameMatch, cc, domainOf, MARKETPLACE, allowRun } from '../api/check.js';

// Fake Telegraph and GLEIF. Nothing is bought in tests.
function mock({ registry, sanctions, url, identity, gleif = [], fail = {}, second = { matched: false, near_miss: false, verdict: 'CLEAR', lists: ['US Treasury OFAC SDN'] } }) {
  const calls = [];
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('praman-desk.vercel.app')) {
      if (second === 'down') throw new Error('down');
      return { ok: true, status: 200, json: async () => second };
    }
    if (u.includes('/lei-records/W38RGI023J3WT1HWRP32')) {
      return { ok: true, status: 200, json: async () => ({ data: { id: 'W38RGI023J3WT1HWRP32', attributes: { entity: { legalName: { name: 'Siemens Aktiengesellschaft' }, status: 'ACTIVE', legalAddress: { country: 'DE', city: 'Munich' }, registeredAs: 'HRB 6684' } } } }) };
    }
    if (u.includes('api.gleif.org')) {
      return { ok: true, status: 200, json: async () => ({ data: gleif.map(g => ({ id: g.lei, attributes: { entity: { legalName: { name: g.name }, status: g.status || 'ACTIVE', legalAddress: { country: g.country, city: g.city }, registeredAs: g.reg } } })) }) };
    }
    const b = JSON.parse(opts.body);
    calls.push(b.intent);
    if (u.endsWith('/731005')) globalThis.lastIdentityParams = b.params;
    if (fail[b.intent]) return { ok: false, status: 503, text: async () => JSON.stringify({ error: 'no_compatible_miner' }) };
    const result = { CORPORATE_REGISTRY_LOOKUP_GENERAL: registry, B2B_IDENTITY_ENRICHMENT: identity, SANCTIONS_SCREENING_MATCH_GENERAL: sanctions, URL_SAFE_GENERAL: url }[b.intent];
    return { ok: true, status: 200, text: async () => JSON.stringify({ miner_name: 'm-' + b.intent.slice(0, 4), result, result_shape: 'intent', cost_usd: 0.02, signal_hash: '0xabc', fulfillment: { status: 'complete', payments: [{ miner: 'm', intent: b.intent, amount_uusdc: 20000, receipt_hash: '0xr' }] } }) };
  };
  return calls;
}
const base = { supplier: 'Shenzhen Example Power Technology Co., Ltd.', country: 'China', city: 'Shenzhen', website: 'www.examplepower.com' };

test('name matching ignores legal suffixes and punctuation', () => {
  assert.equal(nameMatch('Shenzhen Example Power Technology Co., Ltd.', 'SHENZHEN EXAMPLE POWER TECHNOLOGY CO LTD'), 1);
  assert.ok(nameMatch('Shenzhen Example Power Co., Ltd.', 'Guangzhou Other Trading Co., Ltd.') < 0.5);
  assert.equal(cc('China'), 'CN');
  assert.equal(domainOf('https://www.Example.com/x'), 'example.com');
  assert.ok(MARKETPLACE.test('examplepower.en.alibaba.com'));
});

test('clean case: registry and LEI agree, no sanctions, safe site', async () => {
  const calls = mock({ registry: { legal_name: 'Shenzhen Example Power Technology Co., Ltd.', registration_id: '91440300XXXX', active: true, jurisdiction: 'CN' }, sanctions: { matched: false, lists: ['OFAC SDN'] }, url: { verdict: 'clean' } });
  const r = await investigate(base, 'k');
  assert.deepEqual(calls.sort(), ['B2B_IDENTITY_ENRICHMENT', 'CORPORATE_REGISTRY_LOOKUP_GENERAL', 'NEWS_SEARCH_GENERAL', 'SANCTIONS_SCREENING_MATCH_GENERAL', 'URL_SAFE_GENERAL']);
  assert.equal(r.verdict, 'PROCEED WITH STANDARD CARE');
  assert.equal(r.total_cost_usd, 0.1);
  assert.equal(r.telegraph_calls[0].payments[0].receipt_hash, '0xr');
});

test('invoice pays a different company: STOP', async () => {
  mock({ registry: { legal_name: base.supplier, active: true }, sanctions: { matched: false }, url: { verdict: 'clean' } });
  const r = await investigate({ ...base, invoice_beneficiary: 'Hong Kong Bright Star Trading Limited' }, 'k');
  assert.equal(r.verdict, 'STOP');
  assert.ok(r.findings.some(f => f.area === 'Payment beneficiary' && f.status === 'stop'));
});

test('registry not found and no LEI: VERIFY FIRST, never called clean', async () => {
  mock({ registry: null, sanctions: { matched: false }, url: { verdict: 'clean' }, fail: { CORPORATE_REGISTRY_LOOKUP_GENERAL: true } });
  const r = await investigate(base, 'k');
  assert.equal(r.verdict, 'VERIFY FIRST');
  assert.ok(r.findings.some(f => f.area === 'Registered identity' && f.status === 'not_found'));
});

test('sanctions provider silent: unverified, not clean', async () => {
  mock({ registry: { legal_name: base.supplier, active: true }, sanctions: null, url: { verdict: 'clean' }, fail: { SANCTIONS_SCREENING_MATCH_GENERAL: true } });
  const r = await investigate(base, 'k');
  assert.equal(r.verdict, 'VERIFY FIRST');
  assert.ok(r.findings.some(f => f.area === 'Sanctions' && f.status === 'unverified'));
});

test('sanctions match: STOP', async () => {
  mock({ registry: { legal_name: base.supplier, active: true }, sanctions: { matched: true, lists: ['OFAC SDN'] }, url: { verdict: 'clean' } });
  const r = await investigate(base, 'k');
  assert.equal(r.verdict, 'STOP');
});

test('storefront on the marketplace is not treated as a company website, and is not paid for', async () => {
  const calls = mock({ registry: { legal_name: base.supplier, active: true }, sanctions: { matched: false } });
  const r = await investigate({ ...base, website: 'examplepower.en.alibaba.com' }, 'k');
  assert.ok(!calls.includes('URL_SAFE_GENERAL'));
  assert.ok(r.findings.some(f => f.area === 'Company website' && f.status === 'not_found'));
});

test('registration number on the document disagrees with the register', async () => {
  mock({ registry: { legal_name: base.supplier, registration_id: '91440300AAAA', active: true }, sanctions: { matched: false }, url: { verdict: 'clean' } });
  const r = await investigate({ ...base, claimed_registration: '91440300BBBB' }, 'k');
  assert.equal(r.verdict, 'VERIFY FIRST');
  assert.ok(r.findings.some(f => f.area === 'Registration number' && f.status === 'mismatch'));
});

test('LEI found in another country is flagged', async () => {
  mock({ registry: null, sanctions: { matched: false }, url: { verdict: 'clean' }, fail: { CORPORATE_REGISTRY_LOOKUP_GENERAL: true }, gleif: [{ lei: 'X', name: base.supplier, country: 'HK', city: 'Hong Kong' }] });
  const r = await investigate(base, 'k');
  assert.ok(r.findings.some(f => f.area === 'Country' && f.status === 'check'));
});

test('missing supplier name is an input error', async () => {
  await assert.rejects(investigate({ country: 'China' }, 'k'), e => e.status === 400);
});

test('typed ask refused with 400: retries once in plain language and keeps the text answer, never scored clean', async () => {
  const bodies = [];
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    const b = JSON.parse(opts.body); bodies.push(b);
    if (b.intent) return { ok: false, status: 400, text: async () => JSON.stringify({ error: 'invalid request body' }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ miner_name: 'm', result: 'No match found on OFAC SDN.', cost_usd: 0.01 }) };
  };
  const r = await investigate(base, 'k');
  assert.ok(bodies.some(b => b.query));
  assert.ok(r.findings.some(f => f.area === 'Sanctions' && f.status === 'check'));
  assert.equal(r.verdict, 'VERIFY FIRST');
});

test('LEI only abroad is not used as the supplier identity', async () => {
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) {
      const home = u.includes('legalAddress.country');
      return { ok: true, status: 200, json: async () => ({ data: home ? [] : [{ id: 'L', attributes: { entity: { legalName: { name: 'Delta Electronics (Switzerland) AG' }, status: 'ACTIVE', legalAddress: { country: 'CH', city: 'Bern' } } } }] }) };
    }
    return { ok: false, status: 503, text: async () => '{"error":"no_compatible_miner"}' };
  };
  const r = await investigate({ supplier: 'Delta Electronics, Inc.', country: 'Taiwan' }, 'k');
  assert.ok(r.findings.some(f => f.area === 'Legal Entity Identifier' && f.status === 'not_found'));
  assert.notEqual(r.verdict, 'PROCEED WITH STANDARD CARE');
});

test('named specialists are asked directly by miner id; CLEAR/REVIEW/BLOCK verdicts are understood', async () => {
  const urls = [];
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    urls.push(u);
    if (u.endsWith('/731005')) return { ok: true, status: 200, text: async () => JSON.stringify({ miner_id: 731005, result: { legal_name: base.supplier, lei: '5299XYZ', status: 'ACTIVE' }, cost_usd: 0.01 }) };
    if (u.endsWith('/731002')) return { ok: true, status: 200, text: async () => JSON.stringify({ miner_id: 731002, result: { verdict: 'REVIEW' }, cost_usd: 0.01 }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: { verdict: 'clean' }, cost_usd: 0.01 }) };
  };
  const r = await investigate(base, 'k');
  assert.ok(urls.some(u => u.endsWith('/engine/ask/731005')));
  assert.ok(urls.some(u => u.endsWith('/engine/ask/731002')));
  assert.ok(r.findings.some(f => f.area === 'Sanctions' && f.status === 'check'));
  assert.equal(r.verdict, 'VERIFY FIRST');
});

test('specialist unreachable: falls back to the router', async () => {
  const urls = [];
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    urls.push(u);
    if (/\/7310\d\d$/.test(u)) return { ok: false, status: 503, text: async () => '{"error":"miner offline"}' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: { matched: false }, cost_usd: 0.01 }) };
  };
  const r = await investigate(base, 'k');
  assert.ok(urls.some(u => u.endsWith('/engine/ask')));
  assert.equal(r.telegraph_calls[1].form, 'router');
});

test('wrapped direct answers: cost and miner are read from inside; enrichment profile is shown, not treated as a register record', async () => {
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    const b = JSON.parse(opts.body);
    if (u.endsWith('/731005') && !b.intent) return { ok: true, status: 200, text: async () => JSON.stringify({ result: { miner_id: '731005', miner_name: 'Counterproof B2B Identity Enrichment', result: { company: null, employee_count: 320000, headquarters: 'Berlin' }, cost_usd: 0.01, signal_hash: '0xs' } }) };
    if (u.endsWith('/731005')) return { ok: false, status: 400, text: async () => 'Bad Request' };
    if (u.endsWith('/731002')) return { ok: true, status: 200, text: async () => JSON.stringify({ result: { miner_id: '731002', miner_name: 'Counterproof Sanctions Screener', result: { name: 'Siemens AG', matched: false, lists: ['US OFAC SDN'] }, cost_usd: 0.01 } }) };
    return { ok: false, status: 400, text: async () => 'Bad Request' };
  };
  const r = await investigate({ supplier: 'Siemens AG', country: 'Germany', city: 'Munich' }, 'k');
  assert.equal(r.telegraph_calls[0].miner, 'Counterproof B2B Identity Enrichment');
  assert.equal(r.telegraph_calls[0].cost_usd, 0.01);
  assert.equal(r.telegraph_calls[0].signal_hash, '0xs');
  assert.ok(r.findings.some(f => f.area === 'Company profile'));
  assert.ok(r.findings.some(f => f.area === 'Headquarters vs listing'));
  assert.ok(r.findings.some(f => f.area === 'Sanctions' && f.status === 'ok'));
  assert.equal(r.total_cost_usd, 0.02);
});

test('LEI: "Siemens AG" is not matched to "Siemens Healthineers AG"', async () => {
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [
      { id: 'H', attributes: { entity: { legalName: { name: 'Siemens Healthineers AG' }, status: 'ACTIVE', legalAddress: { country: 'DE', city: 'München' } } } },
      { id: 'S', attributes: { entity: { legalName: { name: 'Siemens Aktiengesellschaft' }, status: 'ACTIVE', legalAddress: { country: 'DE', city: 'Berlin' } } } },
      { id: 'A', attributes: { entity: { legalName: { name: 'SIEMENS AG' }, status: 'ACTIVE', legalAddress: { country: 'DE', city: 'München' }, registeredAs: 'HRB 6684' } } },
    ] }) };
    return { ok: false, status: 400, text: async () => 'Bad Request' };
  };
  const r = await investigate({ supplier: 'Siemens AG', country: 'Germany' }, 'k');
  const f = r.findings.find(x => x.area === 'Legal Entity Identifier');
  assert.ok(/LEI (A|S),/.test(f.text) && !/Healthineers/.test(f.text), f.text);
});

test('legal-form words in other languages are ignored: Siemens AG = Siemens Aktiengesellschaft', async () => {
  const { nameMatch } = await import('../api/check.js');
  assert.equal(nameMatch('Siemens AG', 'Siemens Aktiengesellschaft'), 1);
});


test('order and claims: capacity cannot meet the deadline, unproven certificate, years contradicted by the register', async () => {
  const realNow = Date.now;
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    const b = JSON.parse(opts.body);
    const R = {
      CORPORATE_REGISTRY_LOOKUP_GENERAL: u.endsWith('/731005') ? { employee_count: 120, headquarters: 'Shenzhen' } : { legal_name: base.supplier, registration_id: '91440300X', active: true, incorporated: '2021-03-01' },
      SANCTIONS_SCREENING_MATCH_GENERAL: { matched: false },
      URL_SAFE_GENERAL: { verdict: 'Safe' },
      WEB_SEARCH_GENERAL: { answer: 'Shenzhen Example Power Technology lists CE marking for its inverters and ships to Germany.', sources: [] },
      NEWS_SEARCH_GENERAL: { answer: 'No relevant coverage.', result_count: 0 },
    }[b.intent || 'CORPORATE_REGISTRY_LOOKUP_GENERAL'];
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: R, cost_usd: 0.01 }) };
  };
  const r = await investigate({ ...base, product: '7.5kW inverter', quantity: '10,000', deadline_days: 60, claimed_monthly_capacity: 3000,
    claimed_certifications: 'CE, ISO 9001', claimed_export_markets: 'Germany, Brazil', claimed_years: 15 }, 'k');
  const f = a => r.findings.find(x => x.area === a);
  assert.equal(f('Can they fulfil the order').status, 'mismatch');
  assert.equal(f('Claim: CE').status, 'check');
  assert.equal(f('Claim: ISO 9001').status, 'not_found');
  assert.equal(f('Claim: exports to Germany').status, 'check');
  assert.equal(f('Claim: exports to Brazil').status, 'not_found');
  assert.equal(f('Claim: years in business').status, 'mismatch');
  assert.equal(f('Disputes and adverse news').status, 'ok');
  assert.equal(r.verdict, 'VERIFY FIRST');
  assert.equal(typeof r.score, 'number');
});

test('wrong company from the registry is not used for years; generic-word news is not flagged', async () => {
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    const b = JSON.parse(opts.body);
    const R = {
      CORPORATE_REGISTRY_LOOKUP_GENERAL: u.endsWith('/731005') ? { company: null } : { legal_name: 'SHENZHEN LDROBOT CO.,LTD', registration_id: '91440300MA5ETL7D53', active: false, incorporated: '2017-10-31' },
      SANCTIONS_SCREENING_MATCH_GENERAL: { matched: false },
      WEB_SEARCH_GENERAL: { answer: 'CE marked VFDs' },
      NEWS_SEARCH_GENERAL: { brief: 'Recent coverage of "Yueqing Haiyin Electric Co., Ltd." fraud OR dispute OR lawsuit OR recall OR scam includes: "Hawaiian Electric warns customers that online and phone scams increase"' },
    }[b.intent || 'CORPORATE_REGISTRY_LOOKUP_GENERAL'];
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: R, cost_usd: 0.01 }) };
  };
  const r = await investigate({ supplier: 'Yueqing Haiyin Electric Co., Ltd.', country: 'China', claimed_years: 4, claimed_certifications: 'CE' }, 'k');
  const f = a => r.findings.find(x => x.area === a);
  assert.equal(f('Claim: years in business').status, 'not_found');
  assert.match(f('Registered identity').text, /different company/); assert.equal(f('Registered identity').status, 'unverified');
  assert.equal(f('Disputes and adverse news').status, 'ok');
});

test('money at risk: STOP shows the deposit the check protects', async () => {
  mock({ registry: { legal_name: base.supplier, active: true }, sanctions: { matched: false }, url: { verdict: 'clean' } });
  const r = await investigate({ ...base, quantity: '10000', unit_price: '180', invoice_beneficiary: 'Hong Kong Bright Star Trading Limited' }, 'k');
  assert.equal(r.verdict, 'STOP');
  assert.equal(r.money.order_value, 1800000);
  assert.equal(r.money.deposit_at_risk, 540000);
  assert.match(r.money.summary, /\$540,000/);
});

test('seller size: 70 staff cannot make 10,000 units in 60 days; 390 staff can; trader flagged', async () => {
  mock({ registry: { legal_name: base.supplier, active: true }, sanctions: { matched: false }, url: { verdict: 'clean' } });
  const small = await investigate({ ...base, quantity: 10000, deadline_days: 60, staff: 70, factory_m2: 2100, business_type: 'Manufacturer, Trading Company' }, 'k');
  const big = await investigate({ ...base, quantity: 10000, deadline_days: 60, staff: 390, factory_m2: 58000, business_type: 'Manufacturer' }, 'k');
  assert.equal(small.findings.find(f => f.area === 'Seller size vs order').status, 'mismatch');
  assert.ok(small.findings.some(f => f.area === 'Manufacturer or trader'));
  assert.equal(big.findings.find(f => f.area === 'Seller size vs order').status, 'ok');
  assert.ok(big.score > small.score);
});

test('free-use brake: 5 runs per visitor per day, then refused, then reset next day', () => {
  const ip = 'test-ip-1';
  for (let i = 0; i < 5; i++) assert.equal(allowRun(ip, '2026-12-01').ok, true);
  assert.equal(allowRun(ip, '2026-12-01').ok, false);
  assert.equal(allowRun('test-ip-2', '2026-12-01').ok, true);
  assert.equal(allowRun(ip, '2026-12-02').ok, true);
});

test('identity provider: new schema, not found is reported as not found, never clean', async () => {
  mock({ identity: { found: false, legal_name: null, lei: null, confidence: 0.4, source: 'no registered entity whose legal name matches the query' }, sanctions: { matched: false }, url: { verdict: 'clean' } });
  const r = await investigate(base, 'k');
  const f = r.findings.find(x => x.area === 'Identity provider');
  assert.equal(f.status, 'not_found');
  assert.match(f.text, /Not found is not the same as clean/);
  assert.notEqual(r.verdict, 'PROCEED WITH STANDARD CARE');
  assert.deepEqual(Object.keys(globalThis.lastIdentityParams || {}), ['name']);
});

test('identity provider returns an LEI: GLEIF is looked up by that LEI (Siemens AG vs Siemens Aktiengesellschaft)', async () => {
  mock({ identity: { found: true, legal_name: 'Siemens Aktiengesellschaft', lei: 'W38RGI023J3WT1HWRP32', jurisdiction: 'DE', legal_form: 'AG', confidence: 0.95, source: 'GLEIF' }, sanctions: { matched: false }, url: { verdict: 'clean' } });
  const r = await investigate({ supplier: 'Siemens AG', country: 'Germany', city: 'Munich', website: 'www.siemens.com' }, 'k');
  const idf = r.findings.find(x => x.area === 'Identity provider');
  assert.equal(idf.status, 'ok');
  const lei = r.findings.find(x => x.area === 'Legal Entity Identifier');
  assert.equal(lei.status, 'ok');
  assert.match(lei.text, /W38RGI023J3WT1HWRP32/);
  assert.match(lei.source, /by the LEI the identity provider returned/);
});

test('register answer carries an LEI: GLEIF is looked up by it, unrated website is not ok', async () => {
  mock({ registry: { legal_name: 'Siemens AG', registration_id: 'W38RGI023J3WT1HWRP32', active: true, jurisdiction: 'DE-BY' }, sanctions: { matched: false }, url: { verdict: 'Unknown' } });
  const r = await investigate({ supplier: 'Siemens AG', country: 'Germany', city: 'Munich', website: 'www.siemens.com' }, 'k');
  assert.equal(r.findings.find(x => x.area === 'Legal Entity Identifier').status, 'ok');
  assert.equal(r.findings.find(x => x.area === 'Website safety').status, 'unverified');
});

// ---------- #12: second sanctions opinion, judged answers, purchase decision ----------
const siemens = { supplier: 'Siemens Aktiengesellschaft', country: 'Germany', city: 'Munich', quantity: '100', unit_price: '50', deposit_pct: '30' };
const siemensGleif = [{ lei: 'W38RGI023J3WT1HWRP32', name: 'Siemens Aktiengesellschaft', country: 'DE', city: 'Munich', reg: 'HRB 6684' }];

test('clean supplier, both sanctions providers clear: purchase authorised with a sandbox receipt', async () => {
  mock({ registry: { legal_name: 'Shenzhen Example Power Technology Co., Ltd.', registration_id: '91440300XXXX', active: true, jurisdiction: 'CN' }, sanctions: { matched: false, lists: ['OFAC SDN'] }, url: { verdict: 'clean' } });
  const r = await investigate({ ...base, quantity: '1000', unit_price: '10', deposit_pct: '30', claimed_monthly_capacity: '5000', deadline_days: '60' }, 'k');
  assert.equal(r.verdict, 'PROCEED WITH STANDARD CARE');
  assert.equal(r.purchase.decision, 'authorised');
  assert.equal(r.purchase.amount_usd, 3000);
  assert.match(r.purchase.receipt.id, /^SBX-[0-9A-F]{8}$/);
  assert.match(r.purchase.mode, /sandbox/);
  assert.ok(r.findings.some(f => f.area === 'Sanctions agreement' && f.status === 'ok'));
  assert.equal(r.answer_reviews.find(x => x.intent === 'SANCTIONS_SCREENING_MATCH_GENERAL').decision, 'accepted');
});

test('registry miner gives the LEI as the registration number: answer rejected against GLEIF', async () => {
  mock({ registry: { legal_name: 'Siemens Aktiengesellschaft', registration_id: 'W38RGI023J3WT1HWRP32', jurisdiction: 'DE' }, sanctions: { matched: false }, gleif: siemensGleif });
  const r = await investigate(siemens, 'k');
  const rv = r.answer_reviews.find(x => x.intent === 'CORPORATE_REGISTRY_LOOKUP_GENERAL');
  assert.equal(rv.decision, 'rejected');
  assert.match(rv.reason, /HRB 6684/);
  assert.equal(r.register.lei, 'W38RGI023J3WT1HWRP32');
});

test('registry miner agrees with GLEIF: answer accepted', async () => {
  mock({ registry: { legal_name: 'Siemens Aktiengesellschaft', registration_id: 'HRB 6684', jurisdiction: 'DE' }, sanctions: { matched: false }, gleif: siemensGleif });
  const r = await investigate(siemens, 'k');
  assert.equal(r.answer_reviews.find(x => x.intent === 'CORPORATE_REGISTRY_LOOKUP_GENERAL').decision, 'accepted');
});

test('second provider flags a near match the first missed: disputed, payment held', async () => {
  mock({ registry: { legal_name: 'Shenzhen Example Power Technology Co., Ltd.', registration_id: '9144', active: true }, sanctions: { matched: false }, url: { verdict: 'clean' },
    second: { matched: false, near_miss: true, review_required: true, verdict: 'NEAR_MISS_REVIEW', potential_matches: [{ matched_name: 'BOUT, Viktor Anatolijevitch' }], lists: ['US Treasury OFAC SDN'] } });
  const r = await investigate(base, 'k');
  assert.equal(r.verdict.startsWith('VERIFY'), true);
  assert.equal(r.purchase.decision, 'held');
  assert.equal(r.purchase.receipt, undefined);
  assert.ok(r.findings.some(f => f.area === 'Sanctions, second opinion' && f.status === 'check' && /BOUT/.test(f.text)));
  assert.equal(r.answer_reviews.find(x => x.intent === 'SANCTIONS_SCREENING_MATCH_GENERAL').decision, 'disputed');
});

test('second provider unreachable: never treated as clear', async () => {
  mock({ registry: { legal_name: 'Shenzhen Example Power Technology Co., Ltd.', registration_id: '9144', active: true }, sanctions: { matched: false }, url: { verdict: 'clean' }, second: 'down' });
  const r = await investigate(base, 'k');
  assert.notEqual(r.verdict, 'PROCEED WITH STANDARD CARE');
  assert.equal(r.purchase.decision, 'held');
});

test('second provider reports a match: STOP and purchase blocked', async () => {
  mock({ registry: { legal_name: 'Shenzhen Example Power Technology Co., Ltd.', registration_id: '9144', active: true }, sanctions: { matched: false },
    second: { matched: true, match_found: true, matches: [{ matched_name: 'EXAMPLE POWER' }], lists: ['US Treasury OFAC SDN'] } });
  const r = await investigate({ ...base, quantity: '10', unit_price: '10' }, 'k');
  assert.equal(r.verdict, 'STOP');
  assert.equal(r.purchase.decision, 'blocked');
  assert.match(r.purchase.reason, /Sanctions, second opinion/);
});
