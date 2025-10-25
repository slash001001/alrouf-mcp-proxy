# Anis Automation Proxy

Serverless automation proxy that routes MCP commands to the correct backend:

- **n8n Cloud** for operational workflows
- **GitHub repository dispatch** for heavy/async tasks (`n8n-automation-`)
- **Zapier** for Google Docs / Slack actions
- **Direct HTTP** calls when required

All responses share the shape `{ ok, command, dest, data }`.

## Endpoints

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/sse` | GET | Server-Sent Events health stream emitting "MCP Connector is live ✅" |
| `/mcp` | GET/POST | Streamable HTTP MCP server exposing tools (ping, anis command, fetch URL) |
| `/api/anis` | POST | Primary router for ChatGPT / automations |
| `/api/mcp`  | POST | Legacy alias of `/api/anis` |

`/sse` is a lightweight health indicator used by ChatGPT Developer Mode. `/mcp` requires `Content-Type: application/json` and speaks the [Model Context Protocol Streamable HTTP](https://modelcontextprotocol.io/docs/concepts/transports/streamable-http) transport. `/api/*` endpoints also support `OPTIONS` for CORS preflight.

## Command Routing

| Command | Destination |
| ------- | ----------- |
| `run`, `report`, `summary`, `email`, `sheet` | `N8N_WEBHOOK_URL` |
| `git:*` | GitHub `repository_dispatch` (`n8n-automation-`) |
| `zap:*` | `ZAPIER_WEBHOOK_URL` |
| `http` | Arbitrary HTTP call using `args.url`, `args.method`, `args.body` |
| `status` | Local health summary |
| `help` | Lists supported commands and sample payloads |

Unknown commands return a structured help message with supported prefixes.

## Environment Variables

Copy `.env.example` and supply:

```
MCP_TOKEN=           # Required header x-mcp-token for MCP + /api routes
CORS_ORIGIN=         # Allowed browser origin (defaults to https://chat.openai.com)
N8N_WEBHOOK_URL=     # Required for run/report/summary/email/sheet
ZAPIER_WEBHOOK_URL=  # Required for zap:* commands
GH_TOKEN=            # Required for git:* commands
GITHUB_TOKEN=        # Required for installing @modelcontextprotocol/sdk from GitHub Packages
ANIS_URL=            # Optional override for /api/anis target when proxying via MCP
PUBLIC_BASE_URL=     # Public deployment URL (used to resolve default ANIS_URL)
PORT=3000            # Local dev port (auto-detected in production)
VERCEL_ORG_ID=       # Optional: enable vercel CLI deployments
VERCEL_PROJECT_ID=   # Optional: enable vercel CLI deployments
```

### Required `.npmrc`

The SDK is currently distributed through the GitHub Packages registry. Commit an `.npmrc` file alongside the project with:

```
@modelcontextprotocol:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Set `GITHUB_TOKEN` to a Personal Access Token with the `read:packages` scope locally and inside Vercel so that `npm install` can authenticate.

## Local Development

```bash
npm install
npm start
```

The express server hosts the MCP transport on `/mcp` in addition to `/api/anis`.

## Test Requests

```bash
# Stream the SSE health endpoint
curl -N http://localhost:3000/sse

# Ping the MCP transport
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $MCP_TOKEN" \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"tools/call",
    "params":{"name":"ping_connector","arguments":{}}
  }'

# Route a command via MCP -> /api/anis
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $MCP_TOKEN" \
  -d '{
    "jsonrpc":"2.0",
    "id":"2",
    "method":"tools/call",
    "params":{"name":"anis_command","arguments":{"command":"status"}}
  }'

# Direct call to /api/anis
curl -s -X POST http://localhost:3000/api/anis \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $MCP_TOKEN" \
  -d '{"command":"status"}'
```

Replace `status` with `run`, `git:sync`, etc. to validate routing.
