// POST {samples: string[]} -> {themes: Theme[]}. The LLM proposes a theme taxonomy for this dataset.
import { NextResponse } from "next/server";
import { clip, fail, overLimit, tooMany } from "@/lib/server/guard";
import { chatJson } from "@/lib/server/llm";
import { GENERAL_THEME, type Theme } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM = `You design a feedback taxonomy for a product team.
Given a sample of customer feedback, propose 5 to 8 themes that together cover the main topics
(problems, requests, and praise). Theme names are 2-4 words, specific to this product, and mutually exclusive.
Always include "${GENERAL_THEME}" for praise and vague comments.
Respond with JSON only: {"themes": [{"name": "...", "description": "one sentence"}]}`;

export async function POST(req: Request) {
  if (overLimit(req, "themes")) return tooMany();
  try {
    const { samples } = (await req.json()) as { samples: string[] };
    const lines = (samples || []).slice(0, 80).map((s, i) => `${i + 1}. ${clip(s, 300)}`).join("\n");
    const { data } = await chatJson(SYSTEM, `Feedback sample:\n${lines}`);
    const raw = Array.isArray(data.themes) ? (data.themes as Theme[]) : [];
    const themes = raw
      .filter((t) => t && typeof t.name === "string" && t.name.trim())
      .map((t) => ({ name: clip(t.name, 40).trim(), description: clip(t.description, 160) }))
      .slice(0, 9);
    if (!themes.some((t) => t.name === GENERAL_THEME)) themes.push({ name: GENERAL_THEME, description: "Praise and vague comments." });
    return NextResponse.json({ themes });
  } catch (e) {
    return fail(e);
  }
}
