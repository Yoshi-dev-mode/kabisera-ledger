# Accessibility notes

Computed with the WCAG 2.x contrast formula for every text and component colour the design uses. The numbers below are
calculated, not estimated. They are one part of accessibility only: nothing here replaces trying the app with a keyboard,
a screen reader and a phone.

| Pair | Foreground | Background | Ratio | Needed | Result |
|---|---|---|---:|---:|---|
| body text on white card | `#0a0a0a` | `#ffffff` | 19.80:1 | 4.5:1 | pass |
| body text on page ground | `#0a0a0a` | `#f2f4f7` | 17.97:1 | 4.5:1 | pass |
| muted text on white | `#6b6b6b` | `#ffffff` | 5.33:1 | 4.5:1 | pass |
| muted text on page ground | `#6b6b6b` | `#f2f4f7` | 4.84:1 | 4.5:1 | pass |
| muted text on raised grey | `#6b6b6b` | `#eeeeee` | 4.59:1 | 4.5:1 | pass |
| muted text on preview box | `#6b6b6b` | `#f6f7f9` | 4.97:1 | 4.5:1 | pass |
| primary button text | `#ffffff` | `#141414` | 18.42:1 | 4.5:1 | pass |
| negative (red) text on white | `#c4242a` | `#ffffff` | 5.78:1 | 4.5:1 | pass |
| negative text on page ground | `#c4242a` | `#f2f4f7` | 5.25:1 | 4.5:1 | pass |
| positive (green) text on white | `#2e7d32` | `#ffffff` | 5.13:1 | 4.5:1 | pass |
| warning text on white | `#92400e` | `#ffffff` | 7.09:1 | 4.5:1 | pass |
| pill: positive | `#04250e` | `#dcfae5` | 14.77:1 | 4.5:1 | pass |
| pill: negative | `#831c1e` | `#ffedea` | 8.63:1 | 4.5:1 | pass |
| pill: warning | `#92400e` | `#fffbeb` | 6.84:1 | 4.5:1 | pass |
| pill: neutral | `#3d3d3d` | `#eeeeee` | 9.36:1 | 4.5:1 | pass |
| active navigation item | `#0a0a0a` | `#ececec` | 16.76:1 | 4.5:1 | pass |
| chart bars (blue) against white | `#1d5fbf` | `#ffffff` | 6.10:1 | 3.0:1 | pass |
| form-control outline against white | `#8c8c8c` | `#ffffff` | 3.36:1 | 3.0:1 | pass |
| form-control outline against the page ground | `#8c8c8c` | `#f2f4f7` | 3.05:1 | 3.0:1 | pass |
| focus ring against the page ground | `#0a0a0a` | `#f2f4f7` | 17.97:1 | 3.0:1 | pass |

Text needs 4.5:1; interface components such as input outlines, chart marks and focus rings need 3:1.

## A deliberate change to the design sheet

The Taste Skill sheet uses a very light control border (`#d4d4d4`, 1.48:1 on white). On a text field that outline is the
only thing that shows where the field is, so it fails the 3:1 minimum for interface components. Form controls here use
`#8c8c8c` instead (`--control-border`). Decorative hairlines and chart gridlines keep the light colour.

## Built in

- Every field has a visible label; hints are linked with `aria-describedby`; errors use `role="alert"` and confirmations `role="status"`.
- The "what will happen" preview and filter results announce changes (`aria-live`).
- Dialogs are native `<dialog>` elements, so focus is trapped and Escape closes them. A skip-to-content link is the first focusable item.
- Colour never carries meaning alone: statuses, low balances and differences always include words (Low, Overdue, Voided, "5.00 less than expected").
- Tables use real header cells; amounts use tabular digits and sit right-aligned; the profit chart has a text table for screen readers.
- Phone layout: the main destinations are in a bottom bar with 56px targets; list rows are at least 44px tall.
- Motion is limited to simple transitions, and `prefers-reduced-motion` switches it off.

## Not yet checked

Screen-reader behaviour, keyboard order on every page, zoom to 200%, and real-device tap sizes have **not** been tested.
`tests/e2e` contains a few keyboard and label checks, but they have not been run.
