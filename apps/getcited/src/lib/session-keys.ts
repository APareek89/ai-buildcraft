/**
 * BYOK values live in this tab's sessionStorage, scoped to a verified owner.
 * Sign out/account changes clear every tab-held key; old global entries are not
 * imported. Browsers may restore sessionStorage when restoring a tab. Opt-in
 * encrypted server key storage is a separate explicit action.
 */
export interface SessionKeys {
  openai?: string;
  anthropic?: string;
  perplexity?: string;
  gemini?: string;
  groq?: string;
  /** Custom OpenAI-compatible panelist, stored as a JSON blob {baseURL, model, apiKey}. */
  custom?: string;
}

const STORAGE_KEY = "getcited_session_keys:";
const ownerKey = (owner: string) => { if (!owner) throw new Error("Sign in first."); return STORAGE_KEY + owner; };

export function getSessionKeys(owner: string): SessionKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(ownerKey(owner));
    return raw ? (JSON.parse(raw) as SessionKeys) : {};
  } catch {
    return {};
  }
}

export function setSessionKey(owner: string, provider: keyof SessionKeys, value: string) {
  const keys = getSessionKeys(owner);
  if (value) keys[provider] = value;
  else delete keys[provider];
  window.sessionStorage.setItem(ownerKey(owner), JSON.stringify(keys));
}

export function clearSessionKeys() {
  if (typeof window === "undefined") return;
  try { for (const key of Object.keys(window.sessionStorage)) if (key === "getcited_session_keys" || key.startsWith(STORAGE_KEY)) window.sessionStorage.removeItem(key); } catch {}
}

export function hasAnySessionKey(owner: string): boolean {
  const k = getSessionKeys(owner);
  return Boolean(k.openai || k.anthropic || k.perplexity || k.gemini || k.groq || k.custom);
}
