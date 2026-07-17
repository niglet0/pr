/**
 * HatchBlock — Hatch IP Protection Config Parser
 *
 * Sellers place a `.HatchBlock` file in the root of their uploaded project ZIP
 * to control what buyers can see and edit inside the sandbox.
 *
 * Syntax:
 *   # comment
 *   /src/core/              → full block (hidden from tree, never openable)
 *   *.key                   → full block (glob pattern)
 *   let=20 src/api/stripe.js → partial view (first N lines only, readonly)
 *   readonly README.md       → full view, no editing
 */

export interface HatchBlockPolicy {
  blocked: string[];
  partial: Record<string, number>;
  readonly: string[];
}

export const EMPTY_POLICY: HatchBlockPolicy = { blocked: [], partial: {}, readonly: [] };

export function parseHatchBlock(content: string): HatchBlockPolicy {
  const policy: HatchBlockPolicy = { blocked: [], partial: {}, readonly: [] };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const letMatch = line.match(/^let=(\d+)\s+(.+)$/);
    if (letMatch) {
      const n = parseInt(letMatch[1], 10);
      const p = normalizePath(letMatch[2].trim());
      if (!isNaN(n) && n > 0) policy.partial[p] = n;
      continue;
    }

    const roMatch = line.match(/^readonly\s+(.+)$/);
    if (roMatch) {
      policy.readonly.push(normalizePath(roMatch[1].trim()));
      continue;
    }

    try {
      policy.blocked.push(normalizePath(line));
    } catch {
      // unparseable line — ignore gracefully
    }
  }

  return policy;
}

function normalizePath(p: string): string {
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '');
}

function matchesPattern(filePath: string, pattern: string): boolean {
  if (filePath === pattern) return true;
  // Directory prefix
  if (filePath.startsWith(pattern + '/')) return true;
  // Glob with *
  if (pattern.includes('*')) {
    const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    try {
      if (new RegExp('^' + esc + '$').test(filePath)) return true;
    } catch { return false; }
    // Match basename too (e.g. *.key matches /secrets/api.key)
    const basename = filePath.split('/').pop() ?? '';
    const baseEsc = esc.replace(/^\//, '');
    try {
      if (new RegExp('^' + baseEsc + '$').test(basename)) return true;
    } catch {}
  }
  return false;
}

export function isBlocked(policy: HatchBlockPolicy, filePath: string): boolean {
  return policy.blocked.some(b => matchesPattern(filePath, b));
}

export function getPartialLines(policy: HatchBlockPolicy, filePath: string): number | null {
  for (const [pattern, lines] of Object.entries(policy.partial)) {
    if (matchesPattern(filePath, pattern)) return lines;
  }
  return null;
}

export function isReadonly(policy: HatchBlockPolicy, filePath: string): boolean {
  if (isBlocked(policy, filePath)) return true;
  if (getPartialLines(policy, filePath) !== null) return true;
  return policy.readonly.some(r => matchesPattern(filePath, r));
}

export function applyPartialView(content: string, maxLines: number): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  const hidden = lines.length - maxLines;
  return (
    lines.slice(0, maxLines).join('\n') +
    `\n\n# … ${hidden} line${hidden === 1 ? '' : 's'} hidden (protected by .HatchBlock)`
  );
}

export function policyFromVFS(content: string | null): HatchBlockPolicy {
  if (!content) return EMPTY_POLICY;
  try {
    return parseHatchBlock(content);
  } catch {
    return EMPTY_POLICY;
  }
}
