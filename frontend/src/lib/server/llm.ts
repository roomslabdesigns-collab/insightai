// Server-only LLM client. Keys come from environment variables and never reach the browser.
// Providers are tried in priority order (Groq first, Gemini as backup). Within a provider, calls rotate
// between models, and a model that hits a rate limit is skipped until its cooldown ends.

type Endpoint = { provider: string; model: string; baseUrl: string; key: string };

const list = (v: string | undefined, fallback: string) =>
  (v || fallback).split(",").map((s) => s.trim()).filter(Boolean);

function groups(): Endpoint[][] {
  const out: Endpoint[][] = [];
  if (process.env.GROQ_API_KEY) {
    const baseUrl = "https://api.groq.com/openai/v1";
    out.push(list(process.env.GROQ_MODELS, "openai/gpt-oss-120b,openai/gpt-oss-20b").map((model) => ({ provider: "groq", model, baseUrl, key: process.env.GROQ_API_KEY! })));
  }
  if (process.env.GEMINI_API_KEY) {
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
    out.push(list(process.env.GEMINI_MODELS, "gemini-3.5-flash-lite,gemini-3.1-flash-lite").map((model) => ({ provider: "gemini", model, baseUrl, key: process.env.GEMINI_API_KEY! })));
  }
  return out;
}

const cooldown = new Map<string, number>();
const nextIndex = new Map<number, number>();

function pick(): Endpoint | null {
  const now = Date.now();
  const gs = groups();
  for (let g = 0; g < gs.length; g++) {
    for (let k = 0; k < gs[g].length; k++) {
      const i = nextIndex.get(g) || 0;
      nextIndex.set(g, i + 1);
      const ep = gs[g][i % gs[g].length];
      if ((cooldown.get(ep.model) || 0) <= now) return ep;
    }
  }
  return null;
}

// Reasoning models spend extra tokens "thinking"; keep that minimal for labelling and short answers
const modelOptions = (model: string) => (model.includes("gpt-oss") || model.includes("gemini") ? { reasoning_effort: "low" } : {});

export function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?|```$/gm, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON");
    return JSON.parse(m[0]);
  }
}

export type Usage = { provider: string; model: string; prompt_tokens?: number; completion_tokens?: number };

export class QuotaError extends Error {}

export async function chatJson(system: string, user: string, retries = 4): Promise<{ data: Record<string, unknown>; usage: Usage }> {
  if (!groups().length) throw new Error("No LLM configured: set GROQ_API_KEY and/or GEMINI_API_KEY");
  let attempts = 0;
  let lastError = "";
  const started = Date.now();
  while (attempts < retries) {
    const ep = pick();
    if (!ep) {
      const wait = Math.min(...cooldown.values()) - Date.now();
      // Serverless functions are short-lived: only wait out short cooldowns
      if (wait > 20_000 || Date.now() - started > 40_000) throw new QuotaError("All AI models are busy or out of free quota. Try again in a minute.");
      await new Promise((r) => setTimeout(r, Math.max(1000, wait)));
      continue;
    }
    attempts++;
    try {
      const res = await fetch(`${ep.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ep.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ep.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          ...modelOptions(ep.model),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429) {
        const text = await res.text();
        const daily = /per day|PerDay|Request too large/i.test(text);
        const retryAfter = Number(res.headers.get("retry-after")) || 20;
        cooldown.set(ep.model, Date.now() + (daily ? 3_600_000 : Math.min(retryAfter, 60) * 1000));
        attempts--; // rate limits are expected on free tiers; only real failures count
        lastError = `${ep.model} rate-limited`;
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        cooldown.set(ep.model, Date.now() + 3_600_000);
        attempts--;
        lastError = `${ep.model} unavailable (${res.status})`;
        continue;
      }
      if (!res.ok) {
        lastError = `${ep.model} error ${res.status}`;
        continue;
      }
      const body = await res.json();
      const data = parseJson(body.choices?.[0]?.message?.content || "");
      return {
        data,
        usage: { provider: ep.provider, model: body.model || ep.model, prompt_tokens: body.usage?.prompt_tokens, completion_tokens: body.usage?.completion_tokens },
      };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`AI call failed: ${lastError}`);
}
