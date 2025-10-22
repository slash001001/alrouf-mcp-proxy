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
| `/api/anis` | POST | Primary router for ChatGPT / automations |
| `/api/mcp`  | POST | Alias of `/api/anis` to keep legacy clients working |

Only `POST` (and `OPTIONS` for CORS) are supported.

## Command Routing

| Command | Destination |
| ------- | ----------- |
| `run`, `report`, `summary`, `email`, `sheet` | `N8N_WEBHOOK_URL` |
| `git:*` | GitHub `repository_dispatch` (`n8n-automation-`) |
| `zap:*` | `ZAPIER_WEBHOOK_URL` |
| `http` | Arbitrary HTTP call using `args.url`, `args.method`, `args.body` |
| `status` | Local health summary |

Unknown commands return a structured help message with supported prefixes.

## Environment Variables

Copy `.env.example` and supply:

```
MCP_TOKEN=           # Optional: required header x-mcp-token if set
N8N_WEBHOOK_URL=     # Required for run/report/summary/email/sheet
ZAPIER_WEBHOOK_URL=  # Required for zap:* commands
GH_TOKEN=            # Required for git:* commands
GH_REPO=alrouf/n8n-automation-  # Optional override repository
```

## Local Development

```bash
npm install
npm start
```

The express server proxies `/api/anis` and `/api/mcp` to the same router used in production.

## Test Requests

```
curl -X POST http://localhost:3000/api/anis \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $MCP_TOKEN" \
  -d '{"command":"status"}'
```

Replace `status` with `run`, `git:sync`, etc. to validate routing.
