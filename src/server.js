import http from "node:http";
import { buildReplyMessages, replyToLine, verifyLineSignature } from "./line.js";

const port = Number(process.env.PORT || 3000);
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const channelSecret = process.env.LINE_CHANNEL_SECRET;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readRawBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function handleWebhook(request, response) {
  if (!channelAccessToken || !channelSecret) {
    sendJson(response, 500, { ok: false, error: "LINE environment variables are missing" });
    return;
  }

  const rawBody = await readRawBody(request);
  const signature = request.headers["x-line-signature"];

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    sendJson(response, 401, { ok: false, error: "Invalid LINE signature" });
    return;
  }

  const body = JSON.parse(rawBody.toString("utf8"));
  const events = Array.isArray(body.events) ? body.events : [];

  await Promise.all(
    events.map(async (event) => {
      const messages = buildReplyMessages(event);
      await replyToLine(event.replyToken, messages, channelAccessToken);
    })
  );

  sendJson(response, 200, { ok: true });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/webhook") {
      await handleWebhook(request, response);
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`LINE webhook server is listening on http://localhost:${port}`);
});
