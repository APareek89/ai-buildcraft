import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/mcp/auth";

/**
 * RFC 9728 path-suffixed variant: clients connected to /mcp may GET
 * /.well-known/oauth-protected-resource/mcp — same metadata as the root doc.
 */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return NextResponse.json(
    {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    },
    { headers: { "cache-control": "public, max-age=3600", ...CORS_HEADERS } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
