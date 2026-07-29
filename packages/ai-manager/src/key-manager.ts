import type { ProviderKey } from "./provider";

interface KeyState {
  key: ProviderKey;
  disabled: boolean;
  cooldownUntil: number;
}

export class KeyManager {
  private readonly providers = new Map<string, Map<string, KeyState>>();

  constructor(private readonly defaultCooldownMs = 30_000) {}

  registerKeys(providerName: string, keys: ProviderKey[]): void {
    const map = new Map<string, KeyState>();

    for (const key of keys) {
      map.set(key.id, {
        key,
        disabled: false,
        cooldownUntil: 0,
      });
    }

    this.providers.set(providerName.toLowerCase(), map);
  }

  hasAnyUsableKey(providerName: string): boolean {
    return this.getAvailableKey(providerName) !== null;
  }

  getMaskedKey(providerName: string): string | null {
    const key = this.getAvailableKey(providerName);

    if (!key || !key.value) {
      return null;
    }

    if (key.value.length <= 8) {
      return "****";
    }

    return `${key.value.slice(0, 4)}...${key.value.slice(-4)}`;
  }

  getAvailableKey(providerName: string): ProviderKey | null {
    const now = Date.now();
    const map = this.providers.get(providerName.toLowerCase());

    if (!map) {
      return null;
    }

    for (const state of map.values()) {
      if (!state.disabled && state.cooldownUntil <= now) {
        return state.key;
      }
    }

    return null;
  }

  markKeyFailed(providerName: string, keyId: string, disable = false): void {
    const map = this.providers.get(providerName.toLowerCase());

    if (!map) {
      return;
    }

    const state = map.get(keyId);
    if (!state) {
      return;
    }

    if (disable) {
      state.disabled = true;
      state.cooldownUntil = Infinity;
    } else {
      state.cooldownUntil = Date.now() + this.defaultCooldownMs;
    }

    map.set(keyId, state);
  }

  markKeySuccess(providerName: string, keyId: string): void {
    const map = this.providers.get(providerName.toLowerCase());

    if (!map) {
      return;
    }

    const state = map.get(keyId);
    if (!state) {
      return;
    }

    state.cooldownUntil = 0;
    state.disabled = false;
    map.set(keyId, state);
  }
}
