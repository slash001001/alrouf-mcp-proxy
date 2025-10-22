import express from "express";
import anis from "./api/anis.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

app.post("/api/anis", wrap(anis));
app.post("/api/mcp", wrap(anis));

app.use((req, res) => {
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

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.statusCode = err?.statusCode || 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: false,
      command: req.body?.command ?? null,
      dest: null,
      data: { error: "Internal server error" },
    })
  );
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Anis automation proxy running on http://localhost:${port}`);
});
