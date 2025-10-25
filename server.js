import express from "express";
const app = express();

app.get("/health", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Connection", "close");
  return res.status(200).send(JSON.stringify({ ok: true, message: "MCP Connector ready ✅" }));
});

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

