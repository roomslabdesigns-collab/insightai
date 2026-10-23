// POST {namespace?: string, rows: Row[]} (max 90) -> {namespace}. Embeds rows with Pinecone's hosted
// model and upserts them, with their labels as metadata, into this dataset's namespace.
import { NextResponse } from "next/server";
import { fail, overLimit, tooMany } from "@/lib/server/guard";
import { cleanupOldNamespaces, embed, upsert } from "@/lib/server/pinecone";
import { rowToMetadata, type Row } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (overLimit(req, "index")) return tooMany();
  try {
    const body = (await req.json()) as { namespace?: string; rows: Row[] };
    const rows = (body.rows || []).slice(0, 90).map((r) => ({ ...r, text: String(r.text).slice(0, 1000) }));
    let namespace = body.namespace;
    if (!namespace || !/^ds-\d+-[a-z0-9]+$/.test(namespace)) {
      namespace = `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await cleanupOldNamespaces().catch(() => {}); // a new dataset: drop uploads older than 24h
    }
    if (rows.length) {
      const vectors = await embed(rows.map((r) => r.text), "passage");
      await upsert(namespace, rows.map((r, i) => ({ id: r.id, values: vectors[i], metadata: rowToMetadata(r) })));
    }
    return NextResponse.json({ namespace, indexed: rows.length });
  } catch (e) {
    return fail(e);
  }
}
