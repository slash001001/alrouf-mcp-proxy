import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Zapier Webhook URL
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/24702328/u12yr9m/";

// MCP Plugin metadata
app.get("/.well-known/ai-plugin.json", (req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Alrouf GI Manager",
    name_for_model: "alrouf_gi_manager",
    description_for_human: "Save & update GI docs into Google Drive via Zapier",
    description_for_model: "Use this tool to save or update GI documents via Zapier.",
    auth: { type: "none" },
    api: {
      type: "openapi",
      url: "https://" + req.get("host") + "/openapi.json"
    },
    logo_url: "https://" + req.get("host") + "/logo.png"
  });
});

// OpenAPI spec
app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.0.1",
    info: { title: "Alrouf GI Manager", version: "1.0.0" },
    servers: [{ url: "https://" + req.get("host") }],
    paths: {
      "/saveToGI": {
        post: {
          summary: "Create GI Document",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    fileName: { type: "string" },
                    content: { type: "string" }
                  },
                  required: ["fileName", "content"]
                }
              }
            }
          },
          responses: { "200": { description: "Document created" } }
        }
      },
      "/updateGI": {
        post: {
          summary: "Update GI Document",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    fileName: { type: "string" },
                    content: { type: "string" }
                  },
                  required: ["fileName", "content"]
                }
              }
            }
          },
          responses: { "200": { description: "Document updated" } }
        }
      }
    }
  });
});

// Save GI with immediate response
app.post("/saveToGI", async (req, res) => {
  const { fileName, content } = req.body;
  try {
    fetch(ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", fileName, content })
    });
    res.json({ status: "success", fileName, message: "Queued for Zapier" });
  } catch (error) {
    res.json({ status: "error", message: error.message });
  }
});

// Update GI with immediate response
app.post("/updateGI", async (req, res) => {
  const { fileName, content } = req.body;
  try {
    fetch(ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", fileName, content })
    });
    res.json({ status: "success", fileName, message: "Update queued for Zapier" });
  } catch (error) {
    res.json({ status: "error", message: error.message });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP Proxy running on http://localhost:${port}`);
});
