# Design direction (Taste Skill, app-screen process)

This is the record of the design decisions for Kabisera Ledger. The sheet below is the skill's output
for this product; the notes above it are what was decided on top of it.

- **Style:** `achromatic-ledger`, kind `finance`, light theme. Seed **1752159620**.
- **Seed history:** planning started from seed 27959683, which dealt a no-sidebar shell. Ten navigation
  destinations do not fit that, so a re-deal was made. Seed 1752159620 deals the labelled **Open plane**
  sidebar natively, which is the shell approved for desktop, so no shell redraw is needed.
- **Face (what makes it this product):** a blue-grey ledger ground `#f2f4f7` with white cards; the single
  chart hue `#1d5fbf` on the main data element only; chrome stays ink with a near-black primary action.
- **Signature element:** the dealt overview pattern is a pinned balances column. Here it holds the three
  float accounts (cash drawer, GCash wallet, load balance) with a low-balance tick and last-reconciled
  time, then a visibly separate block "Owed by customers (not cash)".
- **Phone:** desktop sidebar becomes a bottom bar (Dashboard, New, Transactions, Customers) plus a
  **More** sheet for the rest. The sheet's default is a top bar with a menu sheet; with four primary
  destinations a bottom bar is the approved alternative (`app-screens.md` §12).
- **Charts:** Recharts, configured to the skill's chart rules (straight segments, no point markers,
  3 to 5 horizontal gridlines, no y-axis line, one hue per chart, square bars). `charts.js` from the
  skill is dependency-free vanilla DOM and is used only as the written reference for those rules.
- **Form-control outline:** `#8c8c8c` instead of the sheet's `#d4d4d4`, so a field's boundary meets the 3:1 contrast minimum (see `ACCESSIBILITY.md`).
- **Shadows:** none at rest (stricter than the original brief); only dialogs and menus float.
- **Typeface:** Geist. Geist Mono was removed in Phase 1 because nothing uses it yet; it may return for
  transaction IDs and GCash reference numbers only, with the reason recorded when it does.
- **To verify later (needs a running app and the font):** that Geist's digits change width under
  `tabular-nums`; if they do not, switch the numeric face. The inspector (`inspect.mjs --app`) has NOT
  been run, because the app cannot be served in the assistant's environment.

---

# APP SHEET — Achromatic ledger
seed 1752159620 · drawn 2026-10-23 · kind finance · light
Brief: Kabisera Ledger: counter-side ledger for a small GCash cash-in, cash-out and mobile-load shop in the Philippines. Tracks customers and their transaction history, customer debts and repayments, separate cash drawer, GCash wallet and load balances, service fees, daily reconciliation

This is the style for this product. Adopt it whole and keep its move intact; everything the sheet does not fix comes from the
shared defaults in references/app-screens.md. Redraw only for a reason you can state (it contradicts the brand, or the product is
used in a way the style does not suit) and say why in your report. The values were measured on real product screens: use them
as given rather than rounding them towards your habits.

## 1. The style
The chrome holds no colour at all; money and counts are set in ink, the one chart hue marks the screen's main data element, and the only other hue is a small signal where a figure changed.

