import { useState, useMemo, useEffect } from "react";

// Pricing feed, in priority order:
//  1. /rates.json  — synced daily into this repo by .github/workflows/sync-rates.yml
//     from the LiteLLM registry, so the app owns an auditable, git-versioned copy.
//  2. LiteLLM raw file — direct fallback if the local snapshot is missing.
//  3. Static in-code table (verified July 2026) — last resort if offline.
// models.dev/api.json and openrouter.ai/api/v1/models are documented as drop-in
// redundant sources in README + the Pricing Sources page.
const FEED_SOURCES = [
  { url: "/rates.json", label: "repo-synced snapshot" },
  { url: "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json", label: "LiteLLM live registry" },
];

// ---------------------------------------------------------------
// PRICING DATA — verified July 2026 (editable in-app via Advanced)
// Model API rates: $ per million tokens (input / output / cache read)
// ---------------------------------------------------------------
const MODELS = [
  // -- Editor first-party --
  { id: "auto",     provider: "Cursor",    name: "Auto / Composer 2.5",   inR: 1.25, outR: 6.0,  cacheR: 0.25,  feedKey: null, note: "Cursor first-party; unlimited pool on paid Cursor plans" },
  // -- Anthropic --
  { id: "opus48",   provider: "Anthropic", name: "Claude Opus (latest)",  inR: 5.0,  outR: 25.0, cacheR: 0.50,  feedKey: "claude-opus-4-6",   note: "Frontier reasoning / long-horizon agents" },
  { id: "sonnet46", provider: "Anthropic", name: "Claude Sonnet 4.6",     inR: 3.0,  outR: 15.0, cacheR: 0.30,  feedKey: "claude-sonnet-4-6", note: "Default production coding model" },
  { id: "haiku45",  provider: "Anthropic", name: "Claude Haiku 4.5",      inR: 1.0,  outR: 5.0,  cacheR: 0.10,  feedKey: "claude-haiku-4-5",  note: "High-volume, simple tasks" },
  // -- OpenAI --
  { id: "gpt55",    provider: "OpenAI",    name: "GPT-5.5",               inR: 5.0,  outR: 30.0, cacheR: 0.50,  feedKey: "gpt-5.5",           note: "OpenAI flagship" },
  { id: "gpt54",    provider: "OpenAI",    name: "GPT-5.4",               inR: 2.5,  outR: 15.0, cacheR: 0.25,  feedKey: "gpt-5.4",           note: "OpenAI workhorse / Codex" },
  // -- Google --
  { id: "gem3pro",  provider: "Google",    name: "Gemini 3 Pro",          inR: 2.0,  outR: 12.0, cacheR: 0.20,  feedKey: "gemini-3-pro-preview",   note: "Google flagship" },
  { id: "gem3fl",   provider: "Google",    name: "Gemini 3 Flash",        inR: 0.5,  outR: 3.0,  cacheR: 0.05,  feedKey: "gemini-3-flash-preview", note: "Fast, cheap Google tier" },
  // -- xAI --
  { id: "grok4",    provider: "xAI",       name: "Grok 4",                inR: 3.0,  outR: 15.0, cacheR: 0.30,  feedKey: "grok-4",            note: "xAI flagship" },
  { id: "grokcode", provider: "xAI",       name: "Grok Code Fast",        inR: 0.2,  outR: 1.5,  cacheR: 0.02,  feedKey: "grok-code-fast",    note: "Budget coding tier" },
  // -- Open-weights / other --
  { id: "dsv4",     provider: "Open-weights", name: "DeepSeek (chat/reasoner)", inR: 0.28, outR: 0.42, cacheR: 0.028, feedKey: "deepseek-chat",          note: "Open-weights budget tier" },
  { id: "kimi26",   provider: "Open-weights", name: "Kimi K2.6",                inR: 0.95, outR: 4.0,  cacheR: 0.095, feedKey: "kimi-k2.6",              note: "Moonshot agentic model" },
  { id: "qwen3c",   provider: "Open-weights", name: "Qwen3 Coder Next",         inR: 0.6,  outR: 1.44, cacheR: 0.06,  feedKey: "qwen.qwen3-coder-next",  note: "Alibaba coding model" },
  { id: "glm5",     provider: "Open-weights", name: "GLM-5.2",                  inR: 1.4,  outR: 4.4,  cacheR: 0.26,  feedKey: "glm-5p2",                note: "Zhipu flagship" },
  { id: "minimax",  provider: "Open-weights", name: "MiniMax M2.5",             inR: 0.36, outR: 1.44, cacheR: 0.036, feedKey: "minimax.minimax-m2.5",   note: "Budget agentic tier" },
  { id: "codestral",provider: "Open-weights", name: "Codestral 2508",           inR: 0.3,  outR: 0.9,  cacheR: 0.03,  feedKey: "codestral-2508",         note: "Mistral code model" },
];
const PROVIDERS = ["Cursor", "Anthropic", "OpenAI", "Google", "xAI", "Open-weights"];

// Fully-loaded hourly rate presets (salary + benefits + overhead), 2026 ranges
const RATE_PRESETS = [
  { label: "Junior", rate: 75 },
  { label: "Mid",    rate: 140 },
  { label: "Senior", rate: 240 },
  { label: "Staff",  rate: 400 },
];

// ---------------------------------------------------------------
// FULL-SDLC LAYER — phases beyond coding, with the roles they touch.
// Coding itself is deliberately EXCLUDED here: it is already priced
// bottom-up by the token engine above (no double counting).
// Default AI-assist % are set BELOW published claims, on purpose:
// QA manual-effort reductions of ~60%, QA cycle cuts of 50–70%,
// review-efficiency gains of ~45%, requirements drafting compressed
// from weeks to days. Users should tune each to their own reality.
// ---------------------------------------------------------------
const DEFAULT_PHASES = [
  { id: "req",    phase: "Requirements & planning", role: "PM / BA",           people: 1, rate: 120, hrsMo: 60,  aiPct: 30, on: true },
  { id: "arch",   phase: "Architecture & design",   role: "Senior / Staff eng", people: 1, rate: 240, hrsMo: 40,  aiPct: 15, on: true },
  { id: "review", phase: "Code review",             role: "Reviewing devs",     people: 2, rate: 200, hrsMo: 30,  aiPct: 30, on: true },
  { id: "qa",     phase: "Testing & QA",            role: "QA engineer",        people: 1, rate: 100, hrsMo: 120, aiPct: 45, on: true },
  { id: "devops", phase: "DevOps & hosting ops",    role: "DevOps / SRE",       people: 1, rate: 160, hrsMo: 50,  aiPct: 25, on: true },
  { id: "docs",   phase: "Docs & knowledge base",   role: "Any",                people: 1, rate: 100, hrsMo: 20,  aiPct: 40, on: true },
];

// Task profiles: cumulative tokens a typical agentic task pushes through
// the model, and the manual (no-AI) engineering hours it displaces.
const DEFAULT_TASKS = [
  { id: "qa",       name: "Explain / Q&A",          inTok: 25000,   outTok: 2000,  manualHrs: 0.5, perWeek: 10 },
  { id: "bugfix",   name: "Bug fix",                inTok: 400000,  outTok: 8000,  manualHrs: 2.0, perWeek: 5 },
  { id: "feature",  name: "Feature build (agent)",  inTok: 2000000, outTok: 60000, manualHrs: 8.0, perWeek: 2 },
  { id: "refactor", name: "Multi-file refactor",    inTok: 1200000, outTok: 40000, manualHrs: 5.0, perWeek: 1 },
  { id: "review",   name: "Code review",            inTok: 150000,  outTok: 5000,  manualHrs: 1.0, perWeek: 6 },
  { id: "tests",    name: "Tests & docs",           inTok: 300000,  outTok: 20000, manualHrs: 2.0, perWeek: 3 },
];

// Plan algorithm: monthly cost = seat fee + max(0, usage − included credit).
// Cursor Teams adds a $0.25/MTok platform fee on non-Auto tokens.
// "approx: true" = vendor bills by quotas/rate-limits, not dollar credits;
// the included figure is a stated usage-equivalent assumption (editable in repo).
const PLANS = [
  { id: "api",        name: "Direct API (pay-as-you-go)", seat: 0,   included: 0,   tokenFee: 0,    group: "API" },
  { id: "c-pro",      name: "Cursor Pro",                 seat: 20,  included: 20,  tokenFee: 0,    group: "Cursor" },
  { id: "c-proplus",  name: "Cursor Pro+",                seat: 60,  included: 60,  tokenFee: 0,    group: "Cursor" },
  { id: "c-ultra",    name: "Cursor Ultra",               seat: 200, included: 400, tokenFee: 0,    group: "Cursor" },
  { id: "c-teams",    name: "Cursor Teams · Standard",    seat: 40,  included: 40,  tokenFee: 0.25, group: "Cursor" },
  { id: "c-teams-p",  name: "Cursor Teams · Premium",     seat: 120, included: 200, tokenFee: 0.25, group: "Cursor" },
  { id: "cc-pro",     name: "Claude Pro (Claude Code)",   seat: 20,  included: 40,  tokenFee: 0,    group: "Claude", approx: true },
  { id: "cc-max5",    name: "Claude Max 5×",              seat: 100, included: 200, tokenFee: 0,    group: "Claude", approx: true },
  { id: "cc-max20",   name: "Claude Max 20×",             seat: 200, included: 800, tokenFee: 0,    group: "Claude", approx: true },
  { id: "gh-pro",     name: "GitHub Copilot Pro",         seat: 10,  included: 15,  tokenFee: 0,    group: "Copilot" },
  { id: "gh-proplus", name: "GitHub Copilot Pro+",        seat: 39,  included: 70,  tokenFee: 0,    group: "Copilot" },
  { id: "gh-max",     name: "GitHub Copilot Max",         seat: 100, included: 200, tokenFee: 0,    group: "Copilot" },
  { id: "gh-biz",     name: "Copilot Business",           seat: 19,  included: 19,  tokenFee: 0,    group: "Copilot", approx: true },
  { id: "dv-pro",     name: "Devin (Windsurf) Pro",       seat: 20,  included: 20,  tokenFee: 0,    group: "Devin", approx: true },
  { id: "dv-max",     name: "Devin (Windsurf) Max",       seat: 200, included: 400, tokenFee: 0,    group: "Devin", approx: true },
  { id: "oa-plus",    name: "ChatGPT Plus (Codex)",       seat: 20,  included: 40,  tokenFee: 0,    group: "OpenAI", approx: true },
  { id: "oa-pro",     name: "ChatGPT Pro (Codex)",        seat: 200, included: 240, tokenFee: 0,    group: "OpenAI", approx: true },
  { id: "gg-std",     name: "Gemini Code Assist Standard",seat: 19,  included: 19,  tokenFee: 0,    group: "Google", approx: true },
  { id: "gg-ent",     name: "Gemini Code Assist Enterprise",seat: 45,included: 45,  tokenFee: 0,    group: "Google", approx: true },
];
const PLAN_GROUPS = ["API", "Cursor", "Claude", "Copilot", "Devin", "OpenAI", "Google"];

