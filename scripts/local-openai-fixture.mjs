import { randomUUID, timingSafeEqual } from "node:crypto";
import http from "node:http";

const host = process.env.FIXTURE_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.FIXTURE_PORT || "4010", 10);
const apiKey = process.env.FIXTURE_API_KEY || "local-fixture-key";
const apiKeys = [apiKey, ...(process.env.FIXTURE_EXTRA_KEYS || "").split(",").map((key) => key.trim()).filter(Boolean)];
const responseText = process.env.FIXTURE_RESPONSE_TEXT || "Yanchuaner autonomous AI model path passed.";
const models = new Set(["deepseek-chat", "deepseek-reasoner", "gpt-4.1-mini", "BAAI/bge-m3", "text-embedding-3-small"]);
const embeddingModels = new Set(["BAAI/bge-m3", "text-embedding-3-small"]);

if (!Number.isInteger(port) || port < 1 || port > 65_535 || apiKey.length < 16) {
  throw new Error("Fixture port or API key is invalid.");
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function hasValidAuthorization(request) {
  const actual = Buffer.from(request.headers.authorization || "");
  return apiKeys.some((key) => {
    const expected = Buffer.from(`Bearer ${key}`);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function completion(model, requestId) {
  return {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: responseText }, finish_reason: "stop" }],
    usage: { prompt_tokens: 7, completion_tokens: 9, total_tokens: 16 },
  };
}

function streamCompletion(response, model, requestId) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Fixture-Request-ID": requestId,
  });
  const base = {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  };
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: responseText }, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 9, total_tokens: 16 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function embeddingVector(input, dimension = 32) {
  const vector = [];
  for (let index = 0; index < dimension; index += 1) {
    let hash = 2166136261;
    const source = `${input}#${index}`;
    for (let offset = 0; offset < source.length; offset += 1) {
      hash ^= source.charCodeAt(offset);
      hash = Math.imul(hash, 16777619);
    }
    vector.push(((hash >>> 0) % 2000 - 1000) / 1000);
  }
  return vector;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { status: "ok", service: "local-openai-fixture" });
    return;
  }
  if (!hasValidAuthorization(request)) {
    json(response, 401, { error: { message: "invalid fixture credential", type: "authentication_error" } });
    return;
  }
  if (request.method === "GET" && url.pathname === "/v1/models") {
    json(response, 200, { object: "list", data: [...models].map((id) => ({ id, object: "model", owned_by: "local-fixture" })) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/embeddings") {
    try {
      const body = await readJson(request);
      if (!embeddingModels.has(body.model) || !Array.isArray(body.input) || body.input.length === 0) {
        json(response, 400, { error: { message: "invalid embedding request", type: "invalid_request_error" } });
        return;
      }
      const inputs = body.input.map((item) => (typeof item === "string" ? item : String(item?.input ?? "")));
      const data = inputs.map((input, index) => ({
        object: "embedding",
        index,
        embedding: embeddingVector(input),
      }));
      const promptTokens = inputs.reduce((sum, input) => sum + Math.ceil(input.length / 4), 0);
      json(response, 200, {
        object: "list",
        model: body.model,
        data,
        usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
      });
    } catch {
      json(response, 400, { error: { message: "invalid embedding payload", type: "invalid_request_error" } });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/audio/speech") {
    try {
      const body = await readJson(request);
      if (!body.model || typeof body.input !== "string" || !body.input) {
        json(response, 400, { error: { message: "invalid tts request", type: "invalid_request_error" } });
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "audio/mpeg",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    } catch {
      json(response, 400, { error: { message: "invalid tts payload", type: "invalid_request_error" } });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/images/generations") {
    try {
      const body = await readJson(request);
      if (!body.model || typeof body.prompt !== "string" || !body.prompt) {
        json(response, 400, { error: { message: "invalid image request", type: "invalid_request_error" } });
        return;
      }
      // 1×1 透明 PNG，用于本地验证画图链路。
      json(response, 200, {
        data: [
          {
            b64_json:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          },
        ],
      });
    } catch {
      json(response, 400, { error: { message: "invalid image payload", type: "invalid_request_error" } });
    }
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
    json(response, 404, { error: { message: "fixture route not found", type: "invalid_request_error" } });
    return;
  }
  try {
    const body = await readJson(request);
    if (!models.has(body.model) || !Array.isArray(body.messages) || body.messages.length === 0) {
      json(response, 400, { error: { message: "invalid fixture request", type: "invalid_request_error" } });
      return;
    }
    const requestId = `chatcmpl-fixture-${randomUUID()}`;
    if (body.stream === true) {
      streamCompletion(response, body.model, requestId);
      return;
    }
    json(response, 200, completion(body.model, requestId), { "X-Fixture-Request-ID": requestId });
  } catch (error) {
    const status = error instanceof Error && error.message === "request_too_large" ? 413 : 400;
    json(response, status, { error: { message: "invalid fixture payload", type: "invalid_request_error" } });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Local OpenAI fixture ready at http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
