/**
 * Dunne wrapper rond de GitHub Contents API zodat de CRM JSON-bestanden én
 * binaire foto's kan committen naar de habitat-one repo. Server-only.
 *
 * Env:
 *   GITHUB_TOKEN_HABITAT_ONE   PAT (fine-grained) met Contents: Read+Write op de website-repo
 *   WEBSITE_REPO                "owner/repo" (default: nickhouter-ctrl/Habitat-one)
 *   WEBSITE_BRANCH              "main" (default)
 */

const TOKEN = process.env.GITHUB_TOKEN_HABITAT_ONE;
const REPO = process.env.WEBSITE_REPO ?? "nickhouter-ctrl/Habitat-one";
const BRANCH = process.env.WEBSITE_BRANCH ?? "main";

export class GithubSyncDisabledError extends Error {
  constructor() {
    super(
      "GITHUB_TOKEN_HABITAT_ONE is niet ingesteld — voeg de PAT toe aan .env.local én op Vercel.",
    );
  }
}

function ensureToken(): string {
  if (!TOKEN) throw new GithubSyncDisabledError();
  return TOKEN;
}

const API = "https://api.github.com";

async function gh<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ensureToken()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = typeof data === "object" && data && "message" in data ? String((data as { message?: unknown }).message) : res.statusText;
    throw new Error(`GitHub ${res.status} ${init.method ?? "GET"} ${path}: ${msg}`);
  }
  return { status: res.status, data: data as T };
}

interface ContentFile {
  type: "file";
  sha: string;
  /** base64 (mogelijk met \n's) */
  content: string;
  encoding: "base64";
  path: string;
  size: number;
}

/** Haal een bestand op (UTF-8). Geeft `null` terug als 't niet bestaat. */
export async function getTextFile(
  filePath: string,
): Promise<{ text: string; sha: string } | null> {
  try {
    const { data } = await gh<ContentFile>(
      `/repos/${REPO}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(BRANCH)}`,
    );
    const text = Buffer.from(data.content, "base64").toString("utf8");
    return { text, sha: data.sha };
  } catch (err) {
    if (err instanceof Error && /404|Not Found/.test(err.message)) return null;
    throw err;
  }
}

/** Haal de sha (en alleen die) van een bestand op. */
export async function getFileSha(filePath: string): Promise<string | null> {
  try {
    const { data } = await gh<ContentFile>(
      `/repos/${REPO}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(BRANCH)}`,
    );
    return data.sha;
  } catch (err) {
    if (err instanceof Error && /404|Not Found/.test(err.message)) return null;
    throw err;
  }
}

/**
 * Maak of update een bestand (tekst of binary). Voor binary geef je raw bytes;
 * voor tekst een string. Geeft de nieuwe sha + commit-URL terug.
 */
export async function putFile(args: {
  path: string;
  message: string;
  content: string | Uint8Array;
  /** SHA van de huidige versie — verplicht voor updates; weglaten voor create. */
  sha?: string;
}): Promise<{ sha: string; commitUrl: string }> {
  const b64 =
    typeof args.content === "string"
      ? Buffer.from(args.content, "utf8").toString("base64")
      : Buffer.from(args.content).toString("base64");
  const body: Record<string, unknown> = {
    message: args.message,
    content: b64,
    branch: BRANCH,
  };
  if (args.sha) body.sha = args.sha;

  const { data } = await gh<{ content: { sha: string }; commit: { html_url: string } }>(
    `/repos/${REPO}/contents/${encodeURIComponent(args.path).replace(/%2F/g, "/")}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
  return { sha: data.content.sha, commitUrl: data.commit.html_url };
}

/**
 * Atomic multi-file commit via de Git Data API. Maakt één blob per bestand,
 * één tree die op de bestaande branch is gebaseerd, één commit, en advanced
 * de branch-ref. Veel veiliger dan meerdere `putFile`-calls als één van de
 * bestanden faalt halverwege.
 */
export async function commitFiles(args: {
  message: string;
  files: Array<{ path: string; content: string | Uint8Array }>;
}): Promise<{ commitSha: string; commitUrl: string }> {
  ensureToken();
  // 1. Huidige branch-tip
  const { data: branch } = await gh<{ commit: { sha: string; commit: { tree: { sha: string } } } }>(
    `/repos/${REPO}/branches/${encodeURIComponent(BRANCH)}`,
  );
  const parentSha = branch.commit.sha;
  const baseTreeSha = branch.commit.commit.tree.sha;

  // 2. Blob per bestand
  const blobs = await Promise.all(
    args.files.map(async (f) => {
      const isBinary = typeof f.content !== "string";
      const content = isBinary
        ? Buffer.from(f.content as Uint8Array).toString("base64")
        : (f.content as string);
      const { data } = await gh<{ sha: string }>(`/repos/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content, encoding: isBinary ? "base64" : "utf-8" }),
      });
      return { path: f.path, sha: data.sha };
    }),
  );

  // 3. Tree (delta op de base-tree)
  const { data: tree } = await gh<{ sha: string }>(`/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });

  // 4. Commit
  const { data: commit } = await gh<{ sha: string; html_url: string }>(
    `/repos/${REPO}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({ message: args.message, tree: tree.sha, parents: [parentSha] }),
    },
  );

  // 5. Branch-ref forwarden
  await gh(`/repos/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return { commitSha: commit.sha, commitUrl: commit.html_url };
}

export const websiteRepo = REPO;
export const websiteBranch = BRANCH;
