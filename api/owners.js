// api/owners.js
// Uses a GitHub repo file as the "database" for the owner directory.
// Env vars needed (set in Vercel project settings):
//   GITHUB_TOKEN       - a GitHub personal access token with repo contents read/write
//   GITHUB_REPO        - e.g. "yourusername/owner-directory-data"
//   GITHUB_FILE_PATH   - e.g. "owners.json"
//   COMMITTEE_PASSWORD - shared password for committee access

export default async function handler(req, res) {
  // Prevent any caching layer (Vercel edge, browser) from serving stale data
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  const password = req.headers["x-app-password"];
  if (!password || password !== process.env.COMMITTEE_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO;
  const FILE_PATH = process.env.GITHUB_FILE_PATH || "owners.json";
  const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  const ghHeaders = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    const r = await fetch(API_URL, { headers: ghHeaders });
    if (!r.ok) {
      // File may not exist yet - return empty list
      if (r.status === 404) return res.status(200).json([]);
      return res.status(500).json({ error: "Could not read data file" });
    }
    const data = await r.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    try {
      return res.status(200).json(JSON.parse(content));
    } catch {
      return res.status(200).json([]);
    }
  }

  if (req.method === "PUT") {
    // Need current sha to update an existing file (GitHub requires this)
    let sha;
    const getR = await fetch(API_URL, { headers: ghHeaders });
    if (getR.ok) {
      const getData = await getR.json();
      sha = getData.sha;
    }

    const newContent = Buffer.from(JSON.stringify(req.body, null, 2)).toString("base64");
    const putR = await fetch(API_URL, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update owner directory - ${new Date().toISOString()}`,
        content: newContent,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putR.ok) {
      const errBody = await putR.text();
      return res.status(500).json({ error: "Could not save data file", detail: errBody });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  res.status(405).json({ error: "Method not allowed" });
}
