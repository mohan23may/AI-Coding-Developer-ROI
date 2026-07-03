# Contributing

Thanks for helping keep this accurate. Three contribution types:

## 1. Price correction / new model (fastest path)
Token rates sync automatically from the registry. If a rate is wrong or a model is missing:
- Prefer fixing it upstream in the rate registry (that fixes it for everyone).
- Or open an issue tagged `data` with the **source URL** and **date** — required, so the
  change is verifiable.

Seat/subscription plan prices are hand-maintained in `src/App.jsx` (`PLANS`). Corrections
need a link to the vendor pricing page and the date you checked it.

## 2. Feature suggestion (weekly window)
Each ISO week is one feedback window on the **Rate & Improve** page. Rate the tool, leave one
concrete suggestion, and upvote others'. The top-voted item at close (Sunday, UTC) is queued
for the next release and logged in the changelog. Bigger proposals: open an issue tagged
`feature`.

## 3. Methodology change
Formulas, default assumptions, and phase percentages are deliberately conservative and
sourced. Open a **discussion** before a PR so the reasoning and source are on record.

## Ground rules
- Data PRs must cite a source and date.
- Keep defaults at or below published vendor claims; the tool's credibility is its neutrality.
- The maintainer retains final call on the queued weekly item (guards against vote-brigading
  a bad idea).

## Dev
```bash
npm install
npm run dev
```
Single component in `src/App.jsx`. Data tables (`MODELS`, `PLANS`, `DEFAULT_PHASES`,
`SOURCES`, `REGISTRIES`, `VENDOR_PAGES`, `FAQ`) are at the top and in the page components.
