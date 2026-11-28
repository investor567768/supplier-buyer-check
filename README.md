# Supplier Buyer Check

Found a supplier on a marketplace such as Alibaba.com? Check the company behind the listing before you pay.

You paste the supplier's marketplace page and enter your order. The app buys registry, sanctions, web-search and news answers from Telegraph providers, reads the free GLEIF register, compares everything in code and gives one recommendation: **STOP**, **VERIFY FIRST** or **PROCEED WITH STANDARD CARE**. Every finding names its source, every paid call shows its cost and receipt, and "not found" or "not checked" is never called clean. The report puts a dollar figure on the deposit at risk, and several suppliers can be ranked side by side for the same order.

**Track:** Apps & Agents (Alibaba use case 1, Intelligent Supplier Discovery & Verification, and commercial use case 12, Verified Autonomous Procurement) · **Network:** Telegraph testnet · **Live:** https://supplier-buyer-check.vercel.app · **Missions:** 07 (marketplace agents verifying each other before money moves) and 08 (counterparty provenance with receipts).

## What we built

**The problem.** Small businesses that buy from marketplace suppliers often pay a deposit to a company they have never checked. If the supplier is fake, sanctioned, or sends an invoice with someone else's bank details, the deposit is gone. Checking by hand means opening registers, sanctions lists and news sites one by one, so most buyers skip it.

**What it does.** Supplier Buyer Check is an AI buyer. Before any money moves, it investigates the supplier: it buys answers from Telegraph providers, reads the free GLEIF register, and judges every answer itself (accepting or rejecting it, and saying why). It then blocks the purchase, holds it for a human, or authorises it. After the goods arrive, it checks the delivery before the balance is paid. Every answer shows its source, cost and receipt.

**Who it is for.**
- Small importers and online sellers who buy from suppliers they found on Alibaba.com or similar marketplaces.
- Procurement and finance staff who need a recorded reason for every payment.
- Developers building agents that spend money and need a worked example of a purchase that is checked, not trusted.

