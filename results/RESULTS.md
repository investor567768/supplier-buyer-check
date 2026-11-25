# Results: three Alibaba suppliers, one buyer decision

Supplier Buyer Check, run on 25 Nov 2026 with live paid Telegraph requests (testnet). The three suppliers are real, public Alibaba storefronts selling pump controls. They are shown here as A, B and C. Every finding is a listing-based flag for a buyer to verify. None is a statement about how any company behaves. Screenshots with the real names are kept as private evidence.

## Scenario

A buyer wants 10,000 pump controllers within 60 days and is asked for a 30% deposit.

Two order sizes appear in the runs:
- **Runs 1 to 3:** 7.5 kW VFD pump controller at an assumed $100 each. That makes a $1,000,000 order and **$300,000 at risk**.
- **Runs 4 and 5:** automatic pump controller at **$10 each**, close to the listed prices (roughly ₦15,000 to ₦17,500 on the B listing). That makes a $100,000 order and **$30,000 at risk**.

We corrected the price after the first runs, because $100 did not match what these sellers list. The findings do not depend on the price. Only the dollar exposure changes.

## Results

| Run | Supplier | Verdict | Key findings | Exposure | Cost |
|---|---|---|---|---|---|
| 1 | A | VERIFY FIRST (rank 1) | Sanctions: no match reported. CE claimed, so ask for the certificate. Registry did not answer. | $300,000 of $1,000,000 | $0.03 |
| 2 | B | VERIFY FIRST (rank 2) | Sanctions: no match reported. CE and TUV: ask. CB, SGS and Mid East exports claimed, no independent evidence found. | $300,000 of $1,000,000 | $0.03 |
| 3 | C | VERIFY FIRST (rank 3) | **Seller size vs order: mismatch.** The order needs about 5,000 units a month, and 100 staff at a rough 25 units per worker per month gives about 2,500. **Manufacturer or trader: ask.** The listing says "Manufacturer, Trading Company". | $300,000 of $1,000,000 | $0.02 |
| 4 | A (re-run at $10) | VERIFY FIRST | Same identity and sanctions results. CE, RoHS, ISO, UL and CB claimed but not checked, because the web search did not answer. | $30,000 of $100,000 | $0.02 |
| 5 | A + illustrative invoice | **STOP** | **Payment beneficiary.** The invoice pays "Sunrise Trading Ltd", not the listed company. Bank in Hong Kong while the company is in China: ask why. | $30,000 deposit, or $100,000 if paid in full | $0.02 |

**Run 5 is a labelled illustration.** No real invoice from Supplier A was used, and "Sunrise Trading Ltd" is an invented name, not a reference to any real company. It shows what the check does when a proforma names a different account holder, the most common marketplace payment fraud.

Sanctions lists, with the dates shown by the app: US OFAC SDN and non-SDN Consolidated (published 2026-11-09), UN Security Council Consolidated (2026-11-12), EU Consolidated Financial Sanctions (2026-10-23) and UK Sanctions List (2026-11-10). This comes from one provider only. "No match reported" is not a clearance.

**Total spent on Telegraph requests:** $0.12 across five runs. Every paid request has a receipt hash (signal) in the app's "Telegraph requests and receipts" table.

### Sample receipts (run 3, Supplier C)

| Intent | Miner | Cost | Receipt / signal |
|---|---|---|---|
| CORPORATE_REGISTRY_LOOKUP_GENERAL | Counterproof B2B Identity Enrichment (731005) | $0.01 | `0xd99938db962bb08d9452f75b0d12bee4da2075d481040fe0e3ed825524440fec` |
| SANCTIONS_SCREENING_MATCH_GENERAL | Counterproof Sanctions Screener (731002) | $0.01 | `0xdf713dac9b3bdb62b399b42ee50ede5ee84afb5ac0f035ae1dab1a82ed999d54` |
| CORPORATE_REGISTRY_LOOKUP_GENERAL (router) | none | not charged | router: no answer within 25 s |
| WEB_SEARCH_GENERAL (router) | none | not charged | router: no answer within 25 s |
| NEWS_SEARCH_GENERAL (router) | none | not charged | router: no answer within 25 s |

Checked 2026-11-25T07:38:05Z. Receipts for the other runs are in the evidence screenshots.

## Identity discrepancies found while preparing the runs

A buyer would likely miss these:

- **Look-alike names.** Searching Supplier A's brand name on Alibaba returns at least three different companies with near-identical names: A itself (21 years on Alibaba) and two others (6 and 5 years, with different floor space). Our own first attempt opened the wrong one. A buyer who pastes the wrong storefront checks the wrong company.
- **Years do not agree (Supplier A).** Alibaba shows 21 years, the store banner says "25 years", and the capability panel says 26 years exporting.
- **Founding date disagrees (Supplier C).** The storefront and some directories say 2020, other B2B directories say 2016. This was cited by the plain AI, not verified by us.
- **Staff count is not always published.** Only Supplier C's page listed total employees (51 to 100). The seller-size check therefore ran for C only.

## Plain AI model alone (Gemini)

We gave a strong general AI model the listing details for the first three runs and asked for a recommendation.

**Where it did well**
- Same ranking: A, then B, then C.
- Sound capacity reasoning on C.
- Practical payment advice: a letter of credit or a split deposit, and third-party pre-shipment inspection.
- It surfaced the conflicting founding dates for C.