**The move:** No brand colour anywhere in the chrome: the one primary action is near-black (a grey pill, #e5e5e5, is the secondary), the main data element (today's series, the booked bars, the current period) takes the one chart hue, #1d5fbf, and everything else is drawn in ink with the comparison or the part after the cursor in grey, zero balances are set in grey, and the only hue on the screen is a small triangle or a short coloured number where a figure changed.

**Colour budget:** under 1% coloured pixels; the chrome is ink, the one chart hue goes on the main data element, and the only other hue is a small change signal.
**Off-style here:** a brand-coloured primary button; tinted cards or tinted KPI tiles; a coloured chart where one series in ink says it; bold on anything but money; a chart with no y-scale (the study's one example of this look hid magnitude behind hover and was flagged); a grey pill as the only button for the screen's main job: in testing an Approve repeated in grey on every row left the screen without a primary.
Distilled from 4 screens: a seller home, a per-agent insights page, a generated report, a settings page with usage numbers. The studied screens of this kind used 11-12px card radii, which §9.4 counts among the rare middle values; the library sets the tight pair (8 and 6) so the style lands on the bimodal rule. After testing, the chart hue moved from an unused third series colour onto the main data element: a screen whose only hue was a delta read as a kit.

**Its face.** Choose one of these (or one of your own of the same weight) before you build, write it in your notes next to
the screen's question, and check that it shows on the first screen. Without one the screen reads as a well-applied kit.
- A ground from the product's world in place of #f8f8f8, one level off white and low in chroma: a stone (#f4f3f1) for a bakery or a shop, a sage (#f2f5f2) for a garden or a greenhouse, a blue-grey (#f2f4f7) for a ledger or a meter. Cards stay white; a warm tint stays under the cream check (saturation under about 15%).
- The one chart hue (#1d5fbf, or the brand's own hue at 3:1 or more on white) on the screen's main data element: today's line, the booked bars, the current period's column, the margin that breaks. The chrome stays ink and the hue stays under 1% of the screen.
- Every figure in Geist Mono, as the style's decision, so money and counts read as a ledger's columns while the text stays Geist. Lint and the inspector flag mono; give the reason in the report.

## 2. Tokens
```css
:root {
  --ground: #f8f8f8;
  --surface: #ffffff;
  --raised: #eeeeee;
  --border: #e6e6e6;
  --rule: #f0f0f0;
  --control: #d4d4d4;
  --text: #0a0a0a;
  --muted: #6b6b6b;
  --accent: #141414;
  --positive: #2e7d32;
  --negative: #c4242a;
  --warning: #92400e;
  --chart-1: #141414;
  --chart-2: #8a8a8a;
  --chart-3: #1d5fbf;
  --pill-positive-bg: #dcfae5; --pill-positive-ink: #04250e;
  --pill-negative-bg: #ffedea; --pill-negative-ink: #831c1e;
  --pill-warning-bg: #fffbeb; --pill-warning-ink: #92400e;
  --pill-neutral-bg: #eeeeee; --pill-neutral-ink: #3d3d3d;
  --radius-card: 8px;
  --radius-control: 6px;
  --row-height: 44px;
  --sidebar-width: 256px;
  --gap: 12px;
  --pad: 24px;
  --control-height: 36px;
  --fs-title: 24px;
  --fs-section: 16px;
  --fs-kpi: 30px;
  --fs-body: 14px;
  --fs-small: 12px;
}
```
Density: sparse. One gap value, horizontally and vertically. No shadow on anything at rest.

## 3. Type — Geist
```html
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```
`font-family: "Geist", Inter, system-ui, sans-serif`. Weights 400, 500, 700. Sizes: title 24px · section 16px · kpi 30px · body 14px · small 12px. 700 is for money figures only; every other number is 400-500. Second face: Geist Mono, for IDs and keys only.
Numbers: `font-variant-numeric: tabular-nums` on every table, KPI and anything that updates. Sentence case; no tracked capitals.

## 4. Shell — Open plane
The labelled sidebar sits on the page ground with nothing or one hairline between it and the canvas; there is no top bar, and the page header and cards sit straight on the ground about 32-36px from the top. Workspace or account switcher at the top of the sidebar, primary nav on a 34px pitch, groups under 12-13px sentence-case grey labels with 22-56px of air above, utilities and the user row pushed to the bottom. Cards are white on the off-white ground (or the sidebar is white with a 1px border on a #f9fafb canvas). The canvas is fluid with one gutter value, or a centred column for personal homes.
Numbers: sidebarWidth 230-256 (230, 240, 256 in the study; 280 and 292 with a built-in icon rail); separation none, or one 1px hairline; the sidebar sits on the page ground or within 1-2% of it; navPitch 34; navRowHeight 32; navIcon 16px outline, about 1.5px stroke; navLabel 14px, 400, grey or ink; activeItem neutral grey pill, radius 6-12, inset 8-12px from the sidebar edges (#e9e9e9-#ededed); topBar none; canvas fluid with a 24-64px gutter, or a centred 1100px column.
On a phone: The sidebar folds into a 48px top bar holding the screen's name, a menu button that opens a full-screen sheet with the nav and the switcher, and at most one action. Content takes the full width with 16px margins.

## 5. Screens

### overview — Finance home with a pinned accounts column
No page header and no KPI strip: cards start 36px from the top and each headline sum sits in the card that explains it. On the left, a 306px accounts card pinned at the viewport height minus the 36px margins opens with net worth (16/600 label left, value right) and holds the account tree with no dividers: groups 16px ink, categories 14px ink, leaves 14px grey indented 8px, values right-aligned, a 30px pitch and about 45px between groups; an empty group is a bordered box with an '+ Add account' link instead of $0.00. On the right, a 2-column grid with 24px gaps of cards that answer this month's questions, each with its own period caption: the plan (spanning both columns; a ring with an empty hole, a dot legend, the available figure beside it with a per-day line), recent spending as 61px two-line rows (payee over category, amount over date, right-aligned) and upcoming bills. Income is green with a plus sign; spending stays in ink.
On a phone: Net worth becomes the first card; the account tree collapses to its groups with totals; the month cards stack.

### list
No pattern in the library for this screen. Compose it from the rules in references/app-screens.md.

### detail
No pattern in the library for this screen. Compose it from the rules in references/app-screens.md.

### wallet — Balance, actions and assets
One column whose every element snaps to its two edges. A balance card (1px border, 16px radius, about 134px tall) holding one 32px figure and one line under it in which only the change is coloured ('-$0.09 in the last 30 days'); the title says what the figure is, so it needs no label. 32px below, 4 equal action tiles in a pale tint with dark same-hue icon and 12-14px label (4 x 144 + 3 x 16 = 624 in the study; scale the column and keep the arithmetic). 32-40px below, text tabs for the asset kinds on a 1px rule with a 2px ink indicator as wide as the word, a network or account select on the right of the same row. Then the asset table: 72px rows (48px round icon plus 24px), no dividers, two-line cells pairing a 16px value with a 14px grey unit amount, numeric columns right-aligned to shared edges, change as a small solid triangle and a coloured percentage, zero change grey, a missing share a grey em dash. On a desktop do not leave the column at phone width: the study's 624px column was flagged as a stretched phone screen; widen it to 864-1100 or give it a second column.
On a phone: This pattern is phone-first: the same column at full width with 16px margins, the 4 tiles in one row, the table as two-line rows with the value right-aligned.

### report
No pattern in the library for this screen. Compose it from the rules in references/app-screens.md.

### settings — Settings in two columns
A centred column of about 1152px. Each section is one row: a label column of about 450px (16/500 title, 14px grey description; the title's cap top 6-8px below the panel top, level with the panel's first line) beside a panel of about 700px with a #fafafa fill, 16px radius, 16px padding, no border and no shadow. Sections are split by a full-width 1px rule with 32px above and below. Inside a panel: field labels 14/500 above 40px white inputs (1px #e8e8e8, radius 10), 8px from label to field, 16px between fields, 24px from the description to the first label, 16px to the Save button; switch rows with a 14/500 title, a 20px status badge 8px after it, a 14px grey description and a 28x16 toggle 16px from the right edge, centred on the title line. A plan-gated feature shows a 48px tinted strip with a 32px button directly above its panel, and the panel stays readable. When a panel runs much taller than its label, put the section's help or a summary of the current values in the label column rather than 250px of nothing.
On a phone: Each section stacks: title and description, then the panel at full width. Inside, label, 8-10px, field, 16-26px to the next pair; toggles stay on the right of their title.

## 6. Always
Real data for this product, written before the markup: names, amounts that add up, dates in order, units on every figure,
honest zeros and dashes. One chart answers one question. No gradients, glows, glass, icons in tinted squares, sparklines on KPIs,
rainbow charts, emoji, lorem or Acme. `<skill>/assets/app.css` and `<skill>/assets/charts.js` are a neutral start set to these
rules. Check with `node <skill>/scripts/lint.mjs <files>` and `node <skill>/scripts/inspect.mjs <page>`: this sheet switches both
to app rules.

Saved to /home/claude/kabisera-ledger/.taste-skill/direction.json · reprint with `node draw.mjs --show`
