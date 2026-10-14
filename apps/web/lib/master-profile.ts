"use client";

import { useEffect, useMemo, useState } from "react";

export type MasterProfileId = "regular" | "repair-gen";

export interface MasterProfile {
  id: MasterProfileId;
  label: string;
  description: string;
}

export const MASTER_PROFILES: MasterProfile[] = [
  {
    id: "regular",
    label: "Standard",
    description: "General CRM/chats + platform ops",
  },
  {
    id: "repair-gen",
    label: "Repair Gen",
    description: "Full repair-shop ERP/CRM layout",
  },
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

  const profile = useMemo(() => MASTER_PROFILES.find((p) => p.id === profileId) ?? MASTER_PROFILES[0], [profileId]);

  return { profileId, setProfileId, profile, profiles: MASTER_PROFILES } as const;
}
