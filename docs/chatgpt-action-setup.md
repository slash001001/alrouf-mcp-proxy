# ChatGPT Action Setup — Alrouf MCP Proxy

Production proxy URL:

```text
https://alrouf-mcp-proxy.vercel.app
```

OpenAPI file:

```text
openapi/alrouf-ea-action.yaml
```

## Action authentication

Use API Key authentication.

- Auth type: API Key
- Header name: `x-mcp-token`
- Value: use the `MCP_TOKEN` stored in Vercel

Do not commit the token to GitHub.

## Basic tests after importing the Action

Ask the GPT:

```text
Check Alrouf connector health.
```

Expected call:

```text
GET /health
```

Then ask:

```text
Get Alrouf email intelligence stats.
```

Expected call:

```text
GET /api/alrouf-ea/stats
```

Then ask:

```text
Show the latest 5 RFQs from Alrouf.
```

Expected call:

```text
GET /api/alrouf-ea/rfqs?limit=5
```

## Recommended GPT instruction

```text
You are Alrouf Operating Brain. Use the Alrouf EA connector for email intelligence, RFQs, customers, follow-up gaps, review queues, and search. Always cite the tool result fields used. Never invent customer data. If a tool fails, state the failure and ask for retry. Treat all data as read-only. Never send emails, update Odoo, or perform external actions unless a separate explicit approval workflow exists.
```
