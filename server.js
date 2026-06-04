import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const MCP_TOKEN = process.env.MCP_TOKEN || "";
const EA_BASE_URL = (process.env.ALROUF_EA_BASE_URL || "https://radar.leenai.ai/ea/api").replace(/\/+$/, "");
const EA_API_KEY = process.env.ALROUF_EA_API_KEY || "";

const JSON_HEADERS = { "Content-Type": "application/json" };

function requireMcpToken(req, res, next) {
  if (!MCP_TOKEN) return next();
  const provided = req.headers["x-mcp-token"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (provided !== MCP_TOKEN) return res.status(401).json({ ok: false, error: "Missing or invalid MCP token" });
  return next();
}

function assertEaConfigured() {
  if (!EA_API_KEY) {
    const error = new Error("ALROUF_EA_API_KEY is not configured on the server");
    error.status = 500;
    throw error;
  }
}

function sanitizePath(path) {
  const clean = String(path || "").replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.includes("//")) {
    const error = new Error("Invalid path");
    error.status = 400;
    throw error;
  }
  return clean;
}

function isAllowedProxyCall(method, path) {
  const p = sanitizePath(path);
  const getPatterns = [
    /^health$/,
    /^me$/,
    /^stats$/,
    /^emails(?:\/[^/]+)?$/,
    /^analyses(?:\/[^/]+)?$/,
    /^attachments(?:\/[^/]+)?$/,
    /^customers(?:\/[^/]+)?$/,
    /^rfqs$/,
    /^aggregations\/(products|risk_flags|inquiry_types)$/,
    /^mailboxes$/,
    /^follow_up_gaps$/,
    /^review_queue$/,
    /^schema(?:\/[^/]+)?$/,
    /^tables\/[^/]+$/,
    /^everything\/[^/]+$/
  ];
  if (method === "GET") return getPatterns.some((rx) => rx.test(p));
  if (method === "POST") return /^(search|sql)$/.test(p);
  return false;
}

function validateReadOnlySql(q) {
  const sql = String(q || "").trim();
  if (!sql) throw Object.assign(new Error("SQL query is required"), { status: 400 });
  if (!/^(select|with|explain)\b/i.test(sql)) {
    throw Object.assign(new Error("Only read-only SELECT/WITH/EXPLAIN SQL is allowed"), { status: 400 });
  }
  if (sql.split(";").filter((x) => x.trim()).length > 1) {
    throw Object.assign(new Error("Multiple SQL statements are not allowed"), { status: 400 });
  }
  const forbidden = /\b(insert|update|delete|drop|attach|detach|pragma|vacuum|create|alter|replace|begin|commit|rollback|trigger)\b/i;
  if (forbidden.test(sql)) {
    throw Object.assign(new Error("Forbidden SQL token in read-only connector"), { status: 400 });
  }
  return sql;
}

function addQueryParams(url, params = {}) {
  for (const [key, raw] of Object.entries(params || {})) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) raw.forEach((v) => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(raw));
  }
}

async function callEaApi(path, { method = "GET", params = {}, body = undefined } = {}) {
  const cleanPath = sanitizePath(path);
  assertEaConfigured();

  if (!isAllowedProxyCall(method, cleanPath)) {
    const error = new Error(`Proxy route not allowed: ${method} /${cleanPath}`);
    error.status = 405;
    throw error;
  }

  if (cleanPath === "sql" && method === "POST") {
    body = { ...(body || {}), q: validateReadOnlySql(body?.q) };
  }

  const url = new URL(`${EA_BASE_URL}/${cleanPath}`);
  addQueryParams(url, params);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${EA_API_KEY}`,
      ...(body ? JSON_HEADERS : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(typeof payload === "string" ? payload : payload?.error || `EA API returned ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function toToolText(payload) {
  return {
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }]
  };
}

function toolError(error) {
  return toToolText({ ok: false, error: error.message, status: error.status || 500 });
}

