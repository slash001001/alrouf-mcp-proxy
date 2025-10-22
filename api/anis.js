import { CommandRouterError, dispatchAutomationCommand } from "../lib/commandRouter.js";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MiB

const applyCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-mcp-token");
};

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_SIZE) {
      throw new CommandRouterError("Request body too large", {
        status: 413,
      });
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new CommandRouterError("Body must be valid JSON", { status: 400 });
  }
};

const findHeader = (headers, name) => {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
};

const validateToken = (headers) => {
  const expected = process.env.MCP_TOKEN;
  const provided = findHeader(headers, "x-mcp-token");

  if (expected) {
    if (!provided || provided !== expected) {
      throw new CommandRouterError("Unauthorized", { status: 401 });
    }
    return;
  }

  if (provided) {
    throw new CommandRouterError("Unauthorized", { status: 401 });
  }
};

const formatErrorPayload = ({ error, command, dest, actor }) => ({
  ok: false,
  command: command ?? null,
  dest: dest ?? null,
  data: {
    error: error.message,
    actor: actor ?? undefined,
    details:
      error instanceof CommandRouterError
        ? error.data
        : { message: "Unexpected error" },
  },
});

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST,OPTIONS");
    sendJson(res, 405, {
      ok: false,
      command: null,
      dest: null,
      data: { error: "Method not allowed" },
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const status = error instanceof CommandRouterError ? error.status : 400;
    sendJson(
      res,
      status,
      formatErrorPayload({ error, command: body?.command, dest: null, actor: body?.actor })
    );
    return;
  }

  try {
    validateToken(req.headers);
  } catch (error) {
    const status = error instanceof CommandRouterError ? error.status : 401;
    sendJson(
      res,
      status,
      formatErrorPayload({ error, command: body?.command, dest: null, actor: body?.actor })
    );
    return;
  }

  const command = body?.command;
  const args = body?.args;
  const actor = body?.actor;

  try {
    const result = await dispatchAutomationCommand({ command, args, actor });
    sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof CommandRouterError) {
      sendJson(
        res,
        error.status,
        formatErrorPayload({
          error,
          command,
          dest: error.dest,
          actor,
        })
      );
      return;
    }

    const safeError = new Error("Internal server error");
    sendJson(
      res,
      500,
      formatErrorPayload({ error: safeError, command, dest: null, actor })
    );
  }
}
