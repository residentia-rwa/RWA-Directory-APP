import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, Phone, Mail, X, Check, Users, Download, Home, ShieldCheck } from "lucide-react";
import * as XLSX from "xlsx";

const SESSION_KEY = "owner_directory_password";

function validatePhone(p) {
  return /^[0-9+\-\s()]{7,15}$/.test(p.trim());
}
function validateEmail(e) {
  if (!e.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function apiGet(password) {
  const r = await fetch("/api/owners", { headers: { "x-app-password": password } });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("Failed to load data");
  return r.json();
}
async function apiSave(password, owners) {
  const r = await fetch("/api/owners", {
    method: "PUT",
    headers: { "x-app-password": password, "Content-Type": "application/json" },
    body: JSON.stringify(owners),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("Failed to save data");
  return r.json();
}
async function fetchActivityLog(adminPassword) {
  const r = await fetch("/api/activity-log", { headers: { "x-admin-password": adminPassword } });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("Failed to load activity log");
  return r.json();
}

// ---------- Login: shared committee password ----------
function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      await apiGet(password); // validates password against the API
      sessionStorage.setItem(SESSION_KEY, password);
      onSuccess(password);
    } catch (e) {
      setError("Incorrect password");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#F6F5F0] flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-white rounded-xl p-6 border border-[#E3E0D6]">
        <div className="w-10 h-10 rounded-full bg-[#2F5D46] flex items-center justify-center mb-4">
          <Users size={18} className="text-[#F6F5F0]" />
        </div>
        <h1 className="font-display text-xl text-[#1E2A22] mb-1">Committee access</h1>
        <p className="text-xs text-[#6B7568] mb-4">Enter the shared committee password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Password"
          className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]"
        />
        {error && <p className="text-xs text-[#B5533C] mb-2">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading || !password}
          className="w-full py-2 rounded-lg bg-[#2F5D46] text-white text-sm font-medium hover:bg-[#264B39] disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </div>
    </div>
  );
}

const emptyForm = {
  name: "",
  unit: "",
  phone: "",
  email: "",
  familyCount: "",
  occupation: "",
  idType: "",
  moveIn: "",
  vehicleNumber: "",
  parkingSlot: "",
  emergencyContact: "",
  remarks: "",
  isRented: false,
  tenantName: "",
  tenantPhone: "",
  tenantFamilyCount: "",
  tenantOccupation: "",
  tenantIdType: "",
  tenantMoveIn: "",
  tenantVehicleNumber: "",
  tenantEmergencyContact: "",
  tenantRemarks: "",
};

// ---------- Excel export ----------
function downloadOwnersExcel(owners) {
  const rows = owners
    .slice()
    .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }))
    .map((o) => ({
      "Apt No": o.unit,
      "Customer Name": o.name,
      "Phone No.": o.phone,
      "Email id": o.email || "",
      "Status": o.isRented ? "Rented" : "Owner-occupied",
      "Family Count": o.familyCount || "",
      "Occupation": o.occupation || "",
      "ID Type": o.idType || "",
      "Move In": o.moveIn || "",
      "Vehicle Number": o.vehicleNumber || "",
      "Parking Slot": o.parkingSlot || "",
      "Emergency Contact": o.emergencyContact || "",
      "Remarks": o.remarks || "",
    }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Owners");
  XLSX.writeFile(wb, `Owner_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function downloadRentalsExcel(owners) {
  const rows = [];
  owners.forEach((o) => {
    (o.tenants || []).forEach((t) => {
      rows.push({
        "Apt No": o.unit,
        "Owner Name": o.name,
        "Tenant Name": t.tenantName,
        "Tenant Phone": t.tenantPhone,
        "Family Count": t.familyCount || "",
        "Occupation": t.occupation || "",
        "ID Type": t.idType || "",
        "Move In": t.moveIn || "",
        "Vehicle Number": t.vehicleNumber || "",
        "Emergency Contact": t.emergencyContact || "",
        "Remarks": t.remarks || "",
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rentals");
  XLSX.writeFile(wb, `Rental_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#6B7568] mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-[#B5533C] mt-1">{error}</p>}
    </div>
  );
}

// ---------- Activity log (admin-only) ----------
function ActivityLogModal({ onClose }) {
  const [stage, setStage] = useState("password"); // password | log
  const [adminPassword, setAdminPassword] = useState("");
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUnlock() {
    setError("");
    setLoading(true);
    try {
      const log = await fetchActivityLog(adminPassword);
      setEntries(log);
      setStage("log");
    } catch (e) {
      setError("Incorrect admin password");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-[#1E2A22] flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-[#2F5D46]" /> Activity log
          </h2>
          <button onClick={onClose} className="text-[#9AA396] hover:text-[#1E2A22]">
            <X size={18} />
          </button>
        </div>

        {stage === "password" && (
          <>
            <p className="text-xs text-[#6B7568] mb-3">Enter the admin password to view committee activity.</p>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="Admin password"
              className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]"
            />
            {error && <p className="text-xs text-[#B5533C] mb-2">{error}</p>}
            <button
              onClick={handleUnlock}
              disabled={loading || !adminPassword}
              className="w-full py-2 rounded-lg bg-[#2F5D46] text-white text-sm font-medium hover:bg-[#264B39] disabled:opacity-50"
            >
              {loading ? "Checking…" : "View log"}
            </button>
          </>
        )}

        {stage === "log" && (
          <>
            {entries.length === 0 ? (
              <p className="text-sm text-[#6B7568]">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {entries.map((e, idx) => {
                  const [headline, changeList] = e.summary.split(" — ");
                  const changes = changeList ? changeList.split("; ") : [];
                  return (
                    <div key={idx} className="border border-[#E3E0D6] rounded-lg px-3 py-2">
                      <p className="text-sm text-[#1E2A22] font-medium">{headline}</p>
                      {changes.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {changes.map((c, i) => (
                            <li key={i} className="text-xs text-[#6B7568]">• {c}</li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-[#9AA396] mt-1">
                        {new Date(e.timestamp).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


function Directory({ password, onLogout }) {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet(password);
      setOwners(data);
    } catch (e) {
      if (e.message === "unauthorized") return onLogout();
      setErrorMsg("Could not load the directory. Try refreshing.");
    }
    setLoading(false);
  }, [password, onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  async function persist(next) {
    setOwners(next);
    setSaveState("saving");
    try {
      await apiSave(password, next);
      setSaveState("saved");
    } catch (e) {
      if (e.message === "unauthorized") return onLogout();
      setSaveState("error");
      setErrorMsg("Save failed — your change may not have persisted. Try again.");
    }
    setTimeout(() => setSaveState((s) => (s === "saving" ? s : "idle")), 1500);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.unit.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q) ||
        (o.email || "").toLowerCase().includes(q)
    );
  }, [owners, query]);

  function openAdd() {
    setForm(emptyForm);
    setErrors({});
    setEditingId(null);
    setModalOpen(true);
  }
  function openEdit(o) {
    const firstTenant = (o.tenants && o.tenants[0]) || {};
    setForm({
      name: o.name,
      unit: o.unit,
      phone: o.phone,
      email: o.email || "",
      familyCount: o.familyCount || "",
      occupation: o.occupation || "",
      idType: o.idType || "",
      moveIn: o.moveIn || "",
      vehicleNumber: o.vehicleNumber || "",
      parkingSlot: o.parkingSlot || "",
      emergencyContact: o.emergencyContact || "",
      remarks: o.remarks || "",
      isRented: !!o.isRented,
      tenantName: firstTenant.tenantName || "",
      tenantPhone: firstTenant.tenantPhone || "",
      tenantFamilyCount: firstTenant.familyCount || "",
      tenantOccupation: firstTenant.occupation || "",
      tenantIdType: firstTenant.idType || "",
      tenantMoveIn: firstTenant.moveIn || "",
      tenantVehicleNumber: firstTenant.vehicleNumber || "",
      tenantEmergencyContact: firstTenant.emergencyContact || "",
      tenantRemarks: firstTenant.remarks || "",
    });
    setErrors({});
    setEditingId(o.id);
    setModalOpen(true);
  }
  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = "Enter a name";
    if (!form.unit.trim()) errs.unit = "Enter a unit number";
    if (!form.phone.trim()) errs.phone = "Enter a phone number";
    else if (!validatePhone(form.phone)) errs.phone = "That doesn't look like a valid phone number";
    if (form.email && !validateEmail(form.email)) errs.email = "That doesn't look like a valid email";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }
  function handleSave() {
    if (!validate()) return;
    const clean = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      familyCount: form.familyCount.trim(),
      occupation: form.occupation.trim(),
      idType: form.idType.trim(),
      moveIn: form.moveIn.trim(),
      vehicleNumber: form.vehicleNumber.trim(),
      parkingSlot: form.parkingSlot.trim(),
      emergencyContact: form.emergencyContact.trim(),
      remarks: form.remarks.trim(),
      isRented: form.isRented,
      tenants: form.isRented && form.tenantName.trim()
        ? [{
            tenantName: form.tenantName.trim(),
            tenantPhone: form.tenantPhone.trim(),
            familyCount: form.tenantFamilyCount.trim(),
            occupation: form.tenantOccupation.trim(),
            idType: form.tenantIdType.trim(),
            moveIn: form.tenantMoveIn.trim(),
            vehicleNumber: form.tenantVehicleNumber.trim(),
            emergencyContact: form.tenantEmergencyContact.trim(),
            remarks: form.tenantRemarks.trim(),
          }]
        : [],
    };
    if (editingId) {
      persist(owners.map((o) => (o.id === editingId ? { ...o, ...clean } : o)));
    } else {
      persist([...owners, { id: uid(), ...clean }]);
    }
    setModalOpen(false);
  }
  function handleDelete(id) {
    persist(owners.filter((o) => o.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div className="min-h-screen bg-[#F6F5F0]">
      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2F5D46] flex items-center justify-center">
              <Users size={18} className="text-[#F6F5F0]" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-[#1E2A22] leading-none">Owner Directory</h1>
              <p className="text-xs text-[#6B7568] mt-1">{owners.length} owners on file</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9AA396] w-16 text-right">
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
              {saveState === "error" && <span className="text-[#B5533C]">Not saved</span>}
            </span>
            <button onClick={() => setActivityLogOpen(true)} className="text-xs text-[#6B7568] hover:text-[#2F5D46] flex items-center gap-1">
              <ShieldCheck size={12} /> Activity log
            </button>
            <button onClick={onLogout} className="text-xs text-[#6B7568] hover:text-[#1E2A22]">
              Sign out
            </button>
          </div>
        </div>

        {activityLogOpen && <ActivityLogModal onClose={() => setActivityLogOpen(false)} />}

        {errorMsg && <div className="mb-4 px-3 py-2 rounded-lg bg-[#FBEAE6] text-[#B5533C] text-xs">{errorMsg}</div>}

        <div className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA396]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, unit, phone, or email"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]"
            />
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#2F5D46] text-white text-sm font-medium hover:bg-[#264B39]"
          >
            <Plus size={16} /> Add owner
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => downloadOwnersExcel(owners)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[#E3E0D6] text-xs text-[#2F5D46] hover:bg-[#EFEDE3]"
          >
            <Download size={13} /> Owner list (Excel)
          </button>
          <button
            onClick={() => downloadRentalsExcel(owners)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[#E3E0D6] text-xs text-[#2F5D46] hover:bg-[#EFEDE3]"
          >
            <Download size={13} /> Rental list (Excel)
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#9AA396] text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#E3E0D6] rounded-xl">
            <p className="text-[#6B7568] text-sm">{owners.length === 0 ? "No owners yet." : "No matches."}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered
              .slice()
              .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }))
              .map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between bg-white border border-[#E3E0D6] rounded-lg px-4 py-3 hover:border-[#C9C4B4]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-[#EFEDE3] flex items-center justify-center text-xs font-semibold text-[#2F5D46]">
                      {o.unit}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-[#1E2A22] truncate">{o.name}</div>
                        {o.isRented && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#EFEDE3] text-[#2F5D46] font-medium">
                            Rented
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#6B7568] mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone size={11} /> {o.phone}
                        </span>
                        {o.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail size={11} /> {o.email}
                          </span>
                        )}
                      </div>
                      {o.isRented && o.tenants && o.tenants.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-[#8A6D3B] mt-1">
                          <Home size={11} />
                          {o.tenants.map((t, idx) => (
                            <span key={idx}>
                              {t.tenantName} ({t.tenantPhone}){idx < o.tenants.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {(o.occupation || o.vehicleNumber || o.familyCount || o.parkingSlot) && (
                        <div className="text-xs text-[#9AA396] mt-1 truncate">
                          {[
                            o.familyCount && `${o.familyCount} in family`,
                            o.occupation,
                            o.vehicleNumber && `Vehicle: ${o.vehicleNumber}`,
                            o.parkingSlot && `Parking: ${o.parkingSlot}`,
                          ].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => openEdit(o)} className="p-2 rounded-md text-[#6B7568] hover:bg-[#EFEDE3] hover:text-[#2F5D46]">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(o.id)} className="p-2 rounded-md text-[#6B7568] hover:bg-[#FBEAE6] hover:text-[#B5533C]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-[#1E2A22]">{editingId ? "Edit owner" : "Add owner"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-[#9AA396] hover:text-[#1E2A22]">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Name" error={errors.name}>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
              </Field>
              <Field label="Unit number" error={errors.unit}>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
              </Field>
              <Field label="Email (optional)" error={errors.email}>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
              </Field>

              <p className="text-xs font-medium text-[#2F5D46] pt-2 border-t border-[#E3E0D6]">Additional details (optional)</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Family count">
                  <input value={form.familyCount} onChange={(e) => setForm({ ...form, familyCount: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
                <Field label="Occupation">
                  <input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
                <Field label="ID type">
                  <input value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })} placeholder="Aadhaar, Passport…" className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
                <Field label="Move-in date">
                  <input type="date" value={form.moveIn} onChange={(e) => setForm({ ...form, moveIn: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
                <Field label="Vehicle number">
                  <input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
                <Field label="Parking slot">
                  <input value={form.parkingSlot} onChange={(e) => setForm({ ...form, parkingSlot: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
                <Field label="Emergency contact">
                  <input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                </Field>
              </div>
              <Field label="Remarks">
                <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-[#1E2A22]">
                <input
                  type="checkbox"
                  checked={form.isRented}
                  onChange={(e) => setForm({ ...form, isRented: e.target.checked })}
                  className="rounded"
                />
                Flat is rented out
              </label>
              {form.isRented && (
                <>
                  <Field label="Tenant name">
                    <input value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                  </Field>
                  <Field label="Tenant phone">
                    <input value={form.tenantPhone} onChange={(e) => setForm({ ...form, tenantPhone: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                  </Field>
                  <p className="text-xs font-medium text-[#2F5D46] pt-1">Tenant additional details (optional)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Family count">
                      <input value={form.tenantFamilyCount} onChange={(e) => setForm({ ...form, tenantFamilyCount: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                    </Field>
                    <Field label="Occupation">
                      <input value={form.tenantOccupation} onChange={(e) => setForm({ ...form, tenantOccupation: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                    </Field>
                    <Field label="ID type">
                      <input value={form.tenantIdType} onChange={(e) => setForm({ ...form, tenantIdType: e.target.value })} placeholder="Aadhaar, Passport…" className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                    </Field>
                    <Field label="Move-in date">
                      <input type="date" value={form.tenantMoveIn} onChange={(e) => setForm({ ...form, tenantMoveIn: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                    </Field>
                    <Field label="Vehicle number">
                      <input value={form.tenantVehicleNumber} onChange={(e) => setForm({ ...form, tenantVehicleNumber: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                    </Field>
                    <Field label="Emergency contact">
                      <input value={form.tenantEmergencyContact} onChange={(e) => setForm({ ...form, tenantEmergencyContact: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                    </Field>
                  </div>
                  <Field label="Tenant remarks">
                    <textarea value={form.tenantRemarks} onChange={(e) => setForm({ ...form, tenantRemarks: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-[#E3E0D6] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5D46]/30 focus:border-[#2F5D46]" />
                  </Field>
                </>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2 rounded-lg border border-[#E3E0D6] text-sm text-[#6B7568] hover:bg-[#F6F5F0]">
                Cancel
              </button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-[#2F5D46] text-white text-sm font-medium hover:bg-[#264B39] flex items-center justify-center gap-1.5">
                <Check size={14} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-xs p-5">
            <h2 className="font-display text-lg text-[#1E2A22] mb-2">Remove this owner?</h2>
            <p className="text-sm text-[#6B7568] mb-5">This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-lg border border-[#E3E0D6] text-sm text-[#6B7568] hover:bg-[#F6F5F0]">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 py-2 rounded-lg bg-[#B5533C] text-white text-sm font-medium hover:bg-[#9C4630]">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Root ----------
export default function OwnerDirectoryApp() {
  const [password, setPassword] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setPassword(saved);
    setChecked(true);
  }, []);

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setPassword(null);
  }

  if (!checked) return <div className="min-h-screen bg-[#F6F5F0]" />;
  if (!password) return <LoginScreen onSuccess={setPassword} />;
  return <Directory password={password} onLogout={handleLogout} />;
}
