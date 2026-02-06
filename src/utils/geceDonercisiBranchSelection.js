export const GECE_BRANCH_STORAGE_KEY = 'gece_donercisi_branch';
export const GECE_DEVICE_ID_STORAGE_KEY = 'gece_donercisi_device_id';

// DB'de SANCAK/SEKER tutuyoruz; Firebase'e #Sancak / #Şeker olarak kaydedilir.
export const GECE_BRANCHES = [
  { value: 'SANCAK', label: 'Sancak' },
  { value: 'SEKER', label: 'Şeker' },
];

export function isValidGeceBranch(branch) {
  return branch === 'SANCAK' || branch === 'SEKER';
}

export function getGeceSelectedBranch() {
  try {
    const v = localStorage.getItem(GECE_BRANCH_STORAGE_KEY);
    return isValidGeceBranch(v) ? v : '';
  } catch {
    return '';
  }
}

export function setGeceSelectedBranch(branch) {
  if (!isValidGeceBranch(branch)) return;
  try {
    localStorage.setItem(GECE_BRANCH_STORAGE_KEY, branch);
  } catch {
    // ignore
  }
}

export function getOrCreateGeceDeviceId() {
  try {
    const existing = localStorage.getItem(GECE_DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const id =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(GECE_DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

