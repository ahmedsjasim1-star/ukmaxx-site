export function getStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function setStorage(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

export function removeStorage(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

export function getRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setRaw(key, val) {
  try { localStorage.setItem(key, val); return true; } catch { return false; }
}
