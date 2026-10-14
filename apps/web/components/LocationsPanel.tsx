"use client";

import { useCallback, useEffect, useState } from "react";

import { showAlert, showConfirm, showPrompt } from "../lib/app-dialog";

// Wave B #11 - Locations panel. Business-scoped physical locations as a simple
// CRUD list. Add a location, edit its name/address, toggle active/inactive, or
// delete it. Prime use: multi-location reporting (Wave B #33) and shift
// assignment (Wave B #12). Deploys no auth actor - businessId comes from props.

interface Location {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

export function LocationsPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/locations?businessId=${encodeURIComponent(businessId)}`);
      const data = await res.json();
      setLocations(data.locations ?? []);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  const handleCreate = async () => {
    const name = await showPrompt("Location name (e.g. Downtown Store #1)");
    if (!name) return;
    const res = await fetch(`/api/admin/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, name }),
    });
    if (res.ok) {
      refresh();
    } else {
      showAlert("Failed to create location");
    }
  };

  const handleEdit = async (loc: Location) => {
    const name = await showPrompt("Location name", loc.name);
    if (!name) return;
    const address = await showPrompt("Address (optional)", loc.address ?? "");
    const res = await fetch(`/api/admin/locations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loc.id, name, address: address || null }),
    });
    if (res.ok) {
      refresh();
    } else {
      showAlert("Failed to update location");
    }
  };

  const handleToggle = async (loc: Location) => {
    const res = await fetch(`/api/admin/locations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loc.id, isActive: !loc.isActive }),
    });
    if (res.ok) {
      refresh();
    } else {
      showAlert("Failed to update location");
    }
  };

  const handleDelete = async (loc: Location) => {
    if (!(await showConfirm(`Delete ${loc.name}?`))) return;
    const res = await fetch(`/api/admin/locations?id=${encodeURIComponent(loc.id)}`, { method: "DELETE" });
    if (res.ok) {
      refresh();
    } else {
      showAlert("Failed to delete location");
    }
  };

  const activeCount = locations.filter((l) => l.isActive).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Locations</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="data" style={{ fontSize: 11 }}>{activeCount} active</span>
          <span className="data" style={{ fontSize: 11 }}>{locations.length} total</span>
          <button className="primary" onClick={handleCreate}>
            Add location
          </button>
        </div>
      </div>

      <div className="panel-body">
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 44 }} />
            <div className="skeleton" style={{ height: 44 }} />
          </div>
        ) : locations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No locations yet</div>
            <div className="empty-state-description">
              Add your first storefront so shifts, reporting and multi-location orders can point at it.
            </div>
            <div className="empty-state-actions">
              <button className="primary" onClick={handleCreate}>Add location</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="panel-sunk"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={loc.isActive ? "lamp lamp-ok" : "lamp lamp-idle"}>
                      {loc.isActive ? "Active" : "Inactive"}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{loc.name}</span>
                  </div>
                  <p className="meta" style={{ margin: "3px 0 0", fontSize: 12 }}>
                    {[loc.city, loc.address].filter(Boolean).join(", ") || "No address on file"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="ghost sm" onClick={() => handleToggle(loc)}>
                    {loc.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button className="ghost sm" onClick={() => handleEdit(loc)}>
                    Edit
                  </button>
                  <button className="danger sm" onClick={() => handleDelete(loc)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}