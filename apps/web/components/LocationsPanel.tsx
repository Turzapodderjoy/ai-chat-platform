"use client";

import { useCallback, useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle, labelTextStyle } from "./dashboard-styles";
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
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Locations</h3>
          <p style={subtleTextStyle}>Physical storefronts and stock locations — used by shifts and reporting.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...labelTextStyle, color: "#6b7280" }}>
            {activeCount} active · {locations.length} total
          </span>
          <button style={primaryButtonStyle} onClick={handleCreate}>
            + Add Location
          </button>
        </div>
      </div>

      {loading ? (
        <p style={subtleTextStyle}>Loading locations…</p>
      ) : locations.length === 0 ? (
        <p style={subtleTextStyle}>No locations yet. Add your first storefront.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {locations.map((loc) => (
            <div key={loc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: loc.isActive ? "#f9fafb" : "#f3f4f6", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {loc.name}
                  {!loc.isActive && <span style={{ ...subtleTextStyle, marginLeft: 8 }}>(inactive)</span>}
                </div>
                <p style={{ ...subtleTextStyle, margin: "2px 0 0" }}>
                  {[loc.city, loc.address].filter(Boolean).join(" · ") || "No address"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={secondaryButtonStyle} onClick={() => handleToggle(loc)}>
                  {loc.isActive ? "Deactivate" : "Activate"}
                </button>
                <button style={secondaryButtonStyle} onClick={() => handleEdit(loc)}>
                  Edit
                </button>
                <button style={dangerButtonStyle} onClick={() => handleDelete(loc)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}