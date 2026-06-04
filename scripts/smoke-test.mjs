const BASE = (process.env.CONNECTOR_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
const MCP_TOKEN = process.env.MCP_TOKEN || "";

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(MCP_TOKEN ? { "x-mcp-token": MCP_TOKEN } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 800)}`);
  }
  return body;
}

async function main() {
  console.log(`Smoke testing ${BASE}`);

  const health = await request("/health");
  console.log("/health:", health);
  if (!health.ok) throw new Error("Health endpoint did not return ok=true");

  const status = await request("/api/anis", {
    method: "POST",
    body: JSON.stringify({ command: "status" })
  });
  console.log("/api/anis status:", status);
  if (!status.ok) throw new Error("/api/anis status failed");

  if (process.env.ALROUF_EA_API_KEY) {
    const stats = await request("/api/anis", {
      method: "POST",
      body: JSON.stringify({ command: "alrouf:stats" })
    });
    console.log("alrouf:stats:", JSON.stringify(stats).slice(0, 1200));
    if (!stats.ok) throw new Error("alrouf:stats returned ok=false");
  } else {
    console.log("Skipping live EA stats because ALROUF_EA_API_KEY is not set.");
  }

  console.log("Smoke test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
