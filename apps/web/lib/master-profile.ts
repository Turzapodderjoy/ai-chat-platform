"use client";

import { useEffect, useMemo, useState } from "react";

export type MasterProfileId = "regular" | "repair-gen";

// A master profile is a workspace "shape": which nav groups show, which
// panel owns the screen, and what the dashboard lands on. Profiles that
// are still being decided are listed as `planned` so they're visible in
// the Profiles tab without being selectable yet.
export interface MasterProfile {
  id: MasterProfileId;
  label: string;
  description: string;
  status: "available" | "planned";
  landingTab: string;
  // Tabs that take over the whole screen (nav rail tucks away).
  focusTabs: string[];
  // Short human list for the Profiles tab.
  features: string[];
}

export const MASTER_PROFILES: MasterProfile[] = [
  {
    id: "regular",
    label: "Standard",
    description: "General business — CRM, chats and platform operations.",
    status: "available",
    landingTab: "home",
    focusTabs: ["allchats"],
    features: ["Inbox-first support", "Customer database", "Orders & invoices", "Reports"],
  },
  {
    id: "repair-gen",
    label: "Repair Gen",
    description: "Repair shop — intake to pickup, parts, and appointments.",
    status: "available",
    landingTab: "repairs",
    focusTabs: ["allchats", "repairs"],
    features: ["Repair work bench", "Intake → repair → pickup", "Parts & inventory", "Appointments"],
  },
];

// Workspace shapes we intend to build but haven't finalized. Surfaced in
// the Profiles tab so the roadmap is visible; not selectable yet.
export interface PlannedProfile {
  id: string;
  label: string;
  description: string;
}

export const PLANNED_PROFILES: PlannedProfile[] = [
  { id: "salon", label: "Salon / Spa", description: "Bookings, stylists and service menus." },
  { id: "clinic", label: "Clinic", description: "Patients, appointments and records." },
  { id: "restaurant", label: "Restaurant", description: "Tables, orders and kitchen flow." },
  { id: "ecommerce", label: "E-commerce", description: "Catalog, carts and fulfilment." },
  { id: "agency", label: "Agency", description: "Projects, clients and retainers." },
];

const STORAGE_KEY = "aiva:master-profile";

export function getStoredMasterProfile(): MasterProfileId {
  if (typeof window === "undefined") return "regular";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "regular" || v === "repair-gen") return v;
  } catch {}
  return "regular";
}

export function setStoredMasterProfile(id: MasterProfileId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

export function useMasterProfile() {
  const [profileId, setProfileIdState] = useState<MasterProfileId>("regular");

  useEffect(() => {
    setProfileIdState(getStoredMasterProfile());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setProfileIdState(getStoredMasterProfile());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setProfileId = (id: MasterProfileId) => {
    setStoredMasterProfile(id);
    setProfileIdState(id);
    try {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: id }));
    } catch {}
  };

  const profile = useMemo(
    () => MASTER_PROFILES.find((p) => p.id === profileId) ?? MASTER_PROFILES[0],
    [profileId]
  );

  return { profileId, setProfileId, profile, profiles: MASTER_PROFILES } as const;
}
