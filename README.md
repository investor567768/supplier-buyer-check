# Supplier Buyer Check

Found a supplier on a marketplace such as Alibaba.com? Check the company behind the listing before you pay.

You paste the supplier's marketplace page and enter your order. The app buys registry, sanctions, web-search and news answers from Telegraph providers, reads the free GLEIF register, compares everything in code and gives one recommendation: **STOP**, **VERIFY FIRST** or **PROCEED WITH STANDARD CARE**. Every finding names its source, every paid call shows its cost and receipt, and "not found" or "not checked" is never called clean. The report puts a dollar figure on the deposit at risk, and several suppliers can be ranked side by side for the same order.

**Track:** Apps & Agents (Alibaba use case 1, Intelligent Supplier Discovery & Verification) · **Network:** Telegraph testnet · **Live:** https://supplier-buyer-check.vercel.app · Sister app: [Supplier.Detective](https://telegraph-supplier-detective.vercel.app/), the Mind that checks invoices against purchase orders.

## Results

Three real Alibaba pump-control suppliers (shown as A, B and C), one 10,000-unit order, five live runs, $0.12 in total Telegraph spend, with a comparison against a strong AI model alone, including where the AI did well. See **[results/RESULTS.md](results/RESULTS.md)**.

Headlines:
- Supplier C's capacity does not fit the order (about 5,000 units a month needed, about 2,500 supportable at 100 staff) and it lists itself as both manufacturer and trading company.
- An invoice that pays a different account holder returns **STOP**, shown as a labelled illustration.
- The plain AI reached the same ranking and gave good payment advice. Its "none are on sanctions lists" claim had no live check behind it, which it admitted when asked.
- Telegraph's router often did not answer within 25 s. Those checks show as "not checked", never as clean.

## What it checks
| Check | Source | Paid? |
|---|---|---|
| Business profile | Telegraph `CORPORATE_REGISTRY_LOOKUP_GENERAL`, miner 731005 | yes |
| Registered identity | Telegraph `CORPORATE_REGISTRY_LOOKUP_GENERAL`, router | yes |
| Legal Entity Identifier, country | GLEIF public API | free |
| Sanctions (OFAC SDN and non-SDN, UN, EU, UK, with list dates) | Telegraph `SANCTIONS_SCREENING_MATCH_GENERAL`, miner 731002 | yes |
| Website safety (company's own site, not the storefront) | Telegraph `URL_SAFE_GENERAL` | yes |
| Evidence behind each claimed certification and export market | Telegraph `WEB_SEARCH_GENERAL` | yes |
| Fraud, lawsuits or recalls in the news | Telegraph `NEWS_SEARCH_GENERAL` | yes |
| Order size vs seller size, manufacturer or trader | compared in code | free |
| Invoice account holder and bank country vs the listing | compared in code | free |
| Money at risk (quantity x unit price x deposit %) | computed | free |

It does not check ownership, reputation or product quality.

## How it uses Telegraph
The server calls `POST https://backend.telegraphprotocol.com/engine/ask` (router) and `/engine/ask/{minerId}` (direct) with an Anjoman API key. Identity and sanctions go straight to the named specialist miners; registry, web search and news go through the router. Each call has a 25 s timeout and is not retried after a timeout. The response's miner, cost, signal hash and receipts are kept in the report. See [api/check.js](api/check.js).

A registry provider once returned a record for a different company. The app compares names and treats a mismatch as a provider error, never as evidence against the supplier.

## Run it yourself
1. Fork this repo and import it into Vercel (framework preset: Other).
2. In Vercel, Settings, Environment Variables, add `TELEGRAPH_API_KEY` (create one at anjoman.ai, dashboard, API keys; fund the balance first) and `RUN_PASSCODE` (any phrase; protects your balance).
3. Deploy, open the site, copy a supplier's Alibaba page (Ctrl+A, Ctrl+C), paste it into "Fill it in for me", enter your order and press **Check this supplier**.
4. Tests, no network and nothing bought: `npm test` (Node 18+).

## Limits
- Testnet only. Providers may not answer; the report says so and does not treat silence as clean.
- Registry coverage for small manufacturers, especially in mainland China, is limited. A missing record means "ask for the business licence and Unified Social Credit Code", not "fraud".
- The app checks suppliers the buyer already found. It does not discover suppliers, and it does not monitor them after the order starts.
- Investigations of real suppliers use only independently verifiable public information, and the results show them as A, B and C. No accusation is made about any company.
