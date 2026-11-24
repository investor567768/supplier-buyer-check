# Supplier Buyer Check

Found a supplier on a marketplace such as Alibaba.com? Check the company behind the listing before you pay.

You enter what the listing and the invoice say. The app buys registry, sanctions and website-safety answers from Telegraph providers, reads the free GLEIF register, compares everything in code and gives one recommendation: **STOP**, **VERIFY FIRST** or **PROCEED WITH STANDARD CARE**. Every finding names its source, every paid call shows its cost and receipt, and "not found" is never called clean.

**Track:** Apps & Agents · **Network:** Telegraph testnet · **Live:** (Vercel link) · Sister app: [Supplier.Detective](https://telegraph-supplier-detective.vercel.app/), the Mind that checks invoices against purchase orders.

## What it checks
| Check | Source | Paid? |
|---|---|---|
| Registered identity | Telegraph `CORPORATE_REGISTRY_LOOKUP_GENERAL` | yes |
| Legal Entity Identifier, country, registration number | GLEIF public API | free |
| Sanctions | Telegraph `SANCTIONS_SCREENING_MATCH_GENERAL` | yes |
| Website safety (company's own site, not the storefront) | Telegraph `URL_SAFE_GENERAL` | yes |
| Invoice account holder and bank country vs the listing | compared in code | free |

It does not check ownership, reviews or product quality.

## How it uses Telegraph
The server calls `POST https://backend.telegraphprotocol.com/engine/ask` with an Anjoman API key. Each call names the Intent and typed params, with a budget cap of 0.10 USD (`max_budget_usdc: 100000`). It is paid from the account's escrow balance. The response's miner, cost, signal hash and `fulfillment.payments` receipts are kept in the report. See [api/check.js](api/check.js).

## Run it yourself
1. Fork this repo and import it into Vercel (framework preset: Other).
2. In Vercel, Settings, Environment Variables, add `TELEGRAPH_API_KEY` (create one at anjoman.ai, dashboard, API keys; fund the balance first) and `RUN_PASSCODE` (any phrase; protects your balance).
3. Deploy, open the site, fill in a listing and press **Check this supplier**.
4. Tests, no network and nothing bought: `npm test` (Node 18+).

## Limits
- Testnet only. Some providers may not answer; the report says so and does not treat silence as clean.
- Registry coverage for small manufacturers, especially in mainland China, is limited. A missing record means "verify the business licence yourself", not "fraud".
- Investigations of real suppliers are based only on independently verifiable public information. No accusation is made about any company.
