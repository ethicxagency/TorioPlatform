# Brain maturity engine

Brain maturity measures how well Torio **understands the business**, not how many fields are filled in. It is computed from the
**saved** Brain document by one pure, deterministic function, `evaluateMaturity` (`packages/contracts/src/brain-maturity.ts`),
shared by the API and the web app. The API evaluates on every successful save, stores the result in `brain_configs.maturity`
(with `maturityAt`) in the same write, and serves it with the document. A missing or old-engine value is recomputed on read.
Unsaved edits are never scored.

It is separate from **Setup Completion** (`readinessPct`), which only says how much of the recommended form is filled in.

## Four dimensions (each 0 to 100)

`score = 0.30 Quality + 0.25 Completeness + 0.25 Validity + 0.20 Operational`

| Dimension                      | What it measures                                                                                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Information Quality (30%)      | Substance of what is there: profile description (20), products/services (25), FAQ answers (20), policies (15, physical goods only), instructions and guardrail text (20). Each group = mean substance of its valid entries x min(1, valid entries / target), so one good entry cannot fill a group. |
| Knowledge Completeness (25%)   | Coverage of the areas relevant to this kind of business, weighted: profile 15, products/services 20 (target 3), FAQs 15 (target 5), policies 15 (target 8 fields, physical goods only), brand voice 10, instructions and guardrails 15, business rules 10 (target 2), custom fields 5.              |
| Information Validity (25%)     | valid entries / entries attempted, minus 15 per contradiction, 10 per duplicate and 10 per blocking issue, scaled by min(1, attempted / 10) so a handful of entries cannot score 100.                                                                                                               |
| Operational Intelligence (20%) | Complete enabled rules (30, target 3), valid enabled instructions (20, target 3), guardrails always/never/approval/escalate (15), escalation guidance (15), brand voice (10), response boundaries (10).                                                                                             |

### Text quality (deterministic, no AI)

`substance(text)` counts **distinct meaningful words** (3+ letters, not stop words) so length and repetition do not help,
zeroes placeholders and generic filler ("test", "n/a", "lorem ipsum", "we sell products"), scales down heavy repetition, and
gives a small bonus for concrete details (numbers, names). An entry is _meaningful_ at 0.3 or more. Instructions earn full
credit only when they are actionable (they contain a directive such as always, never, ask, confirm, escalate).

### Anti-gaming

Empty fields, placeholder or vague text, inactive rules/instructions/FAQs, incomplete rules and invalid entries earn nothing.
Duplicates (same name/description, FAQ question or answer, rule name, custom field key) are counted once, flagged, and lower
validity. Contradictions lower validity and block SMART and above. Volume alone never raises the score.

### Business type

`businessKind(category)` (from the Business Profile category): _physical_ (fashion, beauty, electronics, food, home, retail...),
_service_ (travel, education, digital, health, consulting...) or _general_. Shipping and return policies are required only
for _physical_; other businesses are not penalised for lacking them.

## Stages: score band AND cumulative gates

The stage is the highest stage whose band is met **and** whose gates, and every lower stage's gates, all pass.

| Stage   | Score     | Gates                                                                                                                   |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| BORN    | 0 to 19   | none                                                                                                                    |
| BABY    | 20 to 39  | meaningful profile: name, category, specific description, and website or country                                        |
| GROWING | 40 to 54  | 1+ valid product/service; 2+ active FAQs with useful answers; physical goods: policies at least 40% covered             |
| SMART   | 55 to 69  | brand voice set or 1+ specific active instruction; 1+ complete active rule or 2+ guardrails; no contradictions          |
| MATURE  | 70 to 84  | every relevant area at least 60%; validity 70+; no blocking issues, contradictions or duplicates                        |
| EXPERT  | 85 to 100 | every relevant area at least 85%; all four dimensions 75+; 2+ active rules, escalation guidance and response boundaries |

`progressToNext` = half the distance through the score band + half the share of the next stage's gates met.

## Recommendations

Ordered critical (blocking issues, contradictions) then important (duplicates, unmet next-stage gates) then improve (the
action for the weakest dimension, chosen from what is actually missing or weak). Each has a reason, a Brain section to open and
a button label; they disappear when resolved. The hero's "next step" is the first.

## Limits

- Quality is approximated by the rules above. It cannot judge whether a statement is _true_, and nothing is verified externally.
- Contradiction detection covers the checks Brain already had (COD, service areas, rules using disabled fields).
- "Knowledge base" counts active FAQs; Brain has no separate knowledge-source concept.
- The evaluation is recalculated in full on each save (microseconds, no external calls); there is no per-dimension cache.
