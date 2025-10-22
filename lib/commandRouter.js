const N8N_COMMANDS = new Set(["run", "report", "summary", "email", "sheet"]);

const SUPPORTED_DESCRIPTORS = [
  "run (n8n)",
  "report (n8n)",
  "summary (n8n)",
  "email (n8n)",
  "sheet (n8n)",
  "git:* (GitHub repository_dispatch)",
  "zap:* (Zapier webhook)",
  "http (custom HTTP request)",
  "status (integration health)",
  "help (this message)",
];

export class CommandRouterError extends Error {
  constructor(message, { status = 500, dest = null, data = {} } = {}) {
    super(message);
    this.name = "CommandRouterError";
    this.status = status;
    this.dest = dest;
    this.data = isPlainObject(data) ? data : { message: String(data) };
  }
}

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sanitizeCommand = (command) => command.trim();

const extractBaseCommand = (command) => {
  const [base] = command.split(/[:\s]/, 1);
  return base.toLowerCase();
};

const readResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    const json = JSON.parse(text);
    return isPlainObject(json) ? json : { message: json };
  } catch {
    return { message: text };
  }
};

const fetchWithCheck = (...args) => {
  if (typeof globalThis.fetch !== "function") {
    throw new CommandRouterError("Fetch API is not available in this runtime", {
      status: 500,
    });
  }
  return globalThis.fetch(...args);
};

const ensureEnv = (value, key) => {
  if (!value) {
    throw new CommandRouterError(`${key} is not configured`, {
      status: 500,
      data: { integration: key },
    });
  }
  return value;
};

const callWebhook = async ({ url, command, args, actor }) => {
  const response = await fetchWithCheck(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args, actor }),
  });

  const payload = await readResponse(response);

  if (!response.ok) {
    throw new CommandRouterError(
      payload.error ||
        payload.message ||
        `Webhook responded with ${response.status}`,
      {
        status: response.status,
        dest: url,
        data: {
          ...payload,
          status: response.status,
        },
      }
    );
  }

  return {
    ok: true,
    command,
    dest: url,
    data: {
      ...payload,
      status: response.status,
    },
  };
};

const triggerGitHubDispatch = async ({ command, args, token, repo, actor }) => {
  const url = `https://api.github.com/repos/${repo}/dispatches`;

  const response = await fetchWithCheck(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "alrouf-mcp-proxy",
    },
    body: JSON.stringify({
      event_type: command.replace(/[^a-z0-9_\-\.]/gi, "_").toLowerCase(),
      client_payload: { command, args, actor },
    }),
  });

  const payload = await readResponse(response);

  if (!response.ok) {
    throw new CommandRouterError(
      payload.error ||
        payload.message ||
        `GitHub API responded with ${response.status}`,
      {
        status: response.status,
        dest: url,
        data: {
          ...payload,
          status: response.status,
          repository: repo,
        },
      }
    );
  }

  return {
    ok: true,
    command,
    dest: url,
    data: {
      ...payload,
      status: response.status,
      repository: repo,
    },
  };
};

const callHttpEndpoint = async ({ command, args, actor }) => {
  const url = args?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new CommandRouterError("args.url must be a valid HTTP URL", {
      status: 400,
      data: { providedUrl: url },
    });
  }

  const method = (args.method || "POST").toUpperCase();
  const headers = isPlainObject(args.headers) ? { ...args.headers } : {};

  let body = args.body;

  if (isPlainObject(body)) {
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    body = JSON.stringify(body);
  } else if (typeof body !== "string" && body != null) {
    body = String(body);
  }

  const response = await fetchWithCheck(url, {
    method,
    headers,
    body,
  });

  const payload = await readResponse(response);

  if (!response.ok) {
    throw new CommandRouterError(
      payload.error ||
        payload.message ||
        `HTTP request failed with ${response.status}`,
      {
        status: response.status,
        dest: url,
        data: {
          ...payload,
          status: response.status,
          method,
        },
      }
    );
  }

  return {
    ok: true,
    command,
    dest: url,
    data: {
      ...payload,
      status: response.status,
      method,
    },
  };
};

const buildStatus = ({ env, actor }) => ({
  ok: true,
  command: "status",
  dest: "local",
  data: {
    timestamp: new Date().toISOString(),
    actor,
    integrations: {
      n8n: Boolean(env.N8N_WEBHOOK_URL),
      zapier: Boolean(env.ZAPIER_WEBHOOK_URL),
      github: Boolean(env.GH_TOKEN),
      mcpToken: Boolean(env.MCP_TOKEN),
    },
  },
});

const buildHelp = ({ actor }) => ({
  ok: true,
  command: "help",
  dest: "local",
  data: {
    actor,
    supported: SUPPORTED_DESCRIPTORS,
    usage: {
      run: { dest: "n8n", sample: { command: "run", args: { workflow: "email_executive_assistant" } } },
      git: { dest: "GitHub", sample: { command: "git:sync" } },
      zap: { dest: "Zapier", sample: { command: "zap:send_report", args: { report: "daily" } } },
      http: { dest: "HTTP", sample: { command: "http", args: { url: "https://example.com", method: "POST", body: { ping: true } } } },
    },
  },
});

export async function dispatchAutomationCommand(
  { command, args = {}, actor = "khaled" } = {},
  { env = process.env } = {}
) {
  if (!command || typeof command !== "string") {
    throw new CommandRouterError("command must be a non-empty string", {
      status: 400,
    });
  }

  if (args != null && !isPlainObject(args)) {
    throw new CommandRouterError("args must be an object if provided", {
      status: 400,
      data: { receivedType: typeof args },
    });
  }

  if (typeof actor !== "string" || !actor.trim()) {
    throw new CommandRouterError("actor must be a non-empty string", {
      status: 400,
    });
  }

  const normalized = sanitizeCommand(command);
  if (!normalized) {
    throw new CommandRouterError("command must contain non-whitespace text", {
      status: 400,
    });
  }

  const base = extractBaseCommand(normalized);

  if (base === "status") {
    return buildStatus({ env, actor });
  }

  if (base === "help") {
    return buildHelp({ actor });
  }

  if (N8N_COMMANDS.has(base)) {
    const url = ensureEnv(env.N8N_WEBHOOK_URL, "N8N_WEBHOOK_URL");
    return callWebhook({ url, command: normalized, args, actor });
  }

  if (base === "zap") {
    const url = ensureEnv(env.ZAPIER_WEBHOOK_URL, "ZAPIER_WEBHOOK_URL");
    return callWebhook({ url, command: normalized, args, actor });
  }

  if (base === "git") {
    const token = ensureEnv(env.GH_TOKEN, "GH_TOKEN");
    const repo = env.GH_REPO || "alrouf/n8n-automation-";
    return triggerGitHubDispatch({
      command: normalized,
      args,
      token,
      repo,
      actor,
    });
  }

  if (base === "http") {
    return callHttpEndpoint({ command: normalized, args, actor });
  }

  throw new CommandRouterError("Unsupported command", {
    status: 400,
    data: {
      command: normalized,
      supported: SUPPORTED_DESCRIPTORS,
    },
  });
}
