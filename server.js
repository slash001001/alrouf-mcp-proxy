import express from "express";
import anisHandler from "./api/anis.js";
import mcpHandler from "./api/mcp.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const forward = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          command: req.body?.command ?? null,
          dest: null,
          data: { error: "Internal server error" },
        })
      );
    }
  }
};

app.use("/api/anis", forward(anisHandler));
app.use("/api/mcp", forward(mcpHandler));

app.all("*", (req, res) => {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: false,
      command: null,
      dest: null,
      data: { error: "Not Found" },
    })
  );
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Anis automation proxy running on http://localhost:${port}`);
});
