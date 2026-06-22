import { AGE_KEY } from '../data/products.js';
import { byId } from '../utils/dom.js';
import { getRaw, setRaw } from '../utils/storage.js';

export function initAgeGate() {
  const gate = byId('ageGate');
  const verified = getRaw(AGE_KEY) === 'true';
  if (gate && !verified) {
    document.body.classList.add('age-gate-lock');
    gate.classList.add('show');
    byId('ageEnterBtn')?.addEventListener('click', () => {
      setRaw(AGE_KEY, 'true');
      gate.classList.remove('show');
      document.body.classList.remove('age-gate-lock', 'pre-gate');
    });
    byId('ageExitBtn')?.addEventListener('click', () => { window.location.href = '/access-denied.html'; });
  } else {
    document.body.classList.remove('pre-gate');
  }
}
