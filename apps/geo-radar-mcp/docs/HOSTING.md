# Optional HTTP hosting

Start with the local stdio mock panel in [README.md](../README.md). This collection has not provisioned a remote service.

For a loopback HTTP preview, build the workspace and set `MCP_TRANSPORT=http`, `PORT=8080`, `GEO_STORE=memory` and a newly generated `MCP_API_KEY`. Run `node apps/mcp-server/dist/index.js`. The MCP route is `POST /mcp`; `GET /healthz` is a liveness probe. Memory storage resets on restart. Keep provider keys absent for synthetic panel output.

A remote installation needs your own HTTPS domain, runtime secrets, persistent PostgreSQL and migrations. The optional queue path also needs Redis and a separately managed worker. `render.yaml` is a resource template, not a provisioned service. Configure quotas and review the [scaling notes](../SCALING.md) before exposing it.

OAuth support has multiple explicit modes. Set `OAUTH_MODE`, `OAUTH_ISSUER` and `OAUTH_AUDIENCE` consistently with the chosen identity provider and your own public origin. Proxy mode exposes this service's same-origin OAuth endpoints and delegates identity to the upstream issuer. Bearer-token validation and audience checks remain required. Do not treat mock issuer tests as proof that a particular connector or identity-provider deployment is configured correctly.

The browser dashboard and MCP server share the configured data store. Review authentication, retention, tenant boundaries and actual connector behavior in your environment. No OAuth application, user account, provider credential or infrastructure identifier is bundled in the collection.