**How it fits with Supplier.Detective.** The two apps cover one purchase from start to finish. [Supplier.Detective](https://telegraph-supplier-detective.vercel.app/) checks an invoice against the purchase order once the supplier has sent one. Supplier Buyer Check works earlier, before the buyer has chosen to pay, and again at delivery. Supplier Buyer Check reuses Supplier.Detective's method of buying and cross-checking Telegraph answers (a major reused component, disclosed per the rules). The two are separate submissions and stay separate code, but a buyer uses them as one flow: check the supplier, pay the deposit, check the invoice, check the delivery.

| Moment in the purchase | App |
|---|---|
| Before paying: who is this supplier? | Supplier Buyer Check |
| The supplier sends an invoice | Supplier.Detective |
| After delivery: did they deliver what was agreed? | Supplier Buyer Check |


**Demo video (2 min, on X, 27 Nov 2026):** https://x.com/kingChrys494/status/2126350196195971073  
**Earlier video and first results (25 Nov 2026):** https://x.com/kingChrys494/status/2125641607001301415

**Judges, start here.** No wallet, login or passcode. Anyone gets 20 free checks a day (300 a day across all visitors), paid from a testnet balance.

| Run it | Check it | Inspect the payment | Break it | Reproduce it |
|---|---|---|---|---|
| [supplier-buyer-check.vercel.app](https://supplier-buyer-check.vercel.app): click an example or paste a listing, press **Check this supplier** | Each finding names its source; "not found" and "not checked" are never shown as clean | "Telegraph requests and receipts": intent, miner, cost, signal hash and the raw answer | Click **Invoice pays someone else** (invented company and payee): the verdict must be STOP | `npm test` (33 tests, nothing bought), or fork and deploy with your own key |

## Where to look for each criterion
Wording is the organisers' (Season II rules, Sections 5 and 6, Apps & Agents). Every row points to something you can open or run.

**What every entry must do (Section 5)**
| Requirement | Where to see it |
|---|---|
| Something working | Live site: https://supplier-buyer-check.vercel.app (no wallet, login or passcode) |
| A real Telegraph integration | Every supplier check makes up to six paid requests to `POST https://backend.telegraphprotocol.com/engine/ask`. Each result lists them under "Telegraph requests and receipts": intent, miner, cost, signal hash and the raw answer |
| Repeatable results | "Try it in two minutes" below; new inputs and failure cases are on the site as buttons and in `npm test` |
| Safe handling | The Telegraph key stays on the server and never reaches the browser. Spending limits: 20 checks per visitor and 300 in total per day. A missing answer is shown as "not checked", never as clean. No private data is stored beyond the saved results shown on the site |
| Accurate claims | Network: **Telegraph testnet only**. Payments are test credit. The purchase decision's receipt (`SBX-...`) is a sandbox record: no money moves. Nothing here is production-verified, and no paying customer is claimed. See "What's real and what's illustrated" |
| Star the bounties repo | Done from the submitting GitHub account; the username is in the submission form |

**Missions, and the result that counts for each**
| Mission | Its own testable result |
|---|---|
| 07 Consumer Platform (marketplace agents verifying each other before money changes hands) | Run **Check supplier** on a marketplace supplier (for example the Alibaba examples). The result is blocked, held or authorised, and the supplier's identity, sanctions and invoice are checked before any deposit |
| 08 Commodities (counterparty provenance, with a receipt for each check) | Open **Telegraph requests and receipts** on any result: each paid check lists its intent, miner, cost, signal hash and raw answer |

**Apps & Agents requirement.** "At least one genuinely autonomous machine-to-machine purchase": the server buys each answer by itself through the supported Telegraph flow, with no human in the loop, then uses the answers to decide **blocked, held or authorised**. The result page shows each purchase and its receipt.

**How it is scored (Section 6)**
| Criterion (points) | Where to look |
|---|---|
| Technical quality and mainnet readiness (35) | [api/check.js](api/check.js) and `npm test` (33 tests, no network, nothing bought). Every answer the agent buys is judged against GLEIF and shown as accepted or rejected with the reason. Two independent sanctions providers must agree. Timeouts are never treated as clean. Mainnet: not yet; the app runs on testnet and does not claim otherwise |
| Commercial viability (25) | "Commercial summary" below: a named user, the cost of a check against the deposit at risk, and what it does today ([results/RESULTS.md](results/RESULTS.md)) |
| Genuine independent adoption and retention (10) | "Independent testing (26 Nov 2026)" below: one independent builder ran live tests and found a real gap that led to a fix. It was a mutual test and is disclosed as one. No paying or repeat customers are claimed |
| Telegraph network integration and usage quality (5) | "What it checks" and "How it uses Telegraph" below: intents `CORPORATE_REGISTRY_LOOKUP_GENERAL`, `SANCTIONS_SCREENING_MATCH_GENERAL`, `URL_SAFE_GENERAL`, `WEB_SEARCH_GENERAL`, `NEWS_SEARCH_GENERAL` and identity enrichment, with direct calls to named miners and routed calls. The delivery check uses the Evaluators entry's truth source for `TASK_EXECUTION_QUALITY_GENERAL` |
| Reproducibility, demo/tutorial, and verifiable proof (5) | Demo video (above), "Try it in two minutes", "Run it yourself", the raw receipts on every result, and [results/RESULTS.md](results/RESULTS.md) |
| Organic growth, education, and developer activation (20) | "Updates" below: dated public updates, the independent test and the fix it led to. Anyone can try the app, run the tests, or call the second sanctions miner's public endpoint and report what they find |

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

**Which checks decide the payment.** Identity (GLEIF and the registry), both sanctions opinions, the invoice account holder and the order against the supplier's capacity decide it. If one of those does not answer, the agent shows **Payment held** and never pays on a missing answer. The adverse-news search advises but does not decide: Telegraph's router often does not answer it within 25 seconds, and the news evidence can never prove a supplier clean anyway. If it does not answer, the decision says "Not checked: adverse news" and the check is never shown as clean. Press **Check this supplier** again to retry any answer that timed out.

## Try it in two minutes
1. Open the site, click **See a purchase authorised**, then **Check this supplier**.
   Expected: **Purchase authorised** (Siemens AG, identity confirmed from the register and GLEIF, LEI W38RGI023J3WT1HWRP32) with a sandbox receipt. If a provider is slow, you may see "Payment held" instead; anything a provider could not answer shows as "not checked", never as clean.
2. Click **Invoice pays someone else** (invented company and payee) and run it.
   Expected: **STOP**, with a "Payment beneficiary" finding, and the money at risk (30% of the order) named.
3. Failure case: clear the invoice fields and run the invented company alone.
   Expected: **VERIFY FIRST**, "not found" for the register and LEI, and never a clean result.

Each check makes up to six paid Telegraph calls of about $0.01 each in testnet credit and takes up to a minute.

## Commercial summary
- **Who is it for?** A small importer about to pay a deposit to a marketplace supplier they found online.
- **What does it improve?** Instead of a dozen tabs, or an AI answer with no source, it buys identity and sanctions answers from Telegraph's specialist providers, compares them with the listing, the free GLEIF register and the buyer's invoice, and puts a dollar figure on the money at risk.
- **What does it do today?** It runs live on Telegraph testnet. Five live runs on three real suppliers cost $0.12 in total: four VERIFY FIRST, one STOP (labelled illustration), see [results/RESULTS.md](results/RESULTS.md). Two demo runs on 27 Nov: a sanctioned supplier's $24,000 deposit blocked, and a Siemens deposit authorised with a sandbox receipt, see "Use case 12: live runs". No real money moves.
- **Why would someone adopt it?** A run costs cents against a deposit of thousands, and every finding can be checked without trusting the app.
- **How can someone try it?** The live link above, or fork it and deploy with your own Anjoman key (see "Run it yourself").

## What's real and what's illustrated
| Real and live | Illustrated, testnet or self-measured |
|---|---|
| Paid Telegraph answers, each with a signal hash and cost | Payments are testnet credit, not production usage or real money |
| Three real Alibaba suppliers, shown as A, B and C | The invoice paying "Sunrise Trading Ltd" in run 5 is invented and labelled |
| GLEIF register lookups (free, public) | The seller-size benchmark (25 units per worker per month) is a rough rule of thumb |
| Sanctions lists named with their publication dates | The comparison with a plain AI model is one model on three suppliers: an illustration, not a rate |

**Independent testing (26 Nov 2026):** antikunpiece, the builder of Praman Desk (a separate Telegraph entry), ran live tests against this app's API (`/api/check`) and saved the results in his own repo ([results file](https://github.com/VishAlgoDev/praman-desk/blob/main/evidence/chrysolite-mutual-check.json)). Siemens Aktiengesellschaft (Munich) came back HTTP 200, matched to the active registry record HRB 6684 and LEI W38RGI023J3WT1HWRP32. He also found a gap: for "Viktor But" the sanctions provider this app asked returned no match, while his own screener flags a near-miss with OFAC entry BOUT, Viktor Anatolijevitch (UID 8279), a spelling the single provider missed. *Disclosure:* this was a mutual test. I also tested Praman Desk and reported two bugs, which he fixed; I reran the Viktor But fix on 27 Nov and it returns `NEAR_MISS_REVIEW`. I also reported that his sanctions list was dated 15 Nov; on 27 Nov he refreshed it (19,629 entries) and now updates it daily. No other paying or independent use is confirmed yet.

## Results

Three real Alibaba pump-control suppliers (shown as A, B and C), one 10,000-unit order, five live runs, $0.12 in total Telegraph spend, with a comparison against a strong AI model alone, including where the AI did well. See **[results/RESULTS.md](results/RESULTS.md)**.

Headlines:
- Supplier C's capacity does not fit the order (about 5,000 units a month needed, about 2,500 supportable at 100 staff) and it lists itself as both manufacturer and trading company.
- An invoice that pays a different account holder returns **STOP**, shown as a labelled illustration.
- The plain AI reached the same ranking and gave good payment advice. Its "none are on sanctions lists" claim had no live check behind it, which it admitted when asked.
- Telegraph's router often did not answer within 25 s. Those checks show as "not checked", never as clean.

## Use case 12: live runs on 27 Nov 2026
Two runs on the live site, using the demo buttons. All payments are Telegraph testnet credit; the purchase decision is a sandbox record and no money moved.

| Demo button | Order | What the live site returned |
|---|---|---|
| See a purchase blocked (Rosoboronexport, a sanctioned arms exporter) | $80,000, 30% deposit | **STOP / Purchase blocked ($24,000 deposit).** Both sanctions providers flagged the name, so the agent paid nothing |
| See a purchase authorised (Siemens Aktiengesellschaft) | $80,000, 30% deposit | **Purchase authorised ($24,000 deposit)** with a sandbox receipt. GLEIF confirmed the identity (LEI W38RGI023J3WT1HWRP32, registered as HRB 6684). Both sanctions providers cleared it and agreed. The register provider's answer was **rejected** because it gave the LEI where the registration number was asked, and it was not held against Siemens. The adverse-news provider did not answer in time, so the decision says "Not checked: adverse news" |

What this does not show: no real money moved, no production network was used, and the news check did not run in the authorised run. Live providers sometimes do not answer, so a repeat run can differ; the app then holds the payment or marks the check "not checked" instead of guessing.

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
**Why Telegraph.** A supplier check is only worth trusting if you can see who said what. Telegraph lets the agent buy each answer from a different independent provider, pay per answer, and keep a receipt (provider, cost, signal hash) for every one. That makes two things possible that a single data API can't offer: a second provider's opinion on sanctions, and rejecting a wrong answer openly instead of hiding it. The agent buys these answers by itself, with no accounts or contracts set up in advance, which is the autonomous purchase this track asks for.

**How.** The server calls `POST https://backend.telegraphprotocol.com/engine/ask` (router) and `/engine/ask/{minerId}` (direct) with an Anjoman API key. Identity and sanctions go straight to the named specialist miners; registry, web search and news go through the router. Each call has a 25 s timeout and is not retried after a timeout. The response's miner, cost, signal hash and receipts are kept in the report. See [api/check.js](api/check.js).

A registry provider once returned a record for a different company. The app compares names and treats a mismatch as a provider error, never as evidence against the supplier.

## Run it yourself
1. Fork this repo and import it into Vercel (framework preset: Other).
2. In Vercel, Settings, Environment Variables, add `TELEGRAPH_API_KEY` (create one at anjoman.ai, dashboard, API keys; fund the balance first). Spending limits: without further settings the site allows 5 checks per visitor and 150 in total per day (change with `RUNS_PER_IP_PER_DAY` and `RUNS_ALL_PER_DAY`; the live site is set to 20 and 300). Optional `RUN_PASSCODE` lets you skip the limit yourself.
3. Deploy, open the site, copy a supplier's Alibaba page (Ctrl+A, Ctrl+C), paste it into "Fill it in for me", enter your order and press **Check this supplier**.
4. Tests, no network and nothing bought: `npm test` (Node 18+).

## Updates
Each update below is public and dated, so you can check when it was posted.

- **27 Nov 2026:** public update and demo video on X (https://x.com/kingChrys494/status/2126350196195971073): the purchase verdict, two sanctions sources, rejected wrong answers, the delivery check and the plainer site, with the blocked and authorised demos on screen.
- **27 Nov 2026:** use case 12 added. A second sanctions opinion (Praman Desk miner #6164), judged answers, a purchase decision with a sandbox receipt, and the delivery check from the Evaluators entry. New menu and plainer wording on the site. Tests: 33 passing.
- **27 Nov 2026:** independent test by antikunpiece (Praman Desk) recorded above, with the Viktor But sanctions gap it exposed. That gap is why the second sanctions opinion was added.
- **25 Nov 2026:** the demo video and first results, posted on X (https://x.com/kingChrys494/status/2125641607001301415) and in the Telegraph Discord showcase.

## Limits
- Praman Desk's sanctions miner is read from its public URL. It is a second opinion, not a Telegraph purchase, and its list date (`sdn_last_loaded`) is shown with the result.
- Sanctions coverage differs by provider. The second opinion (Praman Desk) screens the US Treasury SDN list only. Other lists, such as the US non-SDN military-company list, are covered by the Telegraph provider alone. If that provider does not answer in time, the payment is held, never cleared.
- The delivery check compares a supplier's report with the GLEIF register: legal name, LEI, registration number, jurisdiction, status and addresses. It cannot judge product quality.
- Testnet only. Providers may not answer; the report says so and does not treat silence as clean.
- Registry coverage for small manufacturers, especially in mainland China, is limited. A missing record means "ask for the business licence and Unified Social Credit Code", not "fraud".
- The app checks suppliers the buyer already found. It does not discover suppliers, and it does not monitor them after the order starts.
- Investigations of real suppliers use only independently verifiable public information, and the results show them as A, B and C. No accusation is made about any company.
