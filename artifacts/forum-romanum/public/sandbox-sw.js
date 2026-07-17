/**
 * Forge Sandbox Service Worker
 * Intercepts fetches to /__sandbox_server__/* and routes them to the
 * in-memory virtual HTTP server registered by http.createServer().listen().
 * Also intercepts /__sandbox_page__/* for multi-page static site navigation.
 */

const SANDBOX_ORIGIN = "/__sandbox_server__";
const STATIC_ORIGIN = "/__sandbox_page__";

// Pending response callbacks keyed by request ID
const pending = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith(SANDBOX_ORIGIN)) {
    event.respondWith(handleVirtualServer(event));
    return;
  }

  if (url.pathname.startsWith(STATIC_ORIGIN)) {
    event.respondWith(handleStaticPage(event));
    return;
  }
});

// ─── Virtual server requests ──────────────────────────────────────────────────

async function handleVirtualServer(event) {
  const url = new URL(event.request.url);
  // Strip the prefix so the handler sees the real path
  const virtualPath = url.pathname.slice(SANDBOX_ORIGIN.length) || "/";
  const virtualUrl = virtualPath + url.search + url.hash;

  let body = "";
  try {
    body = await event.request.text();
  } catch {}

  const reqData = {
    url: virtualUrl,
    method: event.request.method,
    headers: Object.fromEntries(event.request.headers.entries()),
    body,
  };

  const client = await getClient(event.clientId);
  if (!client) {
    return new Response("No sandbox client connected", { status: 503 });
  }

  return new Promise((resolve) => {
    const reqId = crypto.randomUUID();
    const { port1, port2 } = new MessageChannel();

    port1.onmessage = ({ data }) => {
      if (data.error) {
        resolve(new Response(data.error, { status: 500 }));
        return;
      }
      resolve(
        new Response(data.body ?? "", {
          status: data.status ?? 200,
          headers: sanitizeHeaders(data.headers ?? {}),
        })
      );
    };

    client.postMessage(
      { type: "SANDBOX_FETCH", reqId, req: reqData },
      [port2]
    );

    // Timeout after 30 seconds
    setTimeout(() => {
      pending.delete(reqId);
      resolve(new Response("Sandbox request timed out", { status: 504 }));
    }, 30000);
  });
}

// ─── Static page navigation (multi-page HTML sites) ──────────────────────────

async function handleStaticPage(event) {
  const url = new URL(event.request.url);
  const filePath = url.pathname.slice(STATIC_ORIGIN.length) || "/index.html";

  const client = await getClient(event.clientId);
  if (!client) {
    return new Response("No sandbox client connected", { status: 503 });
  }

  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();

    port1.onmessage = ({ data }) => {
      if (data.error || !data.content) {
        resolve(new Response(data.error ?? "File not found", { status: 404 }));
        return;
      }
      const contentType = guessContentType(filePath);
      resolve(new Response(data.content, {
        status: 200,
        headers: { "content-type": contentType },
      }));
    };

    client.postMessage(
      { type: "SANDBOX_READ_FILE", path: filePath },
      [port2]
    );

    setTimeout(() => {
      resolve(new Response("Timeout reading file", { status: 504 }));
    }, 10000);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClient(clientId) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
  // Prefer top-level frames (the React app) over nested iframes.
  // When a fetch comes from inside the preview iframe, event.clientId points
  // to the iframe client, but the FS message handler lives in the parent window.
  const topLevel = all.filter(c => c.frameType === "top-level");
  const pool = topLevel.length ? topLevel : all;
  if (clientId) {
    const exact = pool.find(c => c.id === clientId);
    if (exact) return exact;
  }
  return pool[0] ?? all[0] ?? null;
}

function sanitizeHeaders(headers) {
  const safe = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    // Skip headers that break the iframe sandbox or cause issues
    if (["x-frame-options", "content-security-policy", "x-content-type-options"].includes(lower)) continue;
    safe[k] = v;
  }
  return safe;
}

function guessContentType(path) {
  if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "text/plain; charset=utf-8";
}
