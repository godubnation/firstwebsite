import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const STATIC_DIRECTORY = fileURLToPath(new URL("./dist/", import.meta.url));
const REPLICATE_API = "https://api.replicate.com/v1/predictions";
const MODEL_VERSION = "95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";
const MAX_BODY_BYTES = 15 * 1024 * 1024;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("图片过大，请选择 10 MB 以内的图片。");
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求内容格式不正确。");
  }
}

function validateImageDataUrl(value) {
  if (typeof value !== "string") return false;
  return /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value);
}

async function replicateRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.detail || data.error || `Replicate 请求失败（${response.status}）`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return data;
}

async function runPrediction(image, token) {
  let prediction = await replicateRequest(REPLICATE_API, token, {
    method: "POST",
    headers: {
      Prefer: "wait=60",
      "Cancel-After": "2m"
    },
    body: JSON.stringify({ version: MODEL_VERSION, input: { image } })
  });

  const deadline = Date.now() + 90_000;
  while (!TERMINAL_STATUSES.has(prediction.status) && !prediction.output) {
    if (Date.now() > deadline) throw new Error("处理时间较长，请稍后重试。");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    prediction = await replicateRequest(prediction.urls.get, token);
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    throw new Error(prediction.error || "模型处理失败，请换一张图片重试。");
  }

  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof output !== "string") throw new Error("模型没有返回可用图片。");
  return output;
}

async function handleRemoveBackground(request, response) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    sendJson(response, 503, { error: "服务器尚未配置 REPLICATE_API_TOKEN。" });
    return;
  }

  try {
    const { image } = await readJsonBody(request);
    if (!validateImageDataUrl(image)) {
      sendJson(response, 400, { error: "请上传有效的 JPG、PNG 或 WebP 图片。" });
      return;
    }

    const output = await runPrediction(image, token);
    sendJson(response, 200, { output });
  } catch (error) {
    console.error("Background removal failed:", error.message);
    sendJson(response, 500, { error: error.message || "图片处理失败，请稍后重试。" });
  }
}

function isAllowedResultUrl(url) {
  return url.protocol === "https:" && (
    url.hostname === "replicate.delivery" ||
    url.hostname.endsWith(".replicate.delivery") ||
    url.hostname === "stream.replicate.com"
  );
}

async function handleDownload(requestUrl, response) {
  try {
    const target = new URL(requestUrl.searchParams.get("url"));
    if (!isAllowedResultUrl(target)) throw new Error("下载地址无效。");

    const source = await fetch(target);
    if (!source.ok) throw new Error("无法下载处理结果。");

    const bytes = Buffer.from(await source.arrayBuffer());
    response.writeHead(200, {
      "Content-Type": source.headers.get("content-type") || "image/png",
      "Content-Disposition": 'attachment; filename="removed-background.png"',
      "Content-Length": bytes.length
    });
    response.end(bytes);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "下载失败。" });
  }
}

async function serveStatic(requestUrl, response) {
  const requestedPath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(STATIC_DIRECTORY, safePath);

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600"
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "页面不存在。" });
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && requestUrl.pathname === "/api/remove-background") {
    await handleRemoveBackground(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/download") {
    await handleDownload(requestUrl, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "不支持的请求方法。" });
    return;
  }

  await serveStatic(requestUrl, response);
});

server.listen(PORT, () => {
  console.log(`Personal site running at http://localhost:${PORT}`);
});