function pickDefined(input, keys) {
  const out = {};
  for (const key of keys) {
    if (input?.[key] !== undefined && input?.[key] !== null && input?.[key] !== "") out[key] = input[key];
  }
  return out;
}

async function runTool(path, args = {}, method = "GET") {
  try {
    const payload = await callEaApi(path, {
      method,
      params: method === "GET" ? args : {},
      body: method === "POST" ? args : undefined
    });
    return toToolText(payload);
  } catch (error) {
    return toolError(error);
  }
}

const mcp = new McpServer({
  name: "anis-alrouf-mcp-proxy",
  version: "1.1.0",
  description: "Anis MCP proxy with read-only Alrouf EA Email Intelligence tools."
});

const optionalLimitOffset = {
  limit: z.number().int().min(1).max(500).optional().default(20),
  offset: z.number().int().min(0).optional().default(0)
};

mcp.registerTool(
  "ping",
  { title: "Ping", description: "Returns pong to confirm MCP connectivity.", inputSchema: {} },
  async () => toToolText({ ok: true, message: "pong" })
);

mcp.registerTool(
  "health",
  { title: "Health", description: "Checks if the MCP proxy and Alrouf EA connector environment are configured.", inputSchema: {} },
  async () =>
    toToolText({
      ok: true,
      service: "anis-alrouf-mcp-proxy",
      ea_base_url: EA_BASE_URL,
      ea_api_key_configured: Boolean(EA_API_KEY),
      mcp_token_required: Boolean(MCP_TOKEN)
    })
);

mcp.registerTool(
  "alrouf_ea_stats",
  { title: "Alrouf EA Stats", description: "Get top-line counters across the Alrouf email intelligence corpus.", inputSchema: {} },
  async () => runTool("stats")
);

mcp.registerTool(
  "alrouf_ea_emails",
  {
    title: "Alrouf EA Emails",
    description: "Search/list Alrouf email intelligence records using safe filters.",
    inputSchema: {
      mailbox: z.string().optional(),
      sender: z.string().optional(),
      domain: z.string().optional(),
      direction: z.enum(["inbound", "outbound", "internal"]).optional(),
      category: z.string().optional(),
      inquiry_type: z.string().optional(),
      since: z.string().optional(),
      until: z.string().optional(),
      search: z.string().optional(),
      has_attachments: z.boolean().optional(),
      sales_related: z.boolean().optional(),
      needs_review: z.boolean().optional(),
      min_confidence: z.number().min(0).max(100).optional(),
      max_confidence: z.number().min(0).max(100).optional(),
      include_body: z.boolean().optional(),
      include_analysis: z.boolean().optional(),
      ...optionalLimitOffset
    }
  },
  async (args = {}) => runTool("emails", args)
);

mcp.registerTool(
  "alrouf_ea_rfqs",
  {
    title: "Alrouf EA RFQs",
    description: "List RFQ-tagged emails with extracted products, quantities, deadlines, action, and evidence.",
    inputSchema: {
      customer: z.string().optional(),
      since: z.string().optional(),
      until: z.string().optional(),
      min_confidence: z.number().min(0).max(100).optional().default(0),
      ...optionalLimitOffset
    }
  },
  async (args = {}) => runTool("rfqs", args)
);

mcp.registerTool(
  "alrouf_ea_customer",
  {
    title: "Alrouf EA Customer Memory",
    description: "Get a customer's memory card and recent email timeline.",
    inputSchema: {
      customer: z.string().min(1),
      email_limit: z.number().int().min(1).max(500).optional().default(50)
    }
  },
  async (args = {}) => runTool(`customers/${encodeURIComponent(args.customer)}`, pickDefined(args, ["email_limit"]))
);

mcp.registerTool(
  "alrouf_ea_search",
  {
    title: "Alrouf EA Full Text Search",
    description: "Free-text search over email subject/body, optionally only sales-related emails.",
    inputSchema: {
      q: z.string().min(1),
      sales_related_only: z.boolean().optional().default(true),
      limit: z.number().int().min(1).max(500).optional().default(20)
    }
  },
  async (args = {}) => runTool("search", args, "POST")
);