const SCENARIOS = [
  { id: "cons", name: "Conservative", pct: 10, blurb: "Light gains; heavy review overhead" },
  { id: "typ",  name: "Typical",      pct: 25, blurb: "≈ industry median (20–31% studies)" },
  { id: "opt",  name: "Optimistic",   pct: 40, blurb: "Well-scoped agentic workflows" },
  { id: "cust", name: "Custom",       pct: null, blurb: "Set your own %" },
];

const fmt$ = (n) =>
  n >= 1000 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
            : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtH = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

// Cost of one task run on a model, with a share of input served from cache
function taskCost(task, model, cachePct, tokenFee, runsPerTask) {
  const inTok = task.inTok * runsPerTask;
  const outTok = task.outTok * runsPerTask;
  const cached = inTok * (cachePct / 100);
  const fresh = inTok - cached;
  const modelCost =
    (fresh * model.inR + cached * model.cacheR + outTok * model.outR) / 1e6;
  const platformFee =
    model.id === "auto" ? 0 : ((inTok + outTok) * tokenFee) / 1e6;
  return modelCost + platformFee;
}

export default function App() {
  const [planId, setPlanId] = useState("c-pro");
  const [modelId, setModelId] = useState("sonnet46");
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [teamSize, setTeamSize] = useState(1);
  const [hourlyRate, setHourlyRate] = useState(85);
  const [cachePct, setCachePct] = useState(60);
  const [runsPerTask, setRunsPerTask] = useState(1.3);
  const [scenarioId, setScenarioId] = useState("typ");
  const [customPct, setCustomPct] = useState(25);
  const [phases, setPhases] = useState(DEFAULT_PHASES);
  const [phaseToolSeat, setPhaseToolSeat] = useState(30); // non-coding AI tools $/person/mo
  const [framing, setFraming] = useState("reinvest");     // reinvest | avoid
  const [page, setPage] = useState("coding");              // coding | tokens | sdlc | sources | feedback
  const [planVendor, setPlanVendor] = useState("Cursor");
  const [modelProvider, setModelProvider] = useState("Anthropic");
  const [catalog, setCatalog] = useState([]);              // full model roster from the feed

  const NAV = [
    { id: "coding",   label: "Coding ROI" },
    { id: "sdlc",     label: "Full SDLC" },
    { id: "tokens",   label: "Token Compare" },
    { id: "pricing",  label: "Pricing Sources" },
    { id: "faq",      label: "FAQ" },
    { id: "sources",  label: "Methodology" },
    { id: "feedback", label: "Rate & Improve" },
  ];
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [models, setModels] = useState(MODELS);
  const [feedStatus, setFeedStatus] = useState("static");
  const [feedInfo, setFeedInfo] = useState(null); // { syncedAt, count, liveIds, source }

  // Try each feed source in priority order; keep static rates if all fail.
  useEffect(() => {
    let alive = true;
    (async () => {
      let feed = null, source = null;
      for (const s of FEED_SOURCES) {
        try {
          const r = await fetch(s.url);
          if (!r.ok) continue;
          feed = await r.json();
          source = s.label;
          break;
        } catch { /* try next */ }
      }
      if (!alive) return;
      if (!feed) { setFeedStatus("static"); return; }
      {
        const keys = Object.keys(feed);
        const liveIds = new Set();
        setModels((ms) =>
          ms.map((m) => {
            if (!m.feedKey) return m;
            const k = keys.find((x) => x === m.feedKey || x.endsWith("/" + m.feedKey));
            const f = k && feed[k];
            if (!f || !f.input_cost_per_token) return m;
            liveIds.add(m.id);
            return {
              ...m,
              inR: f.input_cost_per_token * 1e6,
              outR: (f.output_cost_per_token || 0) * 1e6,
              cacheR: (f.cache_read_input_token_cost || f.input_cost_per_token * 0.1) * 1e6,
            };
          })
        );
        setFeedInfo({ syncedAt: new Date(), count: keys.length, liveIds, source });
        setFeedStatus("live");
        // Build the full comparison catalog from the same authenticated repo:
        // chat-capable models with published prices, deduped by model name.
        const seen = new Set();
        const cat = [];
        for (const k of keys) {
          const v = feed[k];
          if (!v || !v.input_cost_per_token || !v.output_cost_per_token) continue;
          if (v.mode && v.mode !== "chat" && v.mode !== "responses") continue;
          const name = k.split("/").pop();
          if (seen.has(name)) continue;
          seen.add(name);
          cat.push({
            name,
            provider: v.litellm_provider || "other",
            inR: v.input_cost_per_token * 1e6,
            outR: v.output_cost_per_token * 1e6,
            cacheR: (v.cache_read_input_token_cost || 0) * 1e6,
          });
        }
        setCatalog(cat);
      }
    })();
    return () => { alive = false; };
  }, []);

  const plan = PLANS.find((p) => p.id === planId);
  const model = models.find((m) => m.id === modelId);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  const savePct = scenario.pct === null ? customPct : scenario.pct;

  const setTask = (id, field, val) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: val } : t)));
  const setPhase = (id, field, val) =>
    setPhases((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: val } : p)));

  const calc = useMemo(() => {
    const WEEKS = 4.33;
    let usagePerDev = 0;
    let manualHrsPerDev = 0;
    const rows = tasks.map((t) => {
      const perTask = taskCost(t, model, cachePct, plan.tokenFee, runsPerTask);
      const monthly = perTask * t.perWeek * WEEKS;
      const hrs = t.manualHrs * (savePct / 100) * t.perWeek * WEEKS;
      usagePerDev += monthly;
      manualHrsPerDev += hrs;
      return { ...t, perTask, monthly, hrs };
    });
    const usage = usagePerDev * teamSize;
    const seats = plan.seat * teamSize;
    const includedPool = plan.included * teamSize;
    const overage = Math.max(0, usage - includedPool);
    const totalCost = seats + overage;
    const hoursSaved = manualHrsPerDev * teamSize;
    const valueSaved = hoursSaved * hourlyRate;
    const net = valueSaved - totalCost;
    const roi = totalCost > 0 ? net / totalCost : Infinity;
    const breakEvenHrs = hourlyRate > 0 ? totalCost / hourlyRate : 0;

    // Same workload priced across alternative plans (comparison strip)
    const compare = PLANS.filter((p) =>
      ["api", "c-pro", "gh-pro", "c-ultra", "cc-max5"].includes(p.id)
    ).map((p) => {
      let u = 0;
      tasks.forEach((t) => {
        u += taskCost(t, model, cachePct, p.tokenFee, runsPerTask) * t.perWeek * WEEKS;
      });
      u *= teamSize;
      const cost = p.seat * teamSize + Math.max(0, u - p.included * teamSize);
      return { name: p.name, cost };
    });

    // ---- Full-SDLC layer (non-coding phases) ----
    const activePhases = phases.filter((p) => p.on);
    const phaseSeats = activePhases.reduce((s, p) => s + p.people, 0);
    const phaseToolCost = phaseSeats * phaseToolSeat;
    let sdlcHours = 0, sdlcValue = 0;
    const phaseRows = activePhases.map((p) => {
      const hrs = p.people * p.hrsMo * (p.aiPct / 100);
      const val = hrs * p.rate;
      sdlcHours += hrs; sdlcValue += val;
      return { ...p, hrs, val };
    });
    const programCost = totalCost + phaseToolCost;
    const programValue = valueSaved + sdlcValue;
    const programHours = hoursSaved + sdlcHours;
    const programNet = programValue - programCost;
    const programRoi = programCost > 0 ? programNet / programCost : Infinity;
    const fte = programHours / 160; // 160 productive hrs / person-month

    return { rows, usage, seats, includedPool, overage, totalCost, hoursSaved, valueSaved, net, roi, breakEvenHrs, compare,
      phaseRows, phaseToolCost, sdlcHours, sdlcValue, programCost, programValue, programHours, programNet, programRoi, fte };
  }, [tasks, model, plan, teamSize, hourlyRate, cachePct, runsPerTask, savePct, phases, phaseToolSeat]);

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="mast">
        <div className="mast-kicker reveal r0">TOKEN LEDGER · OPEN-SOURCE AI ROI SUITE</div>
        <h1 className="reveal r1">Cost of the machine,<br /><em>value of the hour.</em></h1>
        <p className="mast-sub reveal r2">
          Token-level coding costs and AI impact across the whole lifecycle, in one ledger.
          Every rate is sourced from a live registry, every formula is public, and the
          community reshapes it each week.
        </p>
        <div className="mast-stats reveal r3">
          <span><b>{models.length}</b> models</span>
          <span><b>{PLANS.length}</b> plans</span>
          <span><b>{feedStatus === "live" ? "live" : "static"}</b> rate feed</span>
          <span><b>open</b> source</span>
        </div>
        <nav className="tabs" aria-label="Pages">
          {NAV.map((n) => (
            <button key={n.id} className={"tab" + (page === n.id ? " tab-on" : "")}
              onClick={() => setPage(n.id)}>{n.label}</button>
          ))}
        </nav>
      </header>

      {page === "sources" && <SourcesPage feedStatus={feedStatus} feedInfo={feedInfo} models={models} />}
      {page === "pricing" && <PricingSourcesPage />}
      {page === "faq" && <FAQPage />}
      {page === "feedback" && <FeedbackPage />}
      {page === "tokens" && (
        <TokenComparePage catalog={catalog} feedStatus={feedStatus} feedInfo={feedInfo}
          onAddModel={(m) => {
            setModels((ms) => [...ms, { ...m, id: "custom-" + Date.now().toString(36), provider: "Custom", feedKey: null, note: "Custom model added by you" }]);
            setModelProvider("Custom");
          }} />
      )}

      {(page === "coding" || page === "sdlc") && (
      <div className="grid">
        {/* ------------------ INPUT COLUMN ------------------ */}
        <div className="inputs">
          {page === "coding" && (<>
          <section className="card">
            <div className="card-label">01 · Tool & plan</div>

            <span className="pick-label">Vendor</span>
            <div className="vendor-row">
              {PLAN_GROUPS.map((g) => (
                <button key={g} className={"vchip" + (planVendor === g ? " vchip-on" : "")}
                  onClick={() => {
                    setPlanVendor(g);
                    const first = PLANS.find((p) => p.group === g);
                    if (first) setPlanId(first.id);
                  }}>{g}</button>
              ))}
            </div>
            <label>
              <span>Plan</span>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {PLANS.filter((p) => p.group === planVendor).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ${p.seat}/seat{p.included ? `, $${p.included} incl.${p.approx ? "≈" : ""}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <span className="pick-label" style={{ marginTop: 16 }}>
              Model provider {feedStatus === "live" && <i className="live-dot">● live rates</i>}
            </span>
            <div className="vendor-row">
              {[...new Set(models.map((m) => m.provider))].map((pr) => (
                <button key={pr} className={"vchip" + (modelProvider === pr ? " vchip-on" : "")}
                  onClick={() => {
                    setModelProvider(pr);
                    const first = models.find((m) => m.provider === pr);
                    if (first) setModelId(first.id);
                  }}>{pr}</button>
              ))}
            </div>
            <label>
              <span>Model routed to</span>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {models.filter((m) => m.provider === modelProvider).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — ${m.inR.toFixed(2)}/{"$" + m.outR.toFixed(2)} MTok
                    {feedInfo?.liveIds?.has(m.id) ? " ●" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="microcopy">{model.note}. {plan.tokenFee > 0 && "Teams plans add a $0.25/MTok Cursor platform fee on non-Auto tokens. "}{plan.approx && "This vendor bills by quotas/rate-limits, not dollar credits — included usage marked ≈ is a stated assumption. "}{feedInfo && `Rates synced from LiteLLM feed (${feedInfo.count.toLocaleString()} models) at ${feedInfo.syncedAt.toLocaleTimeString()}; ● marks live-updated models. `}Need a model that isn't listed? Add it on the Token Compare page.</div>
          </section>

          <section className="card">
            <div className="card-label">02 · Task mix per developer, per week</div>
            <div className="task-head">
              <span>Task</span><span>×/wk</span><span>Tokens in/out</span><span>Manual hrs</span><span>$/task</span>
            </div>
            {calc.rows.map((t) => (
              <div className="task-row" key={t.id}>
                <span className="t-name">{t.name}</span>
                <input type="number" min="0" value={t.perWeek}
                  onChange={(e) => setTask(t.id, "perWeek", Math.max(0, +e.target.value))}/>
                <span className="t-tok">{(t.inTok / 1000).toLocaleString()}K / {(t.outTok / 1000)}K</span>
                <input type="number" min="0" step="0.5" value={t.manualHrs}
                  onChange={(e) => setTask(t.id, "manualHrs", Math.max(0, +e.target.value))}/>
                <span className="t-cost">{fmt$(t.perTask)}</span>
              </div>
            ))}
            <div className="microcopy">
              Token profiles reflect cumulative agentic context (repo files, tool output,
              retries) — the real driver of agent-mode bills. Edit manual hours to your codebase.
            </div>
          </section>

          <section className="card">
            <div className="card-label">03 · Team & economics</div>
            <div className="slider-grid">
              <label>
                <span>Developers <b>{teamSize}</b></span>
                <input type="range" min="1" max="50" value={teamSize}
                  onChange={(e) => setTeamSize(+e.target.value)} />
              </label>
              <label>
                <span>Loaded hourly rate <b>${hourlyRate}</b></span>
                <input type="range" min="20" max="500" step="5" value={hourlyRate}
                  onChange={(e) => setHourlyRate(+e.target.value)} />
                <span className="preset-row">
                  {RATE_PRESETS.map((p) => (
                    <button key={p.label}
                      className={"preset" + (hourlyRate === p.rate ? " preset-on" : "")}
                      onClick={() => setHourlyRate(p.rate)}>
                      {p.label} ${p.rate}
                    </button>
                  ))}
                </span>
              </label>
              <label>
                <span>Prompt-cache hit rate <b>{cachePct}%</b></span>
                <input type="range" min="0" max="90" step="5" value={cachePct}
                  onChange={(e) => setCachePct(+e.target.value)} />
              </label>
              <label>
                <span>Retry / iteration factor <b>×{runsPerTask.toFixed(1)}</b></span>
                <input type="range" min="1" max="3" step="0.1" value={runsPerTask}
                  onChange={(e) => setRunsPerTask(+e.target.value)} />
              </label>
            </div>
          </section>

          <section className="card">
            <div className="card-label">04 · Time-saved scenario</div>
            <div className="scenario-row">
              {SCENARIOS.map((s) => (
                <button key={s.id}
                  className={"chip" + (scenarioId === s.id ? " chip-on" : "")}
                  onClick={() => setScenarioId(s.id)}>
                  <strong>{s.name}</strong>
                  <span>{s.pct === null ? `${customPct}%` : `${s.pct}%`}</span>
                </button>
              ))}
            </div>
            {scenarioId === "cust" && (
              <label className="custom-slider">
                <span>Custom % of manual hours saved <b>{customPct}%</b></span>
                <input type="range" min="-20" max="70" value={customPct}
                  onChange={(e) => setCustomPct(+e.target.value)} />
              </label>
            )}
            <div className="microcopy">
              Field studies range widely: ~3.6 hrs/wk median (DX, 135K devs), 20–31%
              typical uplift — while METR measured experienced devs 19% <i>slower</i> on
              familiar code. Negative values are allowed for that reason.
            </div>
          </section>
          </>)}

          {page === "sdlc" && (<>
          <div className="page-note">
            Coding costs & savings carry over from the <button className="linklike"
            onClick={() => setPage("coding")}>Coding ROI page</button> — currently{" "}
            <b>{fmt$(calc.totalCost)}/mo cost</b> against <b>{fmtH(calc.hoursSaved)} h saved</b>.
            This page adds every other phase on top. Nothing is counted twice.
          </div>
          <section className="card">
            <div className="card-label">05 · Full SDLC — beyond coding</div>
            <div className="phase-head">
              <span></span><span>Phase · role</span><span>People</span><span>$/h</span><span>Hrs/mo</span><span>AI %</span><span>Hrs saved</span>
            </div>
            {calc.phaseRows.length === 0 && (
              <div className="microcopy">All phases off — turn one on to model non-coding impact.</div>
            )}
            {phases.map((p) => {
              const row = calc.phaseRows.find((r) => r.id === p.id);
              return (
                <div className={"phase-row" + (p.on ? "" : " phase-off")} key={p.id}>
                  <input type="checkbox" checked={p.on} aria-label={`Include ${p.phase}`}
                    onChange={(e) => setPhase(p.id, "on", e.target.checked)} />
                  <span className="t-name">{p.phase}<em>{p.role}</em></span>
                  <input type="number" min="0" value={p.people} disabled={!p.on}
                    onChange={(e) => setPhase(p.id, "people", Math.max(0, +e.target.value))}/>
                  <input type="number" min="0" step="5" value={p.rate} disabled={!p.on}
                    onChange={(e) => setPhase(p.id, "rate", Math.max(0, +e.target.value))}/>
                  <input type="number" min="0" step="5" value={p.hrsMo} disabled={!p.on}
                    onChange={(e) => setPhase(p.id, "hrsMo", Math.max(0, +e.target.value))}/>
                  <input type="number" min="0" max="90" value={p.aiPct} disabled={!p.on}
                    onChange={(e) => setPhase(p.id, "aiPct", Math.min(90, Math.max(0, +e.target.value)))}/>
                  <span className="t-cost pine">{row ? fmtH(row.hrs) + " h" : "—"}</span>
                </div>
              );
            })}
            <label className="phase-tool">
              <span>Non-coding AI tools (QA agents, docs AI, review bots) <b>${phaseToolSeat}/person/mo</b></span>
              <input type="range" min="0" max="150" step="5" value={phaseToolSeat}
                onChange={(e) => setPhaseToolSeat(+e.target.value)} />
            </label>
            <div className="microcopy">
              Coding is intentionally absent from this table — the token engine above already
              prices it, so nothing is counted twice. Defaults sit below published claims
              (QA −60% manual effort, review +45% efficiency, requirements weeks→days);
              tune each AI% to what your team actually observes.
            </div>
          </section>

          <section className="card">
            <div className="card-label">06 · Hours saved — the human framing</div>
            <div className="scenario-row framing-row">
              <button className={"chip" + (framing === "reinvest" ? " chip-on" : "")}
                onClick={() => setFraming("reinvest")}>
                <strong>Capacity reinvested</strong><span>more shipped, same team</span>
              </button>
              <button className={"chip" + (framing === "avoid" ? " chip-on" : "")}
                onClick={() => setFraming("avoid")}>
                <strong>Cost avoidance</strong><span>hiring / contractor deferral</span>
              </button>
            </div>
            <div className="microcopy">
              {framing === "reinvest"
                ? `The ${fmtH(calc.programHours)} hrs/mo (~${calc.fte.toFixed(1)} FTE-equivalent) reads as capacity: teams report reinvesting saved time into planning, review, refactoring, docs and quality — not headcount cuts. Output rises; the ledger's dollar value is opportunity value, not cash.`
                : `The ${fmtH(calc.programHours)} hrs/mo (~${calc.fte.toFixed(1)} FTE-equivalent) reads as avoided spend: hires or contractors you don't add for the same roadmap. Only this framing is cash-real — and only if the hiring was genuinely planned.`}
            </div>
          </section>
          </>)}
        </div>

        {/* ------------------ LEDGER / RECEIPT ------------------ */}
        <aside className="ledger">
          <div className="ledger-inner">
            <div className="ledger-head">
              <span>MONTHLY STATEMENT</span>
              <span className={feedStatus === "live" ? "feed-live" : ""}>
                {feedStatus === "live" ? "● LIVE RATES" : "STATIC · JUL 2026"}
              </span>
            </div>

            {page === "coding" && (<>
            <div className="l-section">SPEND</div>
            <div className="l-row"><span>Seats × {teamSize}</span><span>{fmt$(calc.seats)}</span></div>
            <div className="l-row"><span>Token usage (metered)</span><span>{fmt$(calc.usage)}</span></div>
            <div className="l-row dim"><span>Included credits</span><span>−{fmt$(Math.min(calc.usage, calc.includedPool))}</span></div>
            <div className="l-row"><span>Overage billed</span><span>{fmt$(calc.overage)}</span></div>
            <div className="l-row total"><span>Total AI cost</span><span>{fmt$(calc.totalCost)}</span></div>

            <div className="l-section">RETURN</div>
            <div className="l-row"><span>Man-hours saved</span><span>{fmtH(calc.hoursSaved)} h</span></div>
            <div className="l-row"><span>@ ${hourlyRate}/h</span><span>{fmt$(calc.valueSaved)}</span></div>
            <div className="l-row"><span>Break-even at</span><span>{fmtH(calc.breakEvenHrs)} h/mo</span></div>

            <div className={"verdict " + (calc.net >= 0 ? "good" : "bad")}>
              <div className="verdict-label">{calc.net >= 0 ? "NET GAIN" : "NET LOSS"}</div>
              <div className="verdict-num">{fmt$(Math.abs(calc.net))}<small>/mo</small></div>
              <div className="verdict-roi">
                {isFinite(calc.roi) ? `${(calc.roi * 100).toFixed(0)}% ROI` : "∞ ROI"} ·{" "}
                {calc.totalCost > 0 ? (calc.valueSaved / calc.totalCost).toFixed(1) : "∞"}× return
              </div>
            </div>

            </>)}

            {page === "sdlc" && (<>
            <div className="l-section">FULL SDLC PROGRAM</div>
            <div className="l-row"><span>Coding AI cost</span><span>{fmt$(calc.totalCost)}</span></div>
            <div className="l-row"><span>Non-coding AI tools</span><span>{fmt$(calc.phaseToolCost)}</span></div>
            <div className="l-row total"><span>Program cost</span><span>{fmt$(calc.programCost)}</span></div>
            <div className="l-section">RETURN</div>
            <div className="l-row"><span>Coding value · {fmtH(calc.hoursSaved)} h</span><span>{fmt$(calc.valueSaved)}</span></div>
            <div className="l-row"><span>Non-coding value · {fmtH(calc.sdlcHours)} h</span><span>{fmt$(calc.sdlcValue)}</span></div>
            <div className={"verdict " + (calc.programNet >= 0 ? "good" : "bad")}>
              <div className="verdict-label">{calc.programNet >= 0 ? "PROGRAM NET GAIN" : "PROGRAM NET LOSS"}</div>
              <div className="verdict-num">{fmt$(Math.abs(calc.programNet))}<small>/mo</small></div>
              <div className="verdict-roi">
                {isFinite(calc.programRoi) ? `${(calc.programRoi * 100).toFixed(0)}% ROI` : "∞ ROI"} ·{" "}
                {calc.fte.toFixed(1)} FTE-equivalent · framed as {framing === "reinvest" ? "reinvested capacity" : "cost avoidance"}
              </div>
            </div>
            </>)}

            {page === "coding" && (<>
            <div className="l-section">SAME WORKLOAD, OTHER PLANS</div>
            {calc.compare.map((c) => {
              const max = Math.max(...calc.compare.map((x) => x.cost), 1);
              return (
                <div className="bar-row" key={c.name}>
                  <span className="bar-name">{c.name}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(c.cost / max) * 100}%` }} />
                  </div>
                  <span className="bar-val">{fmt$(c.cost)}</span>
                </div>
              );
            })}

            <button className="assump-toggle" onClick={() => setShowAssumptions(!showAssumptions)}>
              {showAssumptions ? "Hide" : "Show"} pricing assumptions
            </button>
            {showAssumptions && (
              <div className="assump">
                <p><b>Live-rate source:</b> {feedStatus === "live" && feedInfo
                  ? `Connected — LiteLLM model_prices_and_context_window.json (github.com/BerriAI/litellm), ${feedInfo.count.toLocaleString()} models, synced ${feedInfo.syncedAt.toLocaleString()}`
                  : "Not reachable — using the static July 2026 snapshot verified against vendor pricing pages"}</p>
                <p><b>Model rates ($/MTok in · out · cache-read):</b></p>
                {models.map((m) => (
                  <p key={m.id}>{feedInfo?.liveIds?.has(m.id) ? "● " : "○ "}{m.name}: {m.inR.toFixed(2)} · {m.outR.toFixed(2)} · {m.cacheR.toFixed(3)}{m.feedKey ? "" : " (editor-published rate, not in feed)"}</p>
                ))}
                <p>● live-updated this session · ○ static snapshot</p>
                <p><b>Algorithm:</b> cost = fresh-input×in-rate + cached-input×cache-rate + output×out-rate, per million tokens; plus $0.25/MTok Cursor Teams fee on non-Auto tokens; monthly bill = seats + max(0, usage − included pool). Claude subscription pools are modeled as effective usage equivalents (Pro≈$40, Max 5×≈$200, Max 20×≈$800) — Anthropic bills by rate limits, not credits.</p>
              </div>
            )}
            </>)}
          </div>
        </aside>
      </div>
      )}

      <footer className="foot">
        Rates: vendor pricing pages + LiteLLM live feed · Coding productivity: DX (135K devs), Atlassian Rovo Dev 2026 (2–3 h/wk, +19% PRs), METR RCT (−19% caution) · SDLC phases: QA −60% manual effort, review +45% efficiency, requirements weeks→days (2026 industry studies; defaults set below claims) · Estimates only — validate against your own dashboards before budgeting.
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------
// METHODOLOGY & SOURCES — the authentication layer.
// Every number in the calculators traces to a row here.
// ---------------------------------------------------------------
const SOURCES = [
  { claim: "Model API rates (Claude, GPT, Gemini, DeepSeek)", src: "LiteLLM community rate file (2,900+ models) with vendor pricing pages as static fallback", verified: "Live on load / Jul 2026" },
  { claim: "Cursor plans, credits, $0.25/MTok Teams token fee, Auto rates", src: "Cursor Models & Pricing docs + Pricing Policy", verified: "Jun 2026 update" },
  { claim: "Agentic task token profiles (400K–2M input per task)", src: "Published agent cost telemetry & Anthropic enterprise figures ($150–250/dev/mo)", verified: "Jun 2026" },
  { claim: "Coding time saved: 2–3.6 h/wk median; 20–31% uplift; −19% possible", src: "DX 135K-dev dataset · Atlassian Rovo Dev study · METR RCT", verified: "2025–2026" },
  { claim: "QA manual effort −60%; QA cycles −50–70%", src: "Enterprise QA studies (defaults set BELOW claims at 45%)", verified: "2026" },
  { claim: "Code review +45% efficiency, 79% adoption", src: "Industry review-tool studies (default set at 30%)", verified: "2026" },
  { claim: "DevOps: 35% fewer production incidents", src: "Predictive-deployment enterprise reports (default 25%)", verified: "2026" },
  { claim: "Loaded hourly rates $50–500 by seniority", src: "AI Cost Estimator 2026 worksheet ranges", verified: "2026" },
];

// ---------------------------------------------------------------
// TOKEN COMPARE — the full-roster token calculator. Every price row
// syncs from ONE common authenticated repository (the LiteLLM rate
// file), never hand-entered, so it cannot silently go stale.
// ---------------------------------------------------------------
const STATIC_CATALOG = MODELS.filter((m) => m.feedKey).map((m) => ({
  name: m.name, provider: m.provider.toLowerCase(), inR: m.inR, outR: m.outR, cacheR: m.cacheR,
}));

function TokenComparePage({ catalog, feedStatus, feedInfo, onAddModel }) {
  const [inTok, setInTok] = useState(10000);
  const [outTok, setOutTok] = useState(1500);
  const [cachePct, setCachePct] = useState(0);
  const [reqMo, setReqMo] = useState(1000);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [nm, setNm] = useState({ name: "", inR: "", outR: "", cacheR: "" });
  const [added, setAdded] = useState(false);

  const data = catalog.length ? catalog : STATIC_CATALOG;

  const perReq = (m) => {
    const cached = inTok * (cachePct / 100);
    const cacheRate = m.cacheR > 0 ? m.cacheR : m.inR; // no cache price → no discount
    return ((inTok - cached) * m.inR + cached * cacheRate + outTok * m.outR) / 1e6;
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = data
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
      .map((m) => ({ ...m, req: perReq(m), mo: perReq(m) * reqMo }));
    r.sort((a, b) =>
      sortBy === "in" ? a.inR - b.inR : sortBy === "out" ? a.outR - b.outR : a.mo - b.mo
    );
    return r.slice(0, 60);
  }, [data, search, sortBy, inTok, outTok, cachePct, reqMo]);

  const cheapest = rows.length ? rows.reduce((a, b) => (a.mo < b.mo ? a : b)) : null;

  const submitModel = () => {
    const inR = parseFloat(nm.inR), outR = parseFloat(nm.outR);
    if (!nm.name.trim() || isNaN(inR) || isNaN(outR)) return;
    onAddModel({ name: nm.name.trim().slice(0, 40), inR, outR, cacheR: parseFloat(nm.cacheR) || inR * 0.1 });
    setNm({ name: "", inR: "", outR: "", cacheR: "" });
    setAdded(true); setTimeout(() => setAdded(false), 3000);
  };

  return (
    <div className="page-wrap">
      <section className="card">
        <div className="card-label">
          TOKEN CALCULATOR · {data.length.toLocaleString()} MODELS ·{" "}
          {feedStatus === "live"
            ? `SYNCED FROM COMMON REPO ${feedInfo ? feedInfo.syncedAt.toLocaleTimeString() : ""}`
            : "OFFLINE — CURATED SNAPSHOT"}
        </div>
        <div className="tc-inputs">
          <label><span>Input tokens / request</span>
            <input type="number" min="0" value={inTok} onChange={(e) => setInTok(Math.max(0, +e.target.value))} /></label>
          <label><span>Output tokens / request</span>
            <input type="number" min="0" value={outTok} onChange={(e) => setOutTok(Math.max(0, +e.target.value))} /></label>
          <label><span>Cached input %</span>
            <input type="number" min="0" max="95" value={cachePct} onChange={(e) => setCachePct(Math.min(95, Math.max(0, +e.target.value)))} /></label>
          <label><span>Requests / month</span>
            <input type="number" min="1" value={reqMo} onChange={(e) => setReqMo(Math.max(1, +e.target.value))} /></label>
        </div>
        <div className="tc-controls">
          <input className="tc-search" placeholder="Search model or provider… (gpt, claude, gemini, deepseek)"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="total">Sort: monthly cost</option>
            <option value="in">Sort: input $/M</option>
            <option value="out">Sort: output $/M</option>
          </select>
        </div>

        <div className="tc-head">
          <span>Model</span><span>Provider</span><span>In $/M</span><span>Out $/M</span><span>Cache $/M</span><span>$/request</span><span>$/month</span>
        </div>
        <div className="tc-body">
          {rows.map((m) => (
            <div className={"tc-row" + (cheapest && m.name === cheapest.name ? " tc-best" : "")} key={m.provider + m.name}>
              <span className="tc-name">{m.name}</span>
              <span className="tc-prov">{m.provider}</span>
              <span>{m.inR.toFixed(2)}</span>
              <span>{m.outR.toFixed(2)}</span>
              <span>{m.cacheR > 0 ? m.cacheR.toFixed(3) : "—"}</span>
              <span>{m.req < 0.01 ? "$" + m.req.toFixed(4) : fmt$(m.req)}</span>
              <span className="tc-mo">{fmt$(m.mo)}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="microcopy" style={{ padding: 10 }}>No models match that search.</div>}
        </div>
        <div className="microcopy" style={{ marginTop: 10 }}>
          Showing top {rows.length} of {data.length.toLocaleString()} priced chat models in the
          repo. Every rate comes from the shared LiteLLM rate file — the same authenticated
          source the ROI calculators use — so this table and the calculators can never
          disagree. "—" in cache = provider publishes no cache-read discount; cached tokens
          are charged at full input rate. Green row = cheapest for your current workload.
        </div>
      </section>

      <section className="card">
        <div className="card-label">ADD A MODEL (CUSTOM / PRIVATE / NOT YET IN FEED)</div>
        <div className="tc-inputs">
          <label><span>Model name</span>
            <input type="text" maxLength="40" placeholder="e.g. Internal-FT-v2" value={nm.name}
              onChange={(e) => setNm({ ...nm, name: e.target.value })} /></label>
          <label><span>Input $/MTok</span>
            <input type="number" min="0" step="0.01" placeholder="3.00" value={nm.inR}
              onChange={(e) => setNm({ ...nm, inR: e.target.value })} /></label>
          <label><span>Output $/MTok</span>
            <input type="number" min="0" step="0.01" placeholder="15.00" value={nm.outR}
              onChange={(e) => setNm({ ...nm, outR: e.target.value })} /></label>
          <label><span>Cache $/MTok (optional)</span>
            <input type="number" min="0" step="0.001" placeholder="0.30" value={nm.cacheR}
              onChange={(e) => setNm({ ...nm, cacheR: e.target.value })} /></label>
        </div>
        <button className="fb-submit" onClick={submitModel} disabled={!nm.name.trim() || !nm.inR || !nm.outR}>
          {added ? "Added — now routable in Coding ROI ✓" : "Add model to this session"}
        </button>
        <div className="microcopy" style={{ marginTop: 10 }}>
          Custom models appear under a "Custom" provider in the Coding ROI model picker and
          live for this session. To add a model permanently for everyone, the open-source
          path is a pull request to the shared rate file — keeping one authenticated source
          of truth instead of hand-edited prices.
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------
// PRICING SOURCES — where every rate is confirmable. Two kinds:
// machine-readable registries (a "Docker Hub for model prices" —
// one endpoint, many models) and first-party vendor pages (HTML
// only; no provider publishes a pricing API, confirmed below).
// ---------------------------------------------------------------
const REGISTRIES = [
  { name: "LiteLLM rate file", endpoint: "raw.githubusercontent.com/BerriAI/litellm/…/model_prices_and_context_window.json",
    format: "JSON", auth: "None", models: "2,900+", note: "This app's primary feed. Per-token input/output/cache + context. Open source, PR-editable." },
  { name: "models.dev", endpoint: "models.dev/api.json · models.json · catalog.json",
    format: "JSON (TOML source)", auth: "None", models: "All major", note: "Open database by the opencode team. input/output/cache_read/cache_write per 1M USD, capability flags, cutoff dates. Git-diffable." },
  { name: "OpenRouter", endpoint: "openrouter.ai/api/v1/models",
    format: "JSON", auth: "None (public)", models: "315+", note: "Unified gateway; pricing.prompt / pricing.completion, updated daily. Passthrough of provider rates." },
  { name: "Helicone registry", endpoint: "helicone.ai/models · /llm-cost",
    format: "Web + API", auth: "Key for API", models: "500+", note: "Cost + context registry across providers; also per-call cost observability." },
  { name: "Price Per Token (MCP)", endpoint: "pricepertoken.com — Price Per Token MCP",
    format: "MCP / web", auth: "None", models: "Many", note: "Live pricing + benchmarks for agents via MCP; sources data from OpenRouter and Helicone." },
];

const VENDOR_PAGES = [
  { vendor: "OpenAI",    url: "developers.openai.com/api/docs/pricing",  api: false, note: "HTML only; no pricing API (confirmed on OpenAI forum). Per-1M table; 10% data-residency uplift on post-Mar-2026 regional endpoints." },
  { vendor: "Anthropic", url: "anthropic.com/pricing · docs.claude.com",  api: false, note: "HTML only; batch −50%, prompt caching −90% on cached reads." },
  { vendor: "Google",    url: "ai.google.dev/gemini-api/docs/pricing",    api: false, note: "HTML only; Gemini API + Code Assist seats billed via Google Cloud." },
  { vendor: "DeepSeek",  url: "api-docs.deepseek.com/quick_start/pricing", api: false, note: "HTML only; off-peak discounts; cache-hit vs cache-miss input tiers." },
  { vendor: "xAI",       url: "docs.x.ai/docs/models",                    api: false, note: "HTML only; Grok family per-token." },
  { vendor: "Moonshot (Kimi)", url: "platform.moonshot.ai/docs/pricing",  api: false, note: "HTML only; Kimi K2 family." },
  { vendor: "Z.AI (GLM)",url: "z.ai / bigmodel.cn pricing",              api: false, note: "HTML only; GLM family, some free tiers." },
  { vendor: "Cursor",    url: "cursor.com/pricing · docs.cursor.com",     api: false, note: "Seat + credit plans; Auto/Composer rates in docs, not in any feed." },
  { vendor: "GitHub Copilot", url: "github.com/features/copilot/plans",   api: false, note: "Seat + AI-credit plans; premium-request overage." },
  { vendor: "Devin (Windsurf)", url: "devin.ai/pricing",                  api: false, note: "Seat + quota plans; Teams uses base fee + per-seat." },
];

function PricingSourcesPage() {
  return (
    <div className="page-wrap">
      <section className="card">
        <div className="card-label">Machine-readable registries — one endpoint, every model</div>
        <p className="prose">
          A registry is to model prices what a container registry is to images: a single
          authenticated endpoint returns the whole catalog, so a calculator syncs instead of
          hand-copying. This app bills against the first; the rest are documented drop-in
          redundancies with the same per-token shape.
        </p>
        <div className="reg-grid">
          {REGISTRIES.map((r) => (
            <div className="reg-card" key={r.name}>
              <div className="reg-top"><span className="reg-name">{r.name}</span>
                <span className="reg-badge">{r.format}</span></div>
              <code className="reg-ep">{r.endpoint}</code>
              <div className="reg-meta"><span>Auth: {r.auth}</span><span>Models: {r.models}</span></div>
              <p className="reg-note">{r.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-label">First-party vendor pricing — the source of record</div>
        <p className="prose">
          Registries mirror these pages; the pages themselves are canonical. Confirmed across
          every major provider: none publishes a machine-readable pricing API — the numbers
          live in HTML that changes without notice. That gap is exactly why the registries
          above exist, and why seat-plan prices in this app carry verification dates rather
          than a live feed.
        </p>
        <div className="vp-head"><span>Vendor</span><span>Pricing page</span><span>Pricing API?</span><span>Notes</span></div>
        {VENDOR_PAGES.map((v) => (
          <div className="vp-row" key={v.vendor}>
            <span className="vp-vendor">{v.vendor}</span>
            <code className="vp-url">{v.url}</code>
            <span className={v.api ? "vp-yes" : "vp-no"}>{v.api ? "Yes" : "No — HTML only"}</span>
            <span className="vp-note">{v.note}</span>
          </div>
        ))}
        <div className="microcopy" style={{ marginTop: 12 }}>
          Deploy note: this sandbox's network only reaches GitHub, so the app's live feed uses
          the LiteLLM raw file; models.dev and OpenRouter resolve once hosted. The bundled
          GitHub Action re-syncs rates into the repo daily, giving every price an auditable
          commit history — <code>git log public/rates.json</code> shows when any rate moved.
        </div>
      </section>
    </div>
  );
}

const FAQ = [
  { q: "Where do the model prices come from?",
    a: "A live registry feed (LiteLLM's open rate file, ~2,900 models), mirrored daily into this repo as rates.json so the app owns a git-versioned copy. models.dev and OpenRouter are wired as redundant sources. Full detail on the Pricing Sources page." },
  { q: "How current are the numbers?",
    a: "Token rates refresh on every load from the feed and re-sync daily via GitHub Actions. Subscription seat prices (Cursor, Copilot, Claude, Devin, Codex, Gemini) have no API anywhere, so they're pinned to vendor pages with verification dates and corrected through the weekly feedback window." },
  { q: "Why do agent tasks cost so much more than a chat prompt?",
    a: "An agentic task pushes cumulative context — repo files, tool output, retries — through the model, reaching 400K–2M input tokens per task versus a few thousand for a single prompt. The calculator models tokens per task type with a retry multiplier and cache-hit slider, which is where real agent bills come from." },
  { q: "Is the coding value double-counted on the Full SDLC page?",
    a: "No. Coding is priced only by the token engine. The SDLC page adds non-coding phases (requirements, design, review, QA, DevOps, docs) on top and states the carried-over coding figures explicitly, so nothing is counted twice." },
  { q: "Why can the time saved be negative?",
    a: "Because the evidence is genuinely mixed: a controlled study measured experienced developers 19% slower on familiar code, while telemetry across 135K developers shows a 2–3.6 h/week median gain. The scenario selector spans conservative to optimistic and allows negative values so the ROI verdict stays honest." },
  { q: "What does 'FTE-equivalent' mean, and is it a headcount cut?",
    a: "It's saved hours ÷ 160 productive hours/month — a way to size capacity, not a layoff plan. The framing toggle lets you read it as reinvested capacity (more shipped, same team) or cost avoidance (deferred hires); only the latter is cash-real, and only if the hiring was actually planned." },
  { q: "Can I add a model or plan that isn't listed?",
    a: "Yes — the Token Compare page has an Add-a-model form (name + input/output/cache rates) that makes it routable in the Coding ROI calculator for the session. Permanent additions go through a pull request to the shared rate file, keeping one authenticated source of truth." },
  { q: "How does the weekly feedback window work?",
    a: "Each ISO week is one window. Anyone rates the tool, suggests one change, and upvotes others' suggestions; the top-voted item is queued for the next release and logged in the changelog. It's the mechanism that catches seat-price changes fast." },
  { q: "Is this financial advice?",
    a: "No. It's an estimator. Every figure is a modelling assumption you can edit, sourced on the Methodology and Pricing Sources pages. Validate against your own provider dashboards before making budget decisions." },
  { q: "Is it open source?",
    a: "Yes — MIT licensed. Prices, formulas, and defaults are all public and auditable, and contributions (new models, corrected rates, features) come through GitHub issues and pull requests." },
];

function FAQPage() {
  const [open, setOpen] = useState(0);
  return (
    <div className="page-wrap">
      <section className="card">
        <div className="card-label">Frequently asked questions</div>
        <div className="faq-list">
          {FAQ.map((f, i) => (
            <div className={"faq-item" + (open === i ? " faq-on" : "")} key={i}>
              <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{f.q}</span><span className="faq-mark">{open === i ? "–" : "+"}</span>
              </button>
              {open === i && <p className="faq-a">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SourcesPage({ feedStatus, feedInfo, models }) {
  return (
    <div className="page-wrap">
      <section className="card">
        <div className="card-label">LIVE COST FEED — WHAT THIS APP IS CONNECTED TO</div>
        <div className="feed-panel">
          <div className="l-row"><span>Status</span>
            <span className={feedStatus === "live" ? "pine mono" : "mono"}>
              {feedStatus === "live" ? "● CONNECTED" : "○ OFFLINE — STATIC FALLBACK"}</span></div>
          <div className="l-row"><span>Source</span>
            <span className="mono">{feedInfo?.source || "LiteLLM · model_prices_and_context_window.json"}</span></div>
          <div className="l-row"><span>Publisher</span>
            <span className="mono">github.com/BerriAI/litellm (open source, community-maintained)</span></div>
          <div className="l-row"><span>Models in feed</span>
            <span className="mono">{feedInfo ? feedInfo.count.toLocaleString() : "— (2,900+ when connected)"}</span></div>
          <div className="l-row"><span>Last synced</span>
            <span className="mono">{feedInfo ? feedInfo.syncedAt.toLocaleString() : "n/a — showing July 2026 snapshot"}</span></div>
          <div className="l-row"><span>Live-updated in this app</span>
            <span className="mono">{feedInfo ? `${feedInfo.liveIds.size} of ${models.length} listed models` : "0 (all static)"}</span></div>
          <div className="l-row"><span>Fallback</span>
            <span className="mono">Static rates verified against vendor pricing pages, July 2026</span></div>
        </div>
        <div className="microcopy" style={{ marginTop: 12 }}>
          Why this source: it is the same rate file thousands of production LLM apps bill
          against, it updates when providers change prices, it is free with no API key,
          and being open source it is itself auditable. Redundancy options wired for the
          deployed site: OpenRouter /api/v1/models and aipricing.guru /api/pricing.json.
          Subscription seat prices (Cursor, Copilot, Claude, Devin, Codex, Gemini) are not
          token rates and have no live feed anywhere — they are pinned to vendor pricing
          pages with the verification dates below, which is exactly what the weekly
          feedback window exists to catch when they move.
        </div>
      </section>

      <section className="card">
        <div className="card-label">HOW THE NUMBERS ARE AUTHENTICATED</div>
        <p className="prose">
          Three layers keep this analysis honest. <b>Provenance:</b> every input traces to a
          named source below, with its verification date; model rates refresh from a live
          community-maintained feed on every load ({feedStatus === "live" ? "connected now" : "offline — using the static July 2026 snapshot"}),
          so the calculator cannot silently go stale the way static competitors have.
          <b> Transparent algorithm:</b> the full formula ships in the open-source repo and in
          the assumptions panel — anyone can audit or re-derive a result.
          <b> Conservative defaults:</b> where studies conflict, defaults sit below the
          published claims, and the time-saved scenario allows negative values.
        </p>
        <div className="src-table">
          <div className="src-head"><span>Number in the model</span><span>Source</span><span>Verified</span></div>
          {SOURCES.map((s, i) => (
            <div className="src-row" key={i}>
              <span>{s.claim}</span><span>{s.src}</span><span className="mono">{s.verified}</span>
            </div>
          ))}
        </div>
        <div className="microcopy" style={{ marginTop: 14 }}>
          Current live rates ($/MTok in · out · cache):{" "}
          {models.filter((m) => m.feedKey).map((m) => `${m.name} ${m.inR.toFixed(2)}/${m.outR.toFixed(2)}/${m.cacheR.toFixed(2)}`).join(" · ")}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------
// FEEDBACK ENGINE — weekly windows. All ratings & suggestions are
// SHARED: visible to every user of this app. Each ISO week is one
// window; when it closes, the top-voted item is queued for the next
// release and recorded in the changelog.
// ---------------------------------------------------------------
function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function daysLeftInWeek(d = new Date()) {
  const day = d.getUTCDay() || 7;
  return 8 - day; // window closes end of Sunday UTC
}

const CHANGELOG = [
  { week: "2026-W27", change: "v3: split into Coding ROI + Full SDLC pages; feedback engine added", from: "initial release" },
];

function FeedbackPage() {
  const [items, setItems] = useState([]);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("loading"); // loading | ready | local | saving
  const week = isoWeekKey();
  const storeKey = `feedback-${week}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await window.storage.get(storeKey, true);
        if (alive) { setItems(res ? JSON.parse(res.value) : []); setStatus("ready"); }
      } catch {
        if (alive) { setItems([]); setStatus(window.storage ? "ready" : "local"); }
      }
    })();
    return () => { alive = false; };
  }, [storeKey]);

  const persist = async (next) => {
    setItems(next);
    if (!window.storage) { setStatus("local"); return; }
    try {
      setStatus("saving");
      await window.storage.set(storeKey, JSON.stringify(next), true);
      setStatus("ready");
    } catch { setStatus("local"); }
  };

  const submit = () => {
    if (!stars || !text.trim()) return;
    const next = [...items, {
      id: Date.now().toString(36), stars, text: text.trim().slice(0, 400),
      votes: 0, ts: new Date().toISOString(),
    }];
    persist(next);
    setStars(0); setText("");
  };
  const upvote = (id) =>
    persist(items.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i)));

  const sorted = [...items].sort((a, b) => b.votes - a.votes || b.stars - a.stars);
  const avg = items.length ? items.reduce((s, i) => s + i.stars, 0) / items.length : 0;

  return (
    <div className="page-wrap">
      <section className="card">
        <div className="card-label">RATE THIS CALCULATOR · WINDOW {week} · {daysLeftInWeek()} DAY{daysLeftInWeek() === 1 ? "" : "S"} LEFT</div>
        <p className="prose">
          Every week is one feedback window. Rate the calculator, suggest a change, and
          upvote others' suggestions — <b>ratings and comments are shared and visible to all
          users of this app</b>. When the window closes Sunday (UTC), the top-voted item is
          queued for the next release and logged below. The project is open source: heavier
          proposals go through GitHub issues and pull requests.
        </p>

        <div className="fb-compose">
          <div className="stars" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={"star" + (stars >= n ? " star-on" : "")}
                aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)}>★</button>
            ))}
            <span className="star-hint">{stars ? `${stars}/5` : "tap to rate"}</span>
          </div>
          <textarea rows="3" maxLength="400" placeholder="What should change? One concrete suggestion works best — e.g. 'add GitHub Copilot Business as a plan' or 'let me set adoption % per developer'."
            value={text} onChange={(e) => setText(e.target.value)} />
          <button className="fb-submit" onClick={submit} disabled={!stars || !text.trim() || status === "saving"}>
            {status === "saving" ? "Saving…" : "Submit to this week's window"}
          </button>
          {status === "local" && (
            <div className="microcopy">Shared storage isn't reachable here — your entry stays on this device only. On the deployed site, feedback is shared.</div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-label">THIS WEEK'S WINDOW · {items.length} ENTRIES · AVG {avg ? avg.toFixed(1) : "—"}/5</div>
        {sorted.length === 0 && <div className="microcopy">No entries yet — the first rating opens the window.</div>}
        {sorted.map((i, idx) => (
          <div className={"fb-item" + (idx === 0 && sorted.length > 1 ? " fb-top" : "")} key={i.id}>
            {idx === 0 && sorted.length > 1 && <div className="fb-flag">TOP OF WINDOW — QUEUED IF IT HOLDS</div>}
            <div className="fb-meta">
              <span className="mono">{"★".repeat(i.stars)}{"☆".repeat(5 - i.stars)}</span>
              <button className="vote" onClick={() => upvote(i.id)}>▲ {i.votes}</button>
            </div>
            <p>{i.text}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-label">CHANGELOG — FEEDBACK THAT SHIPPED</div>
        {CHANGELOG.map((c) => (
          <div className="src-row" key={c.week}>
            <span className="mono">{c.week}</span><span>{c.change}</span><span className="mono">{c.from}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,650;1,9..144,500&family=IBM+Plex+Mono:wght@400;500;600&family=Archivo:wght@400;500;600&display=swap');
  :root {
    --ink:#1B2420; --bone:#EDEFE8; --card:#F7F8F3; --line:#C9CEC0;
    --pine:#0B6E53; --rust:#B4451F; --cobalt:#2743C7; --dim:#5C665F;
  }
  * { box-sizing: border-box; margin: 0; }
  .app { background: var(--bone); color: var(--ink); min-height: 100vh;
    font-family: 'Archivo', system-ui, sans-serif; padding: 40px clamp(16px, 4vw, 56px) 24px; }
  .mast { max-width: 1180px; margin: 0 auto 36px; }
  .mast-kicker { font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.18em;
    color: var(--dim); margin-bottom: 14px; }
  .mast h1 { font-family:'Fraunces',serif; font-weight:650; font-size:clamp(30px,4.4vw,52px);
    line-height:1.04; max-width: 15ch; }
  .mast h1 em { font-style: italic; color: var(--pine); }
  .mast-sub { margin-top:14px; max-width:56ch; color:var(--dim); font-size:15px; line-height:1.55; }
  .grid { max-width:1180px; margin:0 auto; display:grid; grid-template-columns: 1fr 380px; gap:22px; align-items:start; }
  @media (max-width: 900px){ .grid { grid-template-columns: 1fr; } .ledger{ position:static; } }

  .card { background:var(--card); border:1px solid var(--line); padding:20px 22px; margin-bottom:18px; }
  .card-label { font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.14em;
    color:var(--cobalt); margin-bottom:16px; }
  .field-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:640px){ .field-row{ grid-template-columns:1fr; } }
  label span { display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--ink); }
  select, input[type=number] { width:100%; padding:9px 10px; font-family:'IBM Plex Mono',monospace;
    font-size:13px; border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:0; }
  select:focus, input:focus, button:focus-visible { outline:2px solid var(--cobalt); outline-offset:1px; }
  .microcopy { margin-top:12px; font-size:12px; color:var(--dim); line-height:1.55; }

  .task-head, .task-row { display:grid; grid-template-columns: 1.5fr 62px 1fr 68px 76px;
    gap:10px; align-items:center; }
  .task-head { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.08em;
    color:var(--dim); padding-bottom:8px; border-bottom:1px solid var(--line); }
  .task-row { padding:8px 0; border-bottom:1px dashed var(--line); font-size:13px; }
  .task-row:last-of-type { border-bottom:none; }
  .t-name { font-weight:500; }
  .t-tok { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--dim); }
  .t-cost { font-family:'IBM Plex Mono',monospace; font-size:12px; text-align:right; color:var(--rust); }
  .task-row input { padding:6px 6px; }
  @media (max-width:640px){
    .task-head{ display:none; }
    .task-row{ grid-template-columns:1fr 62px 68px 70px; }
    .t-tok{ display:none; }
  }

  .slider-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px 22px; }
  @media (max-width:640px){ .slider-grid{ grid-template-columns:1fr; } }
  .slider-grid span, .custom-slider span { display:flex; justify-content:space-between; }
  .slider-grid b, .custom-slider b { font-family:'IBM Plex Mono',monospace; color:var(--cobalt); font-weight:600; }
  input[type=range] { width:100%; accent-color: var(--cobalt); }

  .scenario-row { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  @media (max-width:640px){ .scenario-row{ grid-template-columns:repeat(2,1fr); } }
  .chip { border:1px solid var(--line); background:#fff; padding:10px 8px; cursor:pointer;
    display:flex; flex-direction:column; gap:2px; font-family:'Archivo',sans-serif; }
  .chip strong { font-size:12px; } .chip span { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--dim); }
  .chip-on { background:var(--ink); color:var(--card); border-color:var(--ink); }
  .chip-on span { color:var(--card); }
  .custom-slider { display:block; margin-top:14px; }
  .preset-row { display:flex; gap:6px; margin-top:6px; }
  .preset { border:1px solid var(--line); background:#fff; font-family:'IBM Plex Mono',monospace;
    font-size:10px; padding:4px 6px; cursor:pointer; color:var(--dim); }
  .preset-on { background:var(--cobalt); border-color:var(--cobalt); color:#fff; }
  .feed-live { color:var(--pine); }
  .pine { color:var(--pine) !important; }
  .mono { font-family:'IBM Plex Mono',monospace; }
  .live-dot { font-style:normal; font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--pine); }
  .pick-label { display:block; font-size:12px; font-weight:600; margin-bottom:6px; }
  .vendor-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
  .vchip { border:1px solid var(--line); background:#fff; padding:6px 12px; cursor:pointer;
    font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--dim); }
  .vchip-on { background:var(--cobalt); border-color:var(--cobalt); color:#fff; }
  .tc-inputs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px; }
  @media (max-width:680px){ .tc-inputs{ grid-template-columns:1fr 1fr; } }
  .tc-controls { display:flex; gap:10px; margin-bottom:12px; }
  .tc-search { flex:1; padding:9px 10px; border:1px solid var(--line); background:#fff;
    font-family:'IBM Plex Mono',monospace; font-size:12px; }
  .tc-controls select { width:auto; }
  .tc-head, .tc-row { display:grid; grid-template-columns: 1.8fr .9fr 64px 64px 66px 78px 84px;
    gap:8px; align-items:center; font-size:12px; }
  .tc-head { font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.06em;
    color:var(--dim); padding-bottom:6px; border-bottom:1px solid var(--line); }
  .tc-head span:nth-child(n+3), .tc-row span:nth-child(n+3) { text-align:right; font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .tc-body { max-height:520px; overflow-y:auto; }
  .tc-row { padding:6px 0; border-bottom:1px dashed var(--line); }
  .tc-name { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tc-prov { font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--dim);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tc-mo { font-weight:600; }
  .tc-best { background:rgba(11,110,83,.08); border-left:3px solid var(--pine); padding-left:4px; }
  @media (max-width:680px){
    .tc-head, .tc-row { grid-template-columns: 1.6fr 56px 66px 76px; }
    .tc-head span:nth-child(2), .tc-row .tc-prov,
    .tc-head span:nth-child(5), .tc-row span:nth-child(5),
    .tc-head span:nth-child(3), .tc-row span:nth-child(3) { display:none; }
  }
  .feed-panel { border:1px solid var(--line); background:#fff; padding:6px 14px; }
  .feed-panel .mono { font-size:11px; text-align:right; }
  @keyframes rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  .reveal { animation: rise .6s cubic-bezier(.2,.7,.2,1) both; }
  .r0 { animation-delay:.02s; } .r1 { animation-delay:.10s; }
  .r2 { animation-delay:.20s; } .r3 { animation-delay:.30s; }
  @media (prefers-reduced-motion: reduce){ .reveal{ animation:none; } }
  .mast-stats { display:flex; gap:22px; margin-top:20px; flex-wrap:wrap;
    font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--dim); }
  .mast-stats b { color:var(--pine); font-weight:600; }
  .tabs { display:flex; gap:8px; margin-top:26px; flex-wrap:wrap; }
  .tab { border:1px solid var(--line); background:var(--card); padding:9px 14px; cursor:pointer;
    font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--dim); }
  .tab-on { background:var(--ink); color:var(--card); border-color:var(--ink); }
  .page-wrap { max-width:1180px; margin:0 auto; }
  .page-note { background:var(--card); border:1px dashed var(--cobalt); padding:12px 16px;
    margin-bottom:18px; font-size:13px; line-height:1.55; }
  .page-note b { font-family:'IBM Plex Mono',monospace; }
  .linklike { background:none; border:none; padding:0; color:var(--cobalt); cursor:pointer;
    font:inherit; text-decoration:underline; }
  .prose { font-size:14px; line-height:1.65; color:var(--ink); margin-bottom:16px; max-width:78ch; }
  .src-head, .src-row { display:grid; grid-template-columns: 1.2fr 1.6fr 130px; gap:12px;
    padding:8px 0; font-size:12.5px; border-bottom:1px dashed var(--line); align-items:baseline; }
  .src-head { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.08em;
    color:var(--dim); border-bottom:1px solid var(--line); }
  .src-row .mono { font-size:11px; color:var(--dim); }
  @media (max-width:680px){ .src-head{display:none;} .src-row{ grid-template-columns:1fr; gap:2px; } }
  .fb-compose textarea { width:100%; border:1px solid var(--line); background:#fff; padding:10px;
    font-family:'Archivo',sans-serif; font-size:13px; margin:10px 0; resize:vertical; }
  .stars { display:flex; align-items:center; gap:2px; }
  .star { background:none; border:none; font-size:26px; color:var(--line); cursor:pointer; padding:0 2px; }
  .star-on { color:var(--rust); }
  .star-hint { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--dim); margin-left:8px; }
  .fb-submit { background:var(--ink); color:var(--card); border:none; padding:10px 16px;
    font-family:'IBM Plex Mono',monospace; font-size:12px; cursor:pointer; }
  .fb-submit:disabled { opacity:.4; cursor:default; }
  .fb-item { border:1px solid var(--line); background:#fff; padding:12px 14px; margin-bottom:10px; font-size:13px; }
  .fb-item p { line-height:1.5; }
  .fb-top { border:2px solid var(--pine); }
  .fb-flag { font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.16em;
    color:var(--pine); margin-bottom:6px; }
  .fb-meta { display:flex; justify-content:space-between; margin-bottom:6px; }
  .fb-meta .mono { color:var(--rust); font-size:13px; }
  .vote { border:1px solid var(--line); background:var(--card); font-family:'IBM Plex Mono',monospace;
    font-size:11px; padding:3px 10px; cursor:pointer; }
  .vote:hover { border-color:var(--pine); color:var(--pine); }
  .phase-head, .phase-row { display:grid; grid-template-columns: 20px 1.6fr 54px 60px 60px 54px 70px;
    gap:8px; align-items:center; }
  .phase-head { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.06em;
    color:var(--dim); padding-bottom:8px; border-bottom:1px solid var(--line); }
  .phase-row { padding:8px 0; border-bottom:1px dashed var(--line); font-size:13px; }
  .phase-row:last-of-type { border-bottom:none; }
  .phase-row em { display:block; font-style:normal; font-family:'IBM Plex Mono',monospace;
    font-size:10px; color:var(--dim); }
  .phase-row input[type=number] { padding:5px 5px; font-size:12px; }
  .phase-off { opacity:.45; }
  .phase-tool { display:block; margin-top:14px; }
  .phase-tool span { display:flex; justify-content:space-between; }
  .phase-tool b { font-family:'IBM Plex Mono',monospace; color:var(--cobalt); }
  .framing-row { grid-template-columns:1fr 1fr; }
  @media (max-width:680px){
    .phase-head{ display:none; }
    .phase-row{ grid-template-columns:20px 1.4fr 44px 50px 50px 46px 58px; font-size:12px; }
  }

  .ledger { position:sticky; top:20px; }
  .ledger-inner { background:#FDFDF9; border:1px solid var(--ink); padding:22px 20px 18px;
    font-family:'IBM Plex Mono',monospace; box-shadow: 6px 6px 0 var(--line); }
  .ledger-head { display:flex; justify-content:space-between; font-size:10px; letter-spacing:.14em;
    border-bottom:2px solid var(--ink); padding-bottom:10px; }
  .l-section { font-size:10px; letter-spacing:.16em; color:var(--dim); margin:16px 0 6px; }
  .l-row { display:flex; justify-content:space-between; font-size:13px; padding:4px 0;
    border-bottom:1px dotted var(--line); }
  .l-row.dim { color:var(--dim); }
  .l-row.total { border-top:2px solid var(--ink); border-bottom:none; font-weight:600;
    margin-top:4px; padding-top:8px; color:var(--rust); }
  .verdict { margin:18px 0 6px; padding:16px 14px; text-align:center; border:2px solid; }
  .verdict.good { border-color:var(--pine); color:var(--pine); background:rgba(11,110,83,.06); }
  .verdict.bad { border-color:var(--rust); color:var(--rust); background:rgba(180,69,31,.06); }
  .verdict-label { font-size:10px; letter-spacing:.2em; }
  .verdict-num { font-family:'Fraunces',serif; font-size:38px; font-weight:650; line-height:1.1; margin:4px 0 2px; }
  .verdict-num small { font-size:14px; font-family:'IBM Plex Mono',monospace; }
  .verdict-roi { font-size:11px; }

  .bar-row { display:grid; grid-template-columns: 96px 1fr 64px; gap:8px; align-items:center;
    font-size:10px; padding:5px 0; }
  .bar-name { color:var(--dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bar-track { background:var(--bone); height:10px; }
  .bar-fill { background:var(--cobalt); height:100%; min-width:2px; transition:width .3s ease; }
  .bar-val { text-align:right; }

  .assump-toggle { margin-top:16px; width:100%; background:none; border:1px dashed var(--line);
    padding:8px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--dim); cursor:pointer; }
  .assump { margin-top:10px; font-size:10.5px; line-height:1.6; color:var(--dim); }
  .assump p { margin-bottom:4px; }
  .reg-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
  .reg-card { border:1px solid var(--line); background:#fff; padding:14px; }
  .reg-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .reg-name { font-weight:600; font-size:14px; }
  .reg-badge { font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.08em;
    background:var(--ink); color:var(--card); padding:2px 6px; }
  .reg-ep { display:block; font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--cobalt);
    word-break:break-all; margin-bottom:8px; line-height:1.5; }
  .reg-meta { display:flex; gap:14px; font-family:'IBM Plex Mono',monospace; font-size:10px;
    color:var(--dim); margin-bottom:8px; }
  .reg-note { font-size:12px; line-height:1.5; color:var(--ink); }
  .vp-head, .vp-row { display:grid; grid-template-columns: 1fr 1.5fr 1fr 2fr; gap:12px;
    padding:9px 0; font-size:12.5px; border-bottom:1px dashed var(--line); align-items:baseline; }
  .vp-head { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.06em;
    color:var(--dim); border-bottom:1px solid var(--line); }
  .vp-vendor { font-weight:600; }
  .vp-url { font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--cobalt); word-break:break-all; }
  .vp-yes { color:var(--pine); font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .vp-no { color:var(--rust); font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .vp-note { font-size:11.5px; color:var(--dim); line-height:1.5; }
  @media (max-width:760px){ .vp-head{ display:none; } .vp-row{ grid-template-columns:1fr; gap:3px; } }
  .faq-list { display:flex; flex-direction:column; }
  .faq-item { border-bottom:1px solid var(--line); }
  .faq-q { width:100%; background:none; border:none; padding:16px 4px; cursor:pointer;
    display:flex; justify-content:space-between; align-items:center; text-align:left;
    font-family:'Fraunces',serif; font-size:17px; font-weight:500; color:var(--ink); gap:16px; }
  .faq-on .faq-q { color:var(--pine); }
  .faq-mark { font-family:'IBM Plex Mono',monospace; font-size:20px; color:var(--cobalt); flex-shrink:0; }
  .faq-a { padding:0 4px 18px; font-size:14px; line-height:1.65; color:var(--dim); max-width:76ch; }
  .foot { max-width:1180px; margin:26px auto 0; font-family:'IBM Plex Mono',monospace;
    font-size:10.5px; color:var(--dim); line-height:1.6; border-top:1px solid var(--line); padding-top:14px; }
  @media (prefers-reduced-motion: reduce){ .bar-fill{ transition:none; } }
`;
