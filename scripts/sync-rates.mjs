// Sync model prices from the LiteLLM registry into public/rates.json.
// Run by .github/workflows/sync-rates.yml daily, so the deployed app serves a
// git-versioned snapshot (auditable: `git log public/rates.json`) and never
// depends on a third party being up at request time.
//
// Swap SOURCE for a different registry if preferred — both return per-token
// input/output prices; adjust the shape mapping accordingly:
//   models.dev:  https://models.dev/api.json
//   OpenRouter:  https://openrouter.ai/api/v1/models
import { writeFile, mkdir } from "node:fs/promises";

const SOURCE =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error("Rate sync failed:", res.status, res.statusText);
  process.exit(1);
}
const data = await res.json();
const count = Object.keys(data).length;

await mkdir("public", { recursive: true });
await writeFile("public/rates.json", JSON.stringify(data));
console.log(`Synced ${count} models to public/rates.json at ${new Date().toISOString()}`);
