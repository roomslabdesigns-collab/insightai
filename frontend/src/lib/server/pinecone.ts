// Server-only Pinecone client over the REST API: hosted embeddings (llama-text-embed-v2, 1024 dims)
// plus a serverless index where every uploaded dataset gets its own namespace.

const API = "https://api.pinecone.io";
const VERSION = "2025-01";
const INDEX = process.env.PINECONE_INDEX || "insightai-feedback";
const DIM = 1024;
const EMBED_MODEL = "llama-text-embed-v2";
export const NAMESPACE_TTL_MS = 24 * 3600 * 1000;

function headers() {
  if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is not set");
  return { "Api-Key": process.env.PINECONE_API_KEY, "X-Pinecone-API-Version": VERSION, "Content-Type": "application/json" };
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers || {}) }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Pinecone ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

let hostCache: string | null = null;

async function host(): Promise<string> {
  if (hostCache) return hostCache;
  const res = await fetch(`${API}/indexes/${INDEX}`, { headers: headers() });
  if (res.status === 404) {
    await call(`${API}/indexes`, {
      method: "POST",
      body: JSON.stringify({ name: INDEX, dimension: DIM, metric: "cosine", spec: { serverless: { cloud: "aws", region: "us-east-1" } } }),
    });
    // A new serverless index takes a few seconds to become ready
    for (let i = 0; i < 30; i++) {
      const d = await call<{ host?: string; status?: { ready?: boolean } }>(`${API}/indexes/${INDEX}`);
      if (d.status?.ready && d.host) return (hostCache = `https://${d.host}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Pinecone index is still initialising. Try again shortly.");
  }
  if (!res.ok) throw new Error(`Pinecone ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = (await res.json()) as { host: string };
  return (hostCache = `https://${d.host}`);
}

export async function embed(texts: string[], inputType: "passage" | "query"): Promise<number[][]> {
  const out = await call<{ data: { values: number[] }[] }>(`${API}/embed`, {
    method: "POST",
    body: JSON.stringify({
      model: EMBED_MODEL,
      parameters: { input_type: inputType, truncate: "END" },
      inputs: texts.map((text) => ({ text })),
    }),
  });
  return out.data.map((d) => d.values);
}

export type Vector = { id: string; values: number[]; metadata: Record<string, string | number | boolean> };

export async function upsert(namespace: string, vectors: Vector[]) {
  await call(`${await host()}/vectors/upsert`, { method: "POST", body: JSON.stringify({ namespace, vectors }) });
}

export async function query(namespace: string, vector: number[], topK: number, filter?: Record<string, unknown>) {
  const out = await call<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>(`${await host()}/query`, {
    method: "POST",
    body: JSON.stringify({ namespace, vector, topK, includeMetadata: true, ...(filter ? { filter } : {}) }),
  });
  return out.matches || [];
}

/** Delete namespaces from uploads older than the TTL (names are ds-<epochMs>-<random>). */
export async function cleanupOldNamespaces() {
  const h = await host();
  const stats = await call<{ namespaces?: Record<string, unknown> }>(`${h}/describe_index_stats`, { method: "POST", body: "{}" });
  const cutoff = Date.now() - NAMESPACE_TTL_MS;
  for (const ns of Object.keys(stats.namespaces || {})) {
    const ts = Number(ns.split("-")[1]);
    if (ns.startsWith("ds-") && ts && ts < cutoff) {
      await call(`${h}/vectors/delete`, { method: "POST", body: JSON.stringify({ namespace: ns, deleteAll: true }) }).catch(() => {});
    }
  }
}
