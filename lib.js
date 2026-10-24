// Outils communs : texte sécurisé, dates, fenêtres, messages, actions.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- dates (heure locale de l'appareil) ----------
const pad = (n) => String(n).padStart(2, '0');
export const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const mondayOf = (iso) => { const d = parseISO(iso); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoDate(d); };
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const fmtDate = (iso) => (iso ? `${JOURS[parseISO(iso).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const fmtDay = (iso) => `${JOURS[parseISO(iso).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const hhmm = (t) => (t || '').slice(0, 5);
export const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
export const toLocalInput = (ts) => { const d = new Date(ts); return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
export const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 2);

// ---------- libellés (texte + icône + couleur : jamais la couleur seule) ----------
export const T_STATUT = {
  en_attente: ['En attente', '⏳', 'st-wait'],
  en_cours: ['En cours', '🚗', 'st-go'],
  termine: ['Terminé', '✓', 'st-done'],
  annule: ['Annulé', '✕', 'st-cancel'],
};
export const E_STATUT = {
  en_attente: ['En attente', '⏳', 'st-wait'],
  pris_en_charge: ['Personne prise en charge', '🚗', 'st-go'],
  depose: ['Personne déposée', '📍', 'st-done'],
};
export const tag = (map, key) => { const [l, i, c] = map[key] || [key, '', 'st-grey']; return `<span class="tag ${c}">${i} ${esc(l)}</span>`; };
export const NOTIF_ICON = { attribution: '📋', modification: '✏️', reattribution: '🔁', annulation: '✕', pris_en_charge: '🚗', depose: '📍', termine: '✅', probleme: '⚠️', demande: '📨', demande_acceptee: '✅', demande_refusee: '✕' };
export const PROBLEMES = [
  ['retard', 'Retard'], ['client_absent', 'Client absent'], ['probleme_vehicule', 'Problème de véhicule'],
  ['impossibilite', 'Impossible d\'effectuer le trajet'], ['autre', 'Autre problème'],
];

export function genPassword(n = 10) {
  const alpha = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(n); crypto.getRandomValues(buf);
  return [...buf].map((x) => alpha[x % alpha.length]).join('');
}
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- messages ----------
export function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), kind === 'err' ? 6000 : 4200);
  setTimeout(() => el.remove(), kind === 'err' ? 6500 : 4700);
}
export const showError = (e) => { console.error(e); toast(e?.message || String(e), 'err'); };

// ---------- fenêtres ----------
const stack = [];
export function openModal({ title, html, size = '', sticky = false, onClose }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-act="close-modal" aria-label="Fermer">✕</button></div><div class="modal-body">${html}</div></div>`;
  $('#modal-root').append(bg);
  const api = {
    el: bg, body: bg.querySelector('.modal-body'),
    close() { if (!bg.isConnected) return; bg.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); if (onClose) onClose(); },
    setHtml(h) { api.body.innerHTML = h; },
    setTitle(t) { bg.querySelector('h3').textContent = t; },
  };
  if (!sticky) bg.addEventListener('mousedown', (e) => { if (e.target === bg) api.close(); });
  stack.push(api);
  return api;
}
export const closeTopModal = () => { const m = stack[stack.length - 1]; if (m) m.close(); };
export const closeAllModals = () => { while (stack.length) stack[stack.length - 1].close(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopModal(); });

export function confirmDialog(message, { ok = 'Confirmer', danger = false, title = 'Confirmation', html = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: '', sticky: true,
      html: `<p style="white-space:pre-line">${esc(message)}</p>${html}<div class="modal-actions"><button class="btn" data-confirm="0">Annuler</button><button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" data-confirm="1">${esc(ok)}</button></div>`,
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-confirm]'); if (!b || done) return;
      done = true; resolve(b.dataset.confirm === '1'); m.close();
    });
  });
}

// Petite fenêtre avec un texte obligatoire (motif d'annulation, de correction…)
export function askText({ title, label, required = true, ok = 'Valider', extra = '', placeholder = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, sticky: true,
      html: `<form data-form="ask-text">${extra}<div class="field"><label>${esc(label)}</label><textarea name="texte" ${required ? 'required' : ''} placeholder="${esc(placeholder)}"></textarea></div><div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn btn-accent">${esc(ok)}</button></div></form>`,
      onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    m.el.querySelector('form').__resolve = (form) => { done = true; resolve({ texte: form.texte.value.trim(), form }); m.close(); };
  });
}

// ---------- actions et formulaires déclarés par les écrans ----------
export const actions = {};
export const forms = {};
actions['close-modal'] = (el) => { const bg = el.closest('.modal-bg'); const m = stack.find((x) => x.el === bg); if (m) m.close(); };
forms['ask-text'] = (form) => form.__resolve && form.__resolve(form);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = actions[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
  if (el.tagName === 'BUTTON' && el.type !== 'submit') e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch(showError);
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form]; if (!fn) return;
  const btn = f.querySelector('button:not([type=button])');
  if (f.dataset.busy) return;
  f.dataset.busy = '1'; if (btn) btn.disabled = true;
  try { await fn(f, e); } catch (err) { showError(err); } finally { delete f.dataset.busy; if (btn) btn.disabled = false; }
});
export const changes = {};
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && changes[el.dataset.change]) Promise.resolve().then(() => changes[el.dataset.change](el, e)).catch(showError); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && changes[el.dataset.input]) changes[el.dataset.input](el, e); });
