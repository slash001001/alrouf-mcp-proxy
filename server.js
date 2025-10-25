import express from "express";
const app = express();

app.post("/mcp", (req, res) => {
  res.status(200).json({
    schema: "mcp/v1",
    name: "anis-proxy",
    version: "1.0.0",
    description: "Simple MCP connector providing ping and health actions.",
    actions: [
      { name: "ping", description: "Returns pong for connectivity test.", parameters: {} },
      { name: "health", description: "Checks server health.", parameters: {} }
    ]
  });
});

app.get("/health", (req, res) => res.json({ ok: true, message: "MCP Connector ready ✅" }));

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("data: MCP Connector is live ✅\\n\\n");
});

app.get("/", (req, res) => res.send("Anis MCP Proxy is running successfully 🚀"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ Anis MCP Proxy running on port " + port));

