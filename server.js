import express from "express";
const app = express();
app.use(express.json());

app.post("/mcp", (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== "2.0") return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });

  if (method === "tools/list") {
    const result = {
      tools: [
        { name: "ping", description: "Returns pong for connectivity test.", inputSchema: { type: "object", properties: {} } },
        { name: "health", description: "Checks server health.", inputSchema: { type: "object", properties: {} } }
      ]
    };
    return res.json({ jsonrpc: "2.0", id, result });
  }

  if (method === "tools/call" && params?.name === "ping") {
    const result = { content: [{ type: "text", text: "pong ✅" }] };
    return res.json({ jsonrpc: "2.0", id, result });
  }

  if (method === "tools/call" && params?.name === "health") {
    const result = { content: [{ type: "text", text: "healthy ✅" }] };
    return res.json({ jsonrpc: "2.0", id, result });
  }

  return res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

app.get("/health", (req, res) => res.json({ ok: true, message: "MCP Connector ready ✅" }));

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const hello = { jsonrpc: "2.0", method: "mcp/hello", params: { name: "anis-proxy", version: "1.0.0" } };
  res.write("data: " + JSON.stringify(hello) + "\\n\\n");
  const timer = setInterval(() => res.write("data: {\"type\":\"heartbeat\"}\\n\\n"), 30000);
  req.on("close", () => clearInterval(timer));
});

app.get("/", (req, res) => res.send("Anis MCP Proxy is running successfully 🚀"));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ Anis MCP Proxy running on port " + port));

