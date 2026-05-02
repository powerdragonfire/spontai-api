# spontai-api

Spontai's public API + MCP server. The traveler memory layer for the agent web.

After deploy:
- API docs (Scalar): https://api.spontai.com/docs
- MCP server: https://api.spontai.com/mcp
- OpenAPI 3.1 spec: https://api.spontai.com/openapi.json

## Local development

```sh
bun install
cp .dev.vars.example .dev.vars   # fill in local values
bun run dev                       # starts wrangler dev on http://localhost:8787
bun test                          # runs the bun test suite
bun run typecheck                 # tsc --noEmit
bun run lint                      # biome check
```

## Stack

Hono on Cloudflare Workers, TypeScript strict, Bun for dev/test/install, Biome for lint/format. See CLAUDE.md for project conventions.
