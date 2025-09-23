import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

// --- CORS so ChatGPT can reach it ---
app.use(cors({
  origin: "*",
  allowedHeaders: ["Content-Type", "Mcp-Session-Id".toLowerCase(), "mcp-session-id"],
  exposedHeaders: ["Mcp-Session-Id"],
  methods: ["POST", "GET", "DELETE", "OPTIONS"]
}));

// Healthcheck
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({ ok: true, name: "alrouf-gi-mcp", version: "1.0.0" });
});

// Zapier Webhook (configure via env var if you like)
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL || "https://hooks.zapier.com/hooks/catch/24702328/u12yr9m/";

// Helper: build a fresh MCP server per request (stateless)
function buildServer() {
  const server = new McpServer({ name: "alrouf-gi-mcp", version: "1.0.0" });

  // Tool: saveToGI (create new doc)
  server.registerTool(
    "saveToGI",
    {
      title: "Create GI Document",
      description: "Create a new GI Google Doc in the Alrouf Knowledge Base via Zapier",
      inputSchema: {
        fileName: z.string().min(1),
        content: z.string().min(1)
      }
    },
    async ({ fileName, content }) => {
      try {
        await fetch(ZAPIER_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", fileName, content })
        });
        return { content: [{ type: "text", text: `Queued create for "${fileName}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err && err.message) || String(err)}` }], isError: true };
      }
    }
  );

  // Tool: updateGI (append to existing doc)
  server.registerTool(
    "updateGI",
    {
      title: "Update GI Document",
      description: "Append content to an existing GI Google Doc via Zapier",
      inputSchema: {
        fileName: z.string().min(1),
        content: z.string().min(1)
      }
    },
    async ({ fileName, content }) => {
      try {
        await fetch(ZAPIER_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", fileName, content })
        });
        return { content: [{ type: "text", text: `Queued update for "${fileName}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err && err.message) || String(err)}` }], isError: true };
      }
    }
  );

  return server;
}

// MCP (Streamable HTTP) — Stateless handler
app.options("/mcp", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.status(204).end();
});

app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      try { transport.close(); } catch {}
      try { server.close(); } catch {}
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
});

// Optional legacy endpoints to be explicit
app.get("/mcp", (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null
  });
});

app.delete("/mcp", (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Alrouf GI MCP running on http://localhost:${port}`);
});
