# Supplier Buyer Check

Found a supplier on a marketplace such as Alibaba.com? Check the company behind the listing before you pay.

You paste the supplier's marketplace page and enter your order. The app buys registry, sanctions, web-search and news answers from Telegraph providers, reads the free GLEIF register, compares everything in code and gives one recommendation: **STOP**, **VERIFY FIRST** or **PROCEED WITH STANDARD CARE**. Every finding names its source, every paid call shows its cost and receipt, and "not found" or "not checked" is never called clean. The report puts a dollar figure on the deposit at risk, and several suppliers can be ranked side by side for the same order.

**Track:** Apps & Agents (Alibaba use case 1, Intelligent Supplier Discovery & Verification, and commercial use case 12, Verified Autonomous Procurement) · **Network:** Telegraph testnet · **Live:** https://supplier-buyer-check.vercel.app · **Missions:** 07 (marketplace agents verifying each other before money moves) and 08 (counterparty provenance with receipts).

Supplier Buyer Check is a spin-off of [Supplier.Detective](https://telegraph-supplier-detective.vercel.app/), my earlier Apps & Agents entry: a Mind that checks invoices against purchase orders. Supplier Buyer Check reuses its approach to buying and cross-checking Telegraph answers (major reused component, disclosed per the rules) and moves it to an earlier moment: before a buyer pays a supplier they found on a marketplace.


**Demo video (2 min, on X):** https://x.com/kingChrys494/status/2125641607001301415

**Judges, start here.** No wallet, login or passcode. Anyone gets 5 free checks a day (150 a day across all visitors), paid from a testnet balance.

| Run it | Check it | Inspect the payment | Break it | Reproduce it |
|---|---|---|---|---|
| [supplier-buyer-check.vercel.app](https://supplier-buyer-check.vercel.app): click an example or paste a listing, press **Check this supplier** | Each finding names its source; "not found" and "not checked" are never shown as clean | "Telegraph requests and receipts": intent, miner, cost, signal hash and the raw answer | Click **Invoice pays someone else** (invented company and payee): the verdict must be STOP | `npm test` (32 tests, nothing bought), or fork and deploy with your own key |

## Commercial use case 12: Verified Autonomous Procurement
This is the use case I claimed in the Commercial Use Cases thread. The brief, in its own words:

> Build an agent that independently investigates merchants, suppliers, products, pricing and contractual conditions before making an authorised payment. After the purchase, verify whether the merchant actually delivered what was agreed. Demonstrate an unsuitable purchase being prevented, an appropriate purchase being completed and the resulting deliverable being independently assessed.

| The brief asks for | What this app does | See it |
|---|---|---|
| Independently investigates the supplier before payment | Buys register, identity, sanctions, website, web and news answers from Telegraph providers and compares them with GLEIF, the listing and the invoice | **Check supplier** |
| Pricing and contractual conditions | Quantity, price, deposit and deadline give the money at risk; the order is compared with the supplier's claimed capacity; the invoice account holder is compared with the listing | **Check supplier** |
| An unsuitable purchase being prevented | The agent decides **Purchase blocked** and pays nothing | Button **See a purchase blocked** (Rosoboronexport, a sanctioned arms exporter) |
| An appropriate purchase being completed | The agent decides **Purchase authorised** and records a sandbox receipt for the deposit | Button **See a purchase authorised** (Siemens) |
| The deliverable independently assessed | The delivered report is checked field by field against the GLEIF register by the Telegraph evaluator ([telegraph-evaluator](https://github.com/investor567768/telegraph-evaluator), Evaluators track, truth source for `TASK_EXECUTION_QUALITY_GENERAL`). A wrong or incomplete delivery is refused and the balance stays unpaid | Button **See a delivery checked**, then **Wrong facts** or **Missing fields** |

Three things make the agent's decision more than one provider's word:
- **Two sanctions opinions.** The name is screened by two providers built by different people: Telegraph `SANCTIONS_SCREENING_MATCH_GENERAL` (miner 731002) and Praman Desk's sanctions miner #6164 by antikunpiece. A match from either stops the purchase. A near miss from either, or one provider not answering, holds the payment. The supplier is only treated as clear when both agree.
- **Every answer the agent buys is judged.** The "Answers the agent bought" table shows each answer as Accepted, Rejected, Disputed or Not checkable, with the reason. Example from the live run: the register provider gave the LEI where the registration number was asked, and GLEIF says HRB 6684. That answer is rejected and is not held against the supplier.
- **Sandbox is separate from production.** See the table below.

| Sandbox (test only) | Production |
|---|---|
| Telegraph runs on testnet; paid answers use test credit | Not used |
| The purchase decision and its receipt (`SBX-...`) are test records: **no money moves** | No payment is made anywhere |
| The delivery check reads the real GLEIF register | GLEIF is a real, public register |

**Expected results, live.** Providers sometimes do not answer within 25 seconds. The agent then shows **Payment held** and says which answer is missing; it never pays on a missing answer. Press **Check this supplier** again to retry.

## Try it in two minutes
1. Open the site, click the example **Siemens AG (Germany)**, then **Check this supplier**.
   Expected: identity confirmed from the register and from GLEIF (Siemens Aktiengesellschaft, LEI W38RGI023J3WT1HWRP32); anything a provider could not answer shows as "not checked", so the verdict may still be VERIFY FIRST.
2. Click **Invoice pays someone else** (invented company and payee) and run it.
   Expected: **STOP**, with a "Payment beneficiary" finding, and the money at risk (30% of the order) named.
3. Failure case: clear the invoice fields and run the invented company alone.
   Expected: **VERIFY FIRST**, "not found" for the register and LEI, and never a clean result.

Each check makes up to six paid Telegraph calls of about $0.01 each in testnet credit and takes up to a minute.

## Commercial summary
- **Who is it for?** A small importer about to pay a deposit to a marketplace supplier they found online.
- **What does it improve?** Instead of a dozen tabs, or an AI answer with no source, it buys identity and sanctions answers from Telegraph's specialist providers, compares them with the listing, the free GLEIF register and the buyer's invoice, and puts a dollar figure on the money at risk.
- **What does it do today?** Five live runs on three real suppliers, $0.12 in total: four VERIFY FIRST, one STOP (labelled illustration). See [results/RESULTS.md](results/RESULTS.md).
- **Why would someone adopt it?** A run costs cents against a deposit of thousands, and every finding can be checked without trusting the app.
- **How can someone try it?** The live link above, or fork it and deploy with your own Anjoman key (see "Run it yourself").

## What's real and what's illustrated
| Real and live | Illustrated, testnet or self-measured |
|---|---|
| Paid Telegraph answers, each with a signal hash and cost | Payments are testnet credit, not production usage or real money |
| Three real Alibaba suppliers, shown as A, B and C | The invoice paying "Sunrise Trading Ltd" in run 5 is invented and labelled |
| GLEIF register lookups (free, public) | The seller-size benchmark (25 units per worker per month) is a rough rule of thumb |
| Sanctions lists named with their publication dates | The comparison with a plain AI model is one model on three suppliers: an illustration, not a rate |

**Independent testing (26 Nov 2026):** antikunpiece, the builder of Praman Desk (a separate Telegraph entry), ran live tests against this app's API (`/api/check`) and saved the results in his own repo. Siemens Aktiengesellschaft (Munich) came back HTTP 200, matched to the active registry record HRB 6684 and LEI W38RGI023J3WT1HWRP32. He also found a gap: for "Viktor But" the sanctions provider this app asked returned no match, while his own screener flags a near-miss with OFAC entry BOUT, Viktor Anatolijevitch (UID 8279), a spelling the single provider missed. *Disclosure:* this was a mutual test. I also tested Praman Desk and reported two bugs, which he fixed; I reran the Viktor But fix on 27 Nov and it returns `NEAR_MISS_REVIEW`. No other paying or independent use is confirmed yet.

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
| Business profile | Telegraph identity miner 731005 (Counterproof B2B Identity Enrichment), asked directly; it currently answers the plain-language form | yes |
| Registered identity | Telegraph `CORPORATE_REGISTRY_LOOKUP_GENERAL`, router | yes |
| Legal Entity Identifier, country | GLEIF public API, by name and by the LEI a provider returns | free |
| Sanctions (OFAC SDN and non-SDN, UN, EU, UK, with list dates) | Telegraph `SANCTIONS_SCREENING_MATCH_GENERAL`, miner 731002 | yes |
| Website safety (company's own site, not the storefront; a site the provider cannot rate is shown as not checked) | Telegraph `URL_SAFE_GENERAL` | yes |
| Evidence behind each claimed certification and export market | Telegraph `WEB_SEARCH_GENERAL` | yes |
| Fraud, lawsuits or recalls in the news | Telegraph `NEWS_SEARCH_GENERAL` | yes |
| Second sanctions opinion | Praman Desk sanctions miner #6164 (antikunpiece), read from its public endpoint (not bought through Telegraph, so no receipt) | free |
| Order size vs seller size, manufacturer or trader | compared in code | free |
| Invoice account holder and bank country vs the listing | compared in code | free |
| The delivery (after the purchase) | Telegraph evaluator `/api/delivery-check`, compared with the GLEIF API | free |
| Money at risk (quantity x unit price x deposit %) | computed | free |

It does not check ownership, reputation or product quality.

## How it uses Telegraph
The server calls `POST https://backend.telegraphprotocol.com/engine/ask` (router) and `/engine/ask/{minerId}` (direct) with an Anjoman API key. Identity and sanctions go straight to the named specialist miners; registry, web search and news go through the router. Each call has a 25 s timeout and is not retried after a timeout. The response's miner, cost, signal hash and receipts are kept in the report. See [api/check.js](api/check.js).

A registry provider once returned a record for a different company. The app compares names and treats a mismatch as a provider error, never as evidence against the supplier.

## Run it yourself
1. Fork this repo and import it into Vercel (framework preset: Other).
2. In Vercel, Settings, Environment Variables, add `TELEGRAPH_API_KEY` (create one at anjoman.ai, dashboard, API keys; fund the balance first). Spending limits: without further settings the site allows 5 checks per visitor and 150 in total per day (change with `RUNS_PER_IP_PER_DAY` and `RUNS_ALL_PER_DAY`). Optional `RUN_PASSCODE` lets you skip the limit yourself.
3. Deploy, open the site, copy a supplier's Alibaba page (Ctrl+A, Ctrl+C), paste it into "Fill it in for me", enter your order and press **Check this supplier**.
4. Tests, no network and nothing bought: `npm test` (Node 18+).

## Updates
Each update below is public and dated, so you can check when it was posted.

- **27 Nov 2026:** use case 12 added. A second sanctions opinion (Praman Desk miner #6164), judged answers, a purchase decision with a sandbox receipt, and the delivery check from the Evaluators entry. New menu and plainer wording on the site. Tests: 32 passing.
- **27 Nov 2026:** independent test by antikunpiece (Praman Desk) recorded above, with the Viktor But sanctions gap it exposed. That gap is why the second sanctions opinion was added.
- **25 Nov 2026:** the demo video and first results, posted on X (https://x.com/kingChrys494/status/2125641607001301415) and in the Telegraph Discord showcase.

## Limits
- Praman Desk's sanctions miner is read from its public URL. It is a second opinion, not a Telegraph purchase, and its list date (`sdn_last_loaded`) is shown with the result.
- The delivery check compares a supplier's report with the GLEIF register: legal name, LEI, registration number, jurisdiction, status and addresses. It cannot judge product quality.
- Testnet only. Providers may not answer; the report says so and does not treat silence as clean.
- Registry coverage for small manufacturers, especially in mainland China, is limited. A missing record means "ask for the business licence and Unified Social Credit Code", not "fraud".
- The app checks suppliers the buyer already found. It does not discover suppliers, and it does not monitor them after the order starts.
- Investigations of real suppliers use only independently verifiable public information, and the results show them as A, B and C. No accusation is made about any company.
