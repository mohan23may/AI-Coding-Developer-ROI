# AI ROI Suite

An open-source calculator for the economics of AI-assisted software work. It answers two
questions with real numbers: **what do AI coding tools cost**, and **do the hours they save
pay for them** — across the whole software lifecycle, not just coding.

Live model rates come from a pricing registry (not hand-typed), and every formula, default,
and source is public.

## Pages

| Page | What it does |
|------|--------------|
| **Coding ROI** | Token-level cost from real plan + model algorithms, weighed against man-hours saved. Break-even and plan comparison. |
| **Full SDLC** | Adds AI impact on requirements, design, review, QA, DevOps, and docs on top of coding — as reinvested capacity or avoided spend. No double counting. |
| **Token Compare** | Full-roster token cost calculator over the entire registry (~1,300 priced chat models), searchable and sortable. Add custom models. |
| **Pricing Sources** | Every rate's origin: machine-readable registries and first-party vendor pages. |
| **FAQ** | Plain-language answers on data, methodology, and limits. |
| **Methodology** | The authentication layer — provenance, algorithm, conservative defaults. |
| **Rate & Improve** | Weekly feedback window: rate, suggest, upvote; top item ships next release. |

## Pricing data

Token rates load in priority order:

1. **`/rates.json`** — synced into this repo daily by `.github/workflows/sync-rates.yml`,
   so the app owns an auditable, git-versioned copy (`git log public/rates.json`).
2. **LiteLLM registry** — direct raw file, used if the local snapshot is missing.
3. **Static in-code table** (verified July 2026) — last resort if offline.

Redundant registries with the same per-token shape, documented on the Pricing Sources page
and swappable in `scripts/sync-rates.mjs`:

| Registry | Endpoint | Auth | Models |
|----------|----------|------|--------|
| LiteLLM | `raw.githubusercontent.com/BerriAI/litellm/…/model_prices_and_context_window.json` | none | 2,900+ |
| models.dev | `models.dev/api.json` | none | all major |
| OpenRouter | `openrouter.ai/api/v1/models` | none | 315+ |

**Subscription seat prices** (Cursor, Copilot, Claude, Devin, Codex, Gemini) have no API
anywhere — no provider publishes machine-readable pricing — so they are pinned to vendor
pages with verification dates and corrected through the weekly feedback window.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run sync-rates # refresh public/rates.json on demand
```

## Deploy (browser-only path)

1. Push this repo to GitHub.
2. Import it in **Vercel**, **Netlify**, or **Cloudflare Pages** — framework auto-detects as
   Vite, build `npm run build`, output `dist`.
3. Add a custom domain in the host dashboard; HTTPS is automatic.
4. The bundled GitHub Action keeps `rates.json` current daily.

Every commit auto-redeploys. Also works on GitHub Pages (build and publish `dist`).

## Contributing

- **Wrong price / new model** → PR to the rate source, or open a data-correction issue with a
  source URL and date.
- **Feature idea** → the weekly feedback window on the Rate & Improve page, or an issue.
- **Methodology change** (formula, default) → open a discussion first.

Pricing-data PRs require a linked source and date. The maintainer retains final call on the
queued weekly item.

## Disclaimer

An estimator, not financial advice. Every figure is an editable assumption. Productivity
ranges are genuinely contested (from −19% in one controlled study to multi-hour weekly gains
in large telemetry sets); the scenario selector spans that range and allows negative values.
Validate against your own dashboards before budgeting.

MIT licensed.
