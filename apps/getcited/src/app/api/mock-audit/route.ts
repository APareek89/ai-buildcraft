import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {readJson,route} from "@/lib/server/http";
import { InProcessPanelRunner, MemoryGeoStore } from "@/lib/geo";

/**
 * Public, key-free demo audit. Runs the real measurement pipeline in FORCED MOCK
 * mode against an in-memory store, so a visitor sees the exact SoV output shape
 * without any API keys or external calls. Deterministic per input.
 */
const Body = z.object({
  brand: z.string().trim().min(1).max(60),
  competitors: z.array(z.string().trim().min(1).max(60)).min(1).max(4),
});

export const POST=route(async function POST(request: NextRequest) {
  const json = await readJson(request,4096);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a brand and 1–4 competitors." },
      { status: 400 },
    );
  }

  const runner = new InProcessPanelRunner(new MemoryGeoStore(), {
    costCapUsd: 0,
    keys: {},
    forceMock: true,
  });

  try {
    const out = await runner.run({
      brand: parsed.data.brand,
      competitors: parsed.data.competitors,
      prompt_set_id: "demo",
      panel: ["haiku"],
    });
    return NextResponse.json({
      brand: out.brand,
      share_of_voice: out.share_of_voice,
      per_prompt: out.per_prompt,
      answer_count: out.answer_count,
      mock: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Audit failed" },
      { status: 500 },
    );
  }
});
