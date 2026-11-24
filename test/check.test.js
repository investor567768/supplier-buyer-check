import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigate, nameMatch, cc, domainOf, MARKETPLACE } from '../api/check.js';

// Fake Telegraph and GLEIF. Nothing is bought in tests.
function mock({ registry, sanctions, url, gleif = [], fail = {} }) {
  const calls = [];
  globalThis.fetch = async (u, opts = {}) => {
    u = String(u);
    if (u.includes('api.gleif.org')) {
      return { ok: true, status: 200, json: async () => ({ data: gleif.map(g => ({ id: g.lei, attributes: { entity: { legalName: { name: g.name }, status: g.status || 'ACTIVE', legalAddress: { country: g.country, city: g.city }, registeredAs: g.reg } } })) }) };
    }
    const b = JSON.parse(opts.body);
    calls.push(b.intent);
    if (fail[b.intent]) return { ok: false, status: 503, text: async () => JSON.stringify({ error: 'no_compatible_miner' }) };
    const result = { CORPORATE_REGISTRY_LOOKUP_GENERAL: registry, SANCTIONS_SCREENING_MATCH_GENERAL: sanctions, URL_SAFE_GENERAL: url }[b.intent];
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
  assert.deepEqual(calls.sort(), ['CORPORATE_REGISTRY_LOOKUP_GENERAL', 'SANCTIONS_SCREENING_MATCH_GENERAL', 'URL_SAFE_GENERAL']);
  assert.equal(r.verdict, 'PROCEED WITH STANDARD CARE');
  assert.equal(r.total_cost_usd, 0.06);
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
  assert.ok(r.findings.some(f => f.area === 'Registered identity' && f.status === 'ok'));
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
  assert.equal(r.telegraph_calls[1].form, 'intent (router)');
});
