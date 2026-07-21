// api/activity-log.js
// Admin-only read access to the activity log. Requires a SEPARATE password
// from the regular committee password (env var: ADMIN_PASSWORD).

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminPassword = req.headers["x-admin-password"];
  if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect admin password" });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO;
  const LOG_PATH = process.env.ACTIVITY_LOG_PATH || "activity-log.json";
  const LOG_URL = `https://api.github.com/repos/${REPO}/contents/${LOG_PATH}`;

  const ghHeaders = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  const r = await fetch(LOG_URL, { headers: ghHeaders });
  if (!r.ok) {
    if (r.status === 404) return res.status(200).json([]);
    return res.status(500).json({ error: "Could not read activity log" });
  }
  const data = await r.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  try {
    const log = JSON.parse(content);
    // Most recent first
    return res.status(200).json(log.slice().reverse());
  } catch {
    return res.status(200).json([]);
  }
}
