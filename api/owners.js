// api/owners.js
// Uses a GitHub repo file as the "database" for the owner directory.
// Env vars needed (set in Vercel project settings):
//   GITHUB_TOKEN        - a GitHub personal access token with repo contents read/write
//   GITHUB_REPO         - e.g. "yourusername/owner-directory-data"
//   GITHUB_FILE_PATH    - e.g. "owners.json"
//   COMMITTEE_PASSWORD  - shared password for committee access
//   ACTIVITY_LOG_PATH   - e.g. "activity-log.json" (optional, defaults below)

const LOG_PATH = process.env.ACTIVITY_LOG_PATH || "activity-log.json";

const FIELD_LABELS = {
  name: "Name",
  unit: "Unit",
  phone: "Phone",
  email: "Email",
  familyCount: "Family count",
  occupation: "Occupation",
  idType: "ID type",
  moveIn: "Move-in date",
  vehicleNumber: "Vehicle number",
  parkingSlot: "Parking slot",
  emergencyContact: "Emergency contact",
  remarks: "Remarks",
  isRented: "Rented status",
};

const TENANT_FIELD_LABELS = {
  tenantName: "Tenant name",
  tenantPhone: "Tenant phone",
  familyCount: "Tenant family count",
  occupation: "Tenant occupation",
  idType: "Tenant ID type",
  moveIn: "Tenant move-in date",
  vehicleNumber: "Tenant vehicle number",
  emergencyContact: "Tenant emergency contact",
  remarks: "Tenant remarks",
};

function fmt(v) {
  if (v === "" || v === undefined || v === null) return "(blank)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function diffTenants(before, after) {
  const changes = [];
  const b = (before || [])[0] || {};
  const a = (after || [])[0] || {};
  for (const key of Object.keys(TENANT_FIELD_LABELS)) {
    if ((b[key] || "") !== (a[key] || "")) {
      changes.push(`${TENANT_FIELD_LABELS[key]}: ${fmt(b[key])} → ${fmt(a[key])}`);
    }
  }
  return changes;
}

function summarizeChanges(before, after) {
  const beforeById = new Map(before.map((o) => [o.id, o]));
  const afterById = new Map(after.map((o) => [o.id, o]));
  const entries = [];

  for (const [id, o] of afterById) {
    if (!beforeById.has(id)) {
      entries.push(`Added owner: ${o.name} (Unit ${o.unit})`);
    }
  }
  for (const [id, o] of beforeById) {
    if (!afterById.has(id)) {
      entries.push(`Deleted owner: ${o.name} (Unit ${o.unit})`);
    }
  }
  for (const [id, o] of afterById) {
    const prev = beforeById.get(id);
    if (!prev) continue;

    const fieldChanges = [];
    for (const key of Object.keys(FIELD_LABELS)) {
      if ((prev[key] ?? "") !== (o[key] ?? "")) {
        fieldChanges.push(`${FIELD_LABELS[key]}: ${fmt(prev[key])} → ${fmt(o[key])}`);
      }
    }
    fieldChanges.push(...diffTenants(prev.tenants, o.tenants));

    if (fieldChanges.length > 0) {
      entries.push(`Edited: ${o.name} (Unit ${o.unit}) — ${fieldChanges.join("; ")}`);
    }
  }
  return entries.length ? entries : ["Saved (no field-level changes detected)"];
}

async function appendActivityLog(ghHeaders, repoApiBase, changeSummaries) {
  try {
    const logUrl = `${repoApiBase}/${LOG_PATH}`;
    let log = [];
    let sha;
    const getR = await fetch(logUrl, { headers: ghHeaders });
    if (getR.ok) {
      const getData = await getR.json();
      sha = getData.sha;
      try {
        log = JSON.parse(Buffer.from(getData.content, "base64").toString("utf-8"));
      } catch {
        log = [];
      }
    }
    const timestamp = new Date().toISOString();
    changeSummaries.forEach((summary) => {
      log.push({ timestamp, summary });
    });
    // Keep the log from growing unbounded
    if (log.length > 500) log = log.slice(log.length - 500);

    const newContent = Buffer.from(JSON.stringify(log, null, 2)).toString("base64");
    await fetch(logUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Log: ${changeSummaries.length} change(s) - ${timestamp}`,
        content: newContent,
        ...(sha ? { sha } : {}),
      }),
    });
  } catch (e) {
    // Logging failures should never block the actual save
    console.error("Activity log write failed:", e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  const password = req.headers["x-app-password"];
  if (!password || password !== process.env.COMMITTEE_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO;
  const FILE_PATH = process.env.GITHUB_FILE_PATH || "owners.json";
  const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const REPO_API_BASE = `https://api.github.com/repos/${REPO}/contents`;

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
    let before = [];
    const getR = await fetch(API_URL, { headers: ghHeaders });
    if (getR.ok) {
      const getData = await getR.json();
      sha = getData.sha;
      try {
        before = JSON.parse(Buffer.from(getData.content, "base64").toString("utf-8"));
      } catch {
        before = [];
      }
    }

    const after = req.body;
    const newContent = Buffer.from(JSON.stringify(after, null, 2)).toString("base64");
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

    // Log what changed (best-effort, never blocks the response)
    const summaries = summarizeChanges(before, Array.isArray(after) ? after : []);
    await appendActivityLog(ghHeaders, REPO_API_BASE, summaries);

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  res.status(405).json({ error: "Method not allowed" });
}
