// api/owners.js
// Uses a GitHub repo file as the "database" for the owner directory.
// Writes are done as single-record operations (upsert/delete/bulkUpsert) that
// get merged into whatever the LATEST version on GitHub is at write time -
// this avoids the "stale full-array overwrite" conflict that happens when
// two people save around the same time.
//
// Env vars needed (set in Vercel project settings):
//   GITHUB_TOKEN        - a GitHub personal access token with repo contents read/write
//   GITHUB_REPO         - e.g. "yourusername/owner-directory-data"
//   GITHUB_FILE_PATH    - e.g. "owners.json"
//   COMMITTEE_PASSWORD  - shared password for committee access
//   ACTIVITY_LOG_PATH   - e.g. "activity-log.json" (optional, defaults below)

const LOG_PATH = process.env.ACTIVITY_LOG_PATH || "activity-log.json";
const MAX_RETRIES = 3;

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

function diffOneRecord(prev, o) {
  const fieldChanges = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    if ((prev?.[key] ?? "") !== (o[key] ?? "")) {
      fieldChanges.push(`${FIELD_LABELS[key]}: ${fmt(prev?.[key])} → ${fmt(o[key])}`);
    }
  }
  fieldChanges.push(...diffTenants(prev?.tenants, o.tenants));
  return fieldChanges;
}

async function getFile(ghHeaders, url) {
  const r = await fetch(url, { headers: ghHeaders });
  if (!r.ok) {
    if (r.status === 404) return { data: null, sha: null };
    throw new Error(`GitHub read failed: ${r.status}`);
  }
  const data = await r.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  return { data: parsed, sha: data.sha };
}

async function putFile(ghHeaders, url, obj, sha, message) {
  return fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(obj, null, 2)).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
}

async function appendActivityLog(ghHeaders, repoApiBase, changeSummaries) {
  try {
    const logUrl = `${repoApiBase}/${LOG_PATH}`;
    const { data: existingLog, sha } = await getFile(ghHeaders, logUrl);
    let log = Array.isArray(existingLog) ? existingLog : [];
    const timestamp = new Date().toISOString();
    changeSummaries.forEach((summary) => log.push({ timestamp, summary }));
    if (log.length > 500) log = log.slice(log.length - 500);
    await putFile(ghHeaders, logUrl, log, sha, `Log: ${changeSummaries.length} change(s) - ${timestamp}`);
  } catch (e) {
    // Logging failures should never block the actual save
    console.error("Activity log write failed:", e.message);
  }
}

function applyOperation(owners, op) {
  const list = Array.isArray(owners) ? owners.slice() : [];
  let summaries = [];

  if (op.type === "upsert") {
    const idx = list.findIndex((o) => o.id === op.record.id);
    if (idx === -1) {
      list.push(op.record);
      summaries.push(`Added owner: ${op.record.name} (Unit ${op.record.unit})`);
    } else {
      const changes = diffOneRecord(list[idx], op.record);
      if (changes.length > 0) {
        summaries.push(`Edited: ${op.record.name} (Unit ${op.record.unit}) — ${changes.join("; ")}`);
      }
      list[idx] = op.record;
    }
  } else if (op.type === "delete") {
    const idx = list.findIndex((o) => o.id === op.id);
    if (idx !== -1) {
      summaries.push(`Deleted owner: ${list[idx].name} (Unit ${list[idx].unit})`);
      list.splice(idx, 1);
    }
  } else if (op.type === "bulkUpsert") {
    for (const record of op.records) {
      const idx = list.findIndex((o) => o.id === record.id);
      if (idx === -1) {
        list.push(record);
        summaries.push(`Added owner: ${record.name} (Unit ${record.unit})`);
      } else {
        const changes = diffOneRecord(list[idx], record);
        if (changes.length > 0) {
          summaries.push(`Edited: ${record.name} (Unit ${record.unit}) — ${changes.join("; ")}`);
        }
        list[idx] = record;
      }
    }
  }

  return { list, summaries };
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
    try {
      const { data } = await getFile(ghHeaders, API_URL);
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (e) {
      return res.status(500).json({ error: "Could not read data file", detail: e.message });
    }
  }

  if (req.method === "PUT") {
    const op = req.body;
    if (!op || !op.type) {
      return res.status(400).json({ error: "Missing operation type" });
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let current, sha;
      try {
        const result = await getFile(ghHeaders, API_URL);
        current = Array.isArray(result.data) ? result.data : [];
        sha = result.sha;
      } catch (e) {
        return res.status(500).json({ error: "Could not read data file", detail: e.message });
      }

      const { list, summaries } = applyOperation(current, op);

      const putR = await putFile(
        ghHeaders,
        API_URL,
        list,
        sha,
        `Update owner directory - ${new Date().toISOString()}`
      );

      if (putR.ok) {
        if (summaries.length > 0) {
          await appendActivityLog(ghHeaders, REPO_API_BASE, summaries);
        }
        return res.status(200).json({ ok: true, owners: list });
      }

      // 409/422 means someone else saved in between - retry with fresh sha
      if (putR.status === 409 || putR.status === 422) {
        continue;
      }

      const errBody = await putR.text();
      return res.status(500).json({ error: "Could not save data file", detail: errBody });
    }

    return res.status(409).json({
      error: "Too many people are saving changes at once - please try again in a moment",
    });
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  res.status(405).json({ error: "Method not allowed" });
}
