import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/mcp/auth";

/**
 * RFC 9728 protected-resource metadata — tells MCP clients (Claude) which
 * authorization server guards /mcp (ourselves; same-origin self-hosted AS).
 * Shape ported from geo-radar's protectedResourceMetadata(). `resource` MUST
 * match the URL clients connect to (audience binding) — the legacy connector
 * URL https://geo-radar-mcp.onrender.com/mcp, hence top-level /mcp.
 */
function metadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  };
}

// CORS on the GET too (not just OPTIONS): claude.ai's web client fetches this
// doc from the browser; the live geo-radar server sends it and we must match.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function GET(req: NextRequest) {
  return NextResponse.json(metadata(publicOrigin(req)), {
    headers: { "cache-control": "public, max-age=3600", ...CORS_HEADERS },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
