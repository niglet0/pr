// Lightweight GitHub integration via the public REST API (no auth required).
// Rate-limited to 60 req/hr per IP; one connect uses ~2 calls.

export type GitHubProfile = {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
};

export async function fetchGitHubProfile(username: string): Promise<GitHubProfile> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) throw new Error(`GitHub user "${username}" not found`);
  if (res.status === 403) throw new Error("GitHub rate limit reached. Try again later.");
  if (!res.ok) throw new Error(`GitHub error (${res.status})`);
  return res.json();
}

export async function fetchGitHubRepos(username: string): Promise<GitHubRepo[]> {
  // up to 100 most recently pushed, public only
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed&type=owner`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error(`Could not load repos (${res.status})`);
  const all = (await res.json()) as GitHubRepo[];
  return all.filter((r) => !r.fork && !r.archived);
}

/** Compute top N languages weighted by stars + recency. */
export function deriveTopLanguages(repos: GitHubRepo[], limit = 6) {
  const score: Record<string, number> = {};
  const now = Date.now();
  for (const r of repos) {
    if (!r.language) continue;
    const ageDays = Math.max(1, (now - new Date(r.pushed_at).getTime()) / 86_400_000);
    const recency = Math.max(0.2, 1 - Math.min(ageDays, 365 * 3) / (365 * 3));
    score[r.language] = (score[r.language] || 0) + 1 + r.stargazers_count * 0.4 + recency;
  }
  return Object.entries(score)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([language, weight]) => ({ language, weight: Math.round(weight * 10) / 10 }));
}

export function totalStars(repos: GitHubRepo[]) {
  return repos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
}