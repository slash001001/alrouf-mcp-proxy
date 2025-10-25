#!/usr/bin/env node
import { setTimeout as delay } from 'timers/promises';

const healthUrl = process.env.SSE_URL ?? process.argv[2] ?? 'http://localhost:3000/sse';

async function readFirstEvent(response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let aggregated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    aggregated += decoder.decode(value, { stream: true });

    if (aggregated.includes('\n\n')) {
      break;
    }

    // guard against never-ending streams when nothing arrives
    await delay(10);
  }

  return aggregated.trim();
}

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    });

    const payload = await readFirstEvent(response);

    if (!payload.includes('MCP Connector is live ✅')) {
      console.error(`❌ Unexpected payload from ${healthUrl}: ${payload}`);
      process.exitCode = 1;
      return;
    }

    console.log(`✅ SSE endpoint responded with expected heartbeat: ${payload}`);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ Timed out while waiting for response from ${healthUrl}`);
    } else {
      console.error(`❌ Failed to read SSE endpoint: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

await main();
