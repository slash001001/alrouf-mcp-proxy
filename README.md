# Anis Alrouf MCP Proxy

Serverless MCP and HTTP proxy for Anis / ChatGPT / automation clients.

This repo includes a read-only connector for the Alrouf EA Email Intelligence API. Production credentials must stay only in deployment environment variables and must never be committed.

## What this proxy does

- Exposes MCP tools over `/sse`.
- Exposes simple HTTP commands over `/api/anis` and `/api/mcp`.
- Proxies safe read-only Alrouf EA calls under `/api/alrouf-ea/*`.
- Keeps the EA credential server-side so clients do not receive it.

## Main endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Proxy health |
| `/sse` | ALL | MCP Streamable HTTP endpoint |
| `/api/anis` | POST | Structured command router |
| `/api/mcp` | POST | Alias of `/api/anis` |
| `/api/alrouf-ea/stats` | GET | EA corpus counters |
| `/api/alrouf-ea/rfqs` | GET | RFQ records |
| `/api/alrouf-ea/emails` | GET | Filtered email intelligence records |
| `/api/alrouf-ea/search` | POST | Full text email search |
| `/api/alrouf-ea/follow_up_gaps` | GET | Follow-up gaps |
| `/api/alrouf-ea/review_queue` | GET | Human review queue |
| `/api/alrouf-ea/schema` | GET | Schema metadata |

## MCP tools

- `ping`
- `health`
- `alrouf_ea_stats`
- `alrouf_ea_emails`
- `alrouf_ea_rfqs`
- `alrouf_ea_customer`
- `alrouf_ea_search`
- `alrouf_ea_follow_up_gaps`
- `alrouf_ea_review_queue`
- `alrouf_ea_schema`
- `alrouf_ea_sql`

## Environment variables

```bash
MCP_TOKEN="strong-random-token"
ALROUF_EA_BASE_URL="https://radar.leenai.ai/ea/api"
ALROUF_EA_API_KEY="rotated-ea-key"
PORT=3000
```

## Local run

```bash
npm install && npm start
```

## Smoke test

```bash
npm run smoke
```

For deployed proxy:

```bash
CONNECTOR_BASE_URL="https://YOUR_DEPLOYMENT_DOMAIN" MCP_TOKEN="your-token" npm run smoke
```

## Command examples

```bash
curl -X POST "$CONNECTOR_BASE_URL/api/anis" -H "Content-Type: application/json" -H "x-mcp-token: $MCP_TOKEN" -d '{"command":"status"}'
```

```bash
curl -X POST "$CONNECTOR_BASE_URL/api/anis" -H "Content-Type: application/json" -H "x-mcp-token: $MCP_TOKEN" -d '{"command":"alrouf:rfqs","args":{"since":"2026-05-01","min_confidence":80,"limit":20}}'
```

## Guardrails

- Read-only connector behavior.
- No email sending.
- No Odoo writes.
- No committed credentials or customer exports.
