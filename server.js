import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import anis from "./api/anis.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const allowedOrigin = process.env.CORS_ORIGIN ?? "https://chat.openai.com";
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (origin === allowedOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"));
    },
    credentials: false,
  })
);

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

app.post("/api/anis", wrap(anis));
app.post("/api/mcp", wrap(anis));

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const heartbeat = () => {
    res.write(`data: MCP Connector is live ✅\n\n`);
  };

  heartbeat();
  const interval = setInterval(heartbeat, 15000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

const requireMcpToken = (req, res, next) => {
  const requiredToken = process.env.MCP_TOKEN;

  if (!requiredToken) {
    next();
    return;
  }

  const provided = req.header("x-mcp-token");
  if (provided !== requiredToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

const mcpServer = new McpServer({
  name: "alrouf-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "ping_connector",
  {
    title: "Ping Connector",
    description: "Health-check for the MCP proxy",
    inputSchema: z.object({}).optional(),
    outputSchema: z.object({
      ok: z.boolean(),
      message: z.string(),
      ts: z.string(),
    }),
  },
  async () => {
    const payload = {
      ok: true,
      message: "MCP Connector is live ✅",
      ts: new Date().toISOString(),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }
);

mcpServer.registerTool(
  "anis_command",
  {
    title: "Anis Command Router",
    description: "Forward commands to /api/anis",
    inputSchema: z.object({
      command: z.string(),
      context: z.string().optional(),
      options: z.record(z.any()).optional(),
    }),
    outputSchema: z
      .object({
        ok: z.boolean().optional(),
        status: z.string().optional(),
      })
      .passthrough(),
  },
  async ({ command, context, options }) => {
    const baseUrl = process.env.PUBLIC_BASE_URL?.trim();
    const configuredUrl = process.env.ANIS_URL?.trim();
    const localPort = process.env.PORT ?? 3000;
    const fallbackUrl = `http://localhost:${localPort}/api/anis`;
    const targetUrl =
      configuredUrl && configuredUrl.length > 0
        ? configuredUrl
        : baseUrl && baseUrl.length > 0
        ? new URL("/api/anis", baseUrl).href
        : fallbackUrl;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mcp-token": process.env.MCP_TOKEN ?? "",
      },
      body: JSON.stringify({ command, context, options, via: "mcp" }),
    });

    const data = await response.json();

    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: data,
    };
  }
);

mcpServer.registerTool(
  "fetch_url",
  {
    title: "Fetch URL",
    description: "Perform a GET request and return the response text",
    inputSchema: z.object({ url: z.string().url() }),
    outputSchema: z.object({
      status: z.number(),
      body: z.string().optional(),
    }),
  },
  async ({ url }) => {
    const response = await fetch(url);
    const text = await response.text();

    const payload = {
      status: response.status,
      body: text.slice(0, 4000),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }
);

const createTransport = () =>
  new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

app.options("/mcp", requireMcpToken, (req, res) => {
  res.setHeader("Allow", "GET,POST,OPTIONS");
  res.sendStatus(204);
});

app.all("/mcp", requireMcpToken, async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET,POST,OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const transport = createTransport();
  res.on("close", () => transport.close());

  await mcpServer.connect(transport);

  if (req.method === "GET") {
    await transport.handleRequest(req, res);
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    command: null,
    dest: null,
    data: { error: "Not Found" },
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(err?.statusCode ?? 500).json({
    ok: false,
    command: req.body?.command ?? null,
    dest: null,
    data: { error: "Internal server error" },
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`🚀 Server ready on http://localhost:${port} (MCP at /mcp)`);
});
