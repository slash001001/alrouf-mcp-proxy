import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json());

// إنشاء خادم MCP رسمي
const mcp = new McpServer({
  name: "anis-proxy",
  version: "1.0.0",
  description: "Anis MCP proxy server built with official SDK."
});

// تسجيل أداة Ping
mcp.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Returns pong to confirm connectivity.",
    inputSchema: { type: "object", properties: {} }
  },
  async () => ({
    content: [{ type: "text", text: "pong ✅" }]
  })
);

// تسجيل أداة Health
mcp.registerTool(
  "health",
  {
    title: "Health",
    description: "Checks if server is alive.",
    inputSchema: { type: "object", properties: {} }
  },
  async () => ({
    content: [{ type: "text", text: "healthy ✅" }]
  })
);

// نقطة MCP رسمية (تستخدم Streamable HTTP)
app.all("/sse", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => transport.close());
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// مسار صحي سريع
app.get("/health", (req, res) => res.json({ ok: true, message: "MCP SDK server ready ✅" }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ Official MCP SDK server running on port " + port));