mcp.registerTool(
  "alrouf_ea_follow_up_gaps",
  {
    title: "Alrouf EA Follow-Up Gaps",
    description: "Find cold conversations and follow-up gaps, filterable by severity.",
    inputSchema: {
      severity: z.string().optional(),
      ...optionalLimitOffset
    }
  },
  async (args = {}) => runTool("follow_up_gaps", args)
);

mcp.registerTool(
  "alrouf_ea_review_queue",
  {
    title: "Alrouf EA Review Queue",
    description: "List low-confidence calls awaiting human confirmation.",
    inputSchema: optionalLimitOffset
  },
  async (args = {}) => runTool("review_queue", args)
);

mcp.registerTool(
  "alrouf_ea_schema",
  {
    title: "Alrouf EA Schema",
    description: "Inspect allowed EA database schema metadata. Use before SQL.",
    inputSchema: { table: z.string().optional() }
  },
  async (args = {}) => runTool(args.table ? `schema/${encodeURIComponent(args.table)}` : "schema")
);

mcp.registerTool(
  "alrouf_ea_sql",
  {
    title: "Alrouf EA Read-Only SQL",
    description: "Run a read-only SELECT/WITH/EXPLAIN query against the EA database. Never use for writes.",
    inputSchema: {
      q: z.string().min(1),
      params: z.array(z.any()).optional()
    }
  },
  async (args = {}) => runTool("sql", args, "POST")
);

app.all("/sse", requireMcpToken, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => transport.close());
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (req, res) =>
  res.json({
    ok: true,
    service: "anis-alrouf-mcp-proxy",
    ea_base_url: EA_BASE_URL,
    ea_api_key_configured: Boolean(EA_API_KEY),
    mcp_token_required: Boolean(MCP_TOKEN)
  })
);

app.all("/api/alrouf-ea/*", requireMcpToken, async (req, res) => {
  const path = req.params[0];
  try {
    const payload = await callEaApi(path, {
      method: req.method,
      params: req.query,
      body: ["POST", "PUT", "PATCH"].includes(req.method) ? req.body : undefined
    });
    res.json({ ok: true, source: "alrouf-ea", path, data: payload });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message, status: error.status || 500 });
  }
});

async function handleAnisRouter(req, res) {
  const { command, args = {} } = req.body || {};
  try {
    if (command === "status") return res.json({ ok: true, command, dest: "local", data: { ea_configured: Boolean(EA_API_KEY) } });
    if (command === "alrouf:stats") return res.json({ ok: true, command, dest: "alrouf-ea", data: await callEaApi("stats") });
    if (command === "alrouf:rfqs") return res.json({ ok: true, command, dest: "alrouf-ea", data: await callEaApi("rfqs", { params: args }) });
    if (command === "alrouf:emails") return res.json({ ok: true, command, dest: "alrouf-ea", data: await callEaApi("emails", { params: args }) });
    if (command === "alrouf:search") return res.json({ ok: true, command, dest: "alrouf-ea", data: await callEaApi("search", { method: "POST", body: args }) });
    if (command === "alrouf:sql") return res.json({ ok: true, command, dest: "alrouf-ea", data: await callEaApi("sql", { method: "POST", body: args }) });
    return res.status(400).json({ ok: false, error: "Unsupported command", supported: ["status", "alrouf:stats", "alrouf:rfqs", "alrouf:emails", "alrouf:search", "alrouf:sql"] });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, command, error: error.message, status: error.status || 500 });
  }
}

app.post("/api/anis", requireMcpToken, handleAnisRouter);
app.post("/api/mcp", requireMcpToken, handleAnisRouter);

app.listen(PORT, () => console.log(`Anis Alrouf MCP proxy running on port ${PORT}`));
