import { CommandRouterError, dispatchAutomationCommand } from "../lib/commandRouter.js";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MiB

const applyCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
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
  try {
    applyCors(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, { ok: true, message: "ready" });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,GET,OPTIONS");
      sendJson(res, 405, {
        ok: false,
        command: null,
        dest: null,
        data: { error: "Method not allowed" },
      });
      return;
    }

    const contentType = findHeader(req.headers, "content-type");
    if (!contentType) {
      sendJson(res, 200, { ok: true, message: "handshake ok" });
      return;
    }

    let bodyValue;
    try {
      bodyValue = await readJsonBody(req);
    } catch (error) {
      const status = error instanceof CommandRouterError ? error.status : 400;
      sendJson(
        res,
        status,
        formatErrorPayload({
          error,
          command: null,
          dest: null,
          actor: undefined,
        })
      );
      return;
    }

    const command = typeof bodyValue?.command === "string" ? bodyValue.command : "";
    const actor = typeof bodyValue?.actor === "string" ? bodyValue.actor : undefined;
    const args = bodyValue?.args;
    const hasCommand = command.trim().length > 0;

    if (!hasCommand) {
      sendJson(res, 200, { ok: true, message: "handshake ok" });
      return;
    }

    try {
      validateToken(req.headers);
    } catch (error) {
      const status = error instanceof CommandRouterError ? error.status : 401;
      sendJson(
        res,
        status,
        formatErrorPayload({
          error,
          command,
          dest: null,
          actor,
        })
      );
      return;
    }

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
        formatErrorPayload({
          error: safeError,
          command,
          dest: null,
          actor,
        })
      );
    }
  } catch (error) {
    if (!res.headersSent) {
      sendJson(
        res,
        500,
        formatErrorPayload({
          error: new Error("Internal server error"),
          command: null,
          dest: null,
          actor: undefined,
        })
      );
    }
  }
}