**Where it fell short**
- It said none of the three appear on sanctions lists. Asked for its source, it said it had not run a live check. The claim came from general web results and training knowledge, with no list name, date or timestamp, and the original answer did not disclose this.
- It stated "Registered in 2020" without saying the date came from third-party directories, not an official registry.
- Much of the capacity analysis restated figures we supplied.

**Not a perfect like-for-like test:** Gemini saw C with 70 staff and 2,100 m² (from an earlier listing read), while our final run used 100 staff and 3,000 m² from the store's company table. We gave Gemini no invoice, so it was not tested on the payment beneficiary.

## What the app adds over a plain AI answer

- A live sanctions screen with named lists and dates, plus a receipt for each paid request.
- Each claim marked as asked, not found or not checked. Nothing unproven is called true.
- A STOP when the money would go to someone else.
- Exposure stated in dollars next to every verdict.
- Provider failures reported as provider failures, never as a clean result.

## Difficult scenarios: incorrect, missing and conflicting information

| Type | What happened | How the app handled it |
|---|---|---|
| Incorrect | In an earlier test (24 Nov), one registry provider returned a record for a different company than the one asked about. | The app compares names. A mismatched record is reported as a provider error and never used as evidence against the supplier. |
| Missing | The router did not answer within 25 s for registry, web search and news in most runs. Two of three storefronts publish no staff count. | Reported as "not found" or "not checked", never as clean. Unanswered requests are not charged. The seller-size check is skipped when there is no staff figure. |
| Conflicting | Supplier A's years: 21 on Alibaba, 25 on the banner, 26 exporting. Supplier C's founding year: 2020 or 2016 depending on the directory. | The years claim is marked "not found" (no incorporation date to confirm it), and the buyer is told to ask for the business licence. |
| Wrong entity | Three near-identical company names for Supplier A's brand. | The app checks the exact name entered. The write-up tells buyers to match name, country and years. |

## Measured against a plain AI answer

| Measure | Supplier Buyer Check | Plain AI (Gemini) |
|---|---|---|
| Supplier ranking (A, B, C) | A > B > C | A > B > C, the same |
| Sanctions result backed by named lists and dates | 5 of 5 runs, 4 dated lists each | 0 of 3. The "not on sanctions lists" claim had no live check, as it confirmed when asked |
| Paid requests with a receipt | Every paid request (sample above) | None |
| Factual claims stated without a source | 0. Unproven claims are labelled | 2 ("not on sanctions lists", "registered in 2020"), both conceded on follow-up |
| Payment to the wrong beneficiary | STOP (run 5) | Not tested: no invoice given |
| Practical payment-protection advice | Hold the deposit until open points are answered | Stronger: letter of credit, split deposit, pre-shipment inspection |
| Cost per supplier | $0.02 to $0.03 | Free |

## Reproduce the runs

Open https://supplier-buyer-check.vercel.app, paste each storefront page into "Fill it in for me", then set these fields:

| Run | Product | Qty | Days | Unit price | Deposit | Certifications | Years | Staff | Business type | Invoice |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 (A) | 7.5 kW VFD pump controller | 10000 | 60 | 100 | 30 | CE | 21 | empty | Manufacturer | empty |
| 2 (B) | same | 10000 | 60 | 100 | 30 | CE, TUV, CB, SGS | 12 | empty | Manufacturer | empty |
| 3 (C) | same | 10000 | 60 | 100 | 30 | CE | 4 | 100 | Manufacturer, Trading Company | empty |
| 4 (A) | Automatic pump controller | 10000 | 60 | 10 | 30 | CE, RoHS, ISO, UL, CB | 21 | empty | Manufacturer | empty |
| 5 (A) | Automatic pump controller | 10000 | 60 | 10 | 30 | CE, RoHS, ISO, UL, CB | 21 | empty | Manufacturer | Sunrise Trading Ltd, Hong Kong |

Export markets: Mid East for run 2, Southeast Asia for run 3, empty for the others. Country China in all runs. Factory size is left as auto-filled from the storefront.

The real storefront names and links are in the private evidence pack shared with the hackathon organisers. Results can differ when providers time out.

## Who would use it and why

- **Who:** small and mid-sized importers placing first orders with new marketplace suppliers, typically $10,000 to $1,000,000, where a 30% deposit is a real loss if it goes wrong.
- **Why pay:** a few cents per check against a five or six-figure deposit, with a record of what was checked, when, and from which source.
- **What brings them back:** every new supplier and every new invoice needs a fresh check. The payment-beneficiary check runs again each time a proforma arrives.

## Not yet covered

- The app checks suppliers the buyer has already found. It does not discover suppliers on its own.
- Continuous monitoring after the order starts is not built.
- Ownership and reputation checks are out of scope, as agreed.

## Limits

- The Telegraph router did not answer within 25 s for the registry, web search and news requests in most runs. Those checks show "not found" or "not checked", never "clean".
- The seller-size check ran for C only, because only C published a staff count.
- Some certifications appear only as banner images, so the claims entered differ between suppliers. The ranking is directional.
- Neither tool checked the official Chinese registry (GSXT). A buyer should request the business licence and Unified Social Credit Code.
- The app does not assess product quality or beneficial ownership.
