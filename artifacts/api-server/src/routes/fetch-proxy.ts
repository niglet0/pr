/**
 * /api/fetch-proxy — Generic HTTPS proxy for browser fetches blocked by CORS.
 * Used by the sandbox to download ZIP files from GitHub, Supabase Storage, S3, etc.
 *
 * Security hardened:
 * - HTTPS only
 * - DNS resolution + private-IP block (including AWS/GCP metadata endpoint)
 * - Redirect following re-validates every hop; relative Location resolved correctly
 * - 100 MB response cap
 */

import { Router } from "express";
import dns from "dns";

const router = Router();

// Private / link-local / loopback ranges (IPv4 and IPv6)
const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:|localhost$)/i;

/** Returns true when the hostname resolves to a private/reserved address. */
async function resolvesToPrivateIP(hostname: string): Promise<boolean> {
  try {
    const { address } = await dns.promises.lookup(hostname);
    return PRIVATE_IP_RE.test(address);
  } catch {
    return true; // failed to resolve → treat as unsafe
  }
}

function isSafeUrl(
  raw: string,
  base?: string
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    // Pass base so relative redirects resolve correctly (RFC 7231 §7.1.2)
    url = new URL(raw, base);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Only HTTPS URLs are allowed" };
  }
  return { ok: true, url };
}

router.options("/fetch-proxy", (_req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("access-control-allow-headers", "*");
  res.status(200).end();
});

router.get("/fetch-proxy", async (req, res) => {
  const rawUrl = req.query["url"] as string | undefined;
  if (!rawUrl) {
    res.status(400).json({ error: "Missing ?url= parameter" });
    return;
  }

  const check = isSafeUrl(rawUrl);
  if (!check.ok) {
    res.status(400).json({ error: check.reason });
    return;
  }

  // DNS SSRF check — resolve hostname before making the request
  if (await resolvesToPrivateIP(check.url.hostname)) {
    res.status(403).json({ error: "Target resolves to a private or reserved IP address" });
    return;
  }

  async function doFetch(url: URL, hop = 0): Promise<void> {
    if (hop > 3) {
      res.status(502).json({ error: "Too many redirects" });
      return;
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "user-agent": "Hatch-Sandbox/1.0", accept: "*/*" },
      redirect: "manual", // handle manually so we can re-validate each hop
    });

    if (response.status >= 300 && response.status < 400) {
      const locationHeader = response.headers.get("location");
      if (!locationHeader) {
        res.status(502).json({ error: "Redirect with no Location header" });
        return;
      }
      // Resolve relative Location headers against the current URL (RFC 7231 §7.1.2)
      const redirectCheck = isSafeUrl(locationHeader, url.toString());
      if (!redirectCheck.ok) {
        res.status(403).json({ error: `Redirect blocked: ${redirectCheck.reason}` });
        return;
      }
      if (await resolvesToPrivateIP(redirectCheck.url.hostname)) {
        res.status(403).json({ error: "Redirect target resolves to a private IP address" });
        return;
      }
      await doFetch(redirectCheck.url, hop + 1);
      return;
    }

    const buf = await response.arrayBuffer();
    if (buf.byteLength > 100 * 1024 * 1024) {
      res.status(413).json({ error: "Response too large (max 100 MB)" });
      return;
    }

    res.status(response.status);
    res.setHeader("access-control-allow-origin", "*");
    const ct = response.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    const cd = response.headers.get("content-disposition");
    if (cd) res.setHeader("content-disposition", cd);
    res.send(Buffer.from(buf));
  }

  try {
    await doFetch(check.url);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: `Fetch proxy error: ${err.message}` });
    }
  }
});

export default router;
