# Alrouf GI MCP (Remote Server)

A minimal **Model Context Protocol** server exposing two tools for Alrouf GI:

- `saveToGI(fileName, content)` → creates a Google Doc via Zapier
- `updateGI(fileName, content)` → appends content to an existing Doc via Zapier

## Deploy (Vercel)
1) Create a new repo and upload `server.js`, `package.json`, `vercel.json`  
2) Import the repo into Vercel → Deploy  
3) (Optional) Set env var `ZAPIER_WEBHOOK_URL` in Vercel → redeploy

## Connect in ChatGPT (Developer Mode → New Connector)
- **MCP Server URL**: `https://YOUR_DOMAIN.vercel.app/mcp`
- **Auth**: None (unless you add your own)
- After connect, tools should appear: `saveToGI`, `updateGI`

## Quick Self-Test (curl)
Initialize:
```
curl -sX POST https://YOUR_DOMAIN.vercel.app/mcp   -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"curl","version":"0.1"},"capabilities":{}}}'
```

List tools:
```
curl -sX POST https://YOUR_DOMAIN.vercel.app/mcp   -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":"2","method":"tools/list","params":{}}'
```

Call a tool (example):
```
curl -sX POST https://YOUR_DOMAIN.vercel.app/mcp   -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"saveToGI","arguments":{"fileName":"GI_Test_MCP","content":"Hello from MCP"}}}'
```
