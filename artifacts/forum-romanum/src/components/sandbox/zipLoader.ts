import { unzipSync } from "fflate";
import type { MemFS } from "./vfs";
import { writeFile, writeBinary, ensureDir } from "./vfs";

const TEXT_EXTS = new Set([
  "txt","md","js","ts","jsx","tsx","json","html","htm","css","scss","sass","less",
  "xml","yaml","yml","toml","ini","env","sh","bash","zsh","fish","py","rb","rs",
  "go","c","cpp","h","hpp","java","kt","swift","php","sql","graphql","gql","lock",
  "gitignore","gitattributes","editorconfig","prettierrc","eslintrc","babelrc",
  "svg","csv","vue","svelte","astro","mjs","cjs","conf","config","log",
]);

function isText(path: string): boolean {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  const name = path.split("/").pop() ?? "";
  if (!name.includes(".") || name.startsWith(".")) return true;
  return false;
}

// Strip leading top-level folder if the zip wraps everything inside one dir
function stripTopDir(paths: string[]): boolean {
  const tops = new Set<string>();
  for (const p of paths) {
    const seg = p.split("/")[0];
    if (seg) tops.add(seg);
  }
  if (tops.size !== 1) return false;
  const [top] = tops;
  return paths.every((p) => p.startsWith(top + "/") || p === top + "/");
}

export async function loadZipFile(
  fs: MemFS,
  file: File,
  targetDir = "/"
): Promise<string[]> {
  const buf = await file.arrayBuffer();
  return _load(fs, new Uint8Array(buf), targetDir);
}

export async function loadZipUrl(
  fs: MemFS,
  url: string,
  targetDir = "/"
): Promise<string[]> {
  // Route through the server-side fetch proxy to avoid browser CORS restrictions.
  // GitHub archive downloads, Supabase Storage, and most CDNs don't set
  // Access-Control-Allow-Origin headers, so direct browser fetch fails.
  const isSameOrigin =
    url.startsWith("/") ||
    url.startsWith(window.location.origin);

  const fetchUrl = isSameOrigin
    ? url
    : `/api/fetch-proxy?url=${encodeURIComponent(url)}`;

  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`Failed to fetch ZIP: ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return _load(fs, new Uint8Array(buf), targetDir);
}

async function _load(fs: MemFS, u8: Uint8Array, targetDir: string): Promise<string[]> {
  const unzipped = unzipSync(u8);
  const rawPaths = Object.keys(unzipped);
  const strip = stripTopDir(rawPaths.filter((p) => !p.endsWith("/")));
  const topDir = strip ? rawPaths.find((p) => !p.endsWith("/"))!.split("/")[0] + "/" : "";

  const written: string[] = [];

  for (const [rawPath, data] of Object.entries(unzipped)) {
    if (rawPath.endsWith("/")) continue;
    const relPath = topDir ? rawPath.slice(topDir.length) : rawPath;
    if (!relPath) continue;
    const fullPath = targetDir === "/" ? `/${relPath}` : `${targetDir}/${relPath}`;

    if (isText(rawPath)) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
      await writeFile(fs, fullPath, text);
    } else {
      await writeBinary(fs, fullPath, data);
    }
    written.push(fullPath);
  }

  return written;
}
