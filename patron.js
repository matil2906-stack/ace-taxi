// Écrans du patron : tableau de bord, trajets, planning, transporteurs, clients, véhicules.
import { esc, $, actions, forms, changes, toast, openModal, confirmDialog, askText, todayISO, addDays, mondayOf, fmtDate, fmtDay, hhmm, genPassword, debounce, closeAllModals, telHref, initials } from './lib.js';
import { S, rpc, admin, refresh, hooks, pendingDemandes, cliName, profName, vehName, transporteurs, legsOf, isLate, conflictsFor, vehicleAlerts, firstTime, loadAllHistory, friendly, sb } from './data.js';
import { trajetCard, payloadOf, openFiche } from './shared.js';

export const UI = { f: { periode: 'jour', date: todayISO(), statut: '', transporteur: '', q: '' }, plan: { mode: 'jour', date: todayISO() }, cq: '', showInactive: false };
const byTime = (a, b) => (a.date + firstTime(a)).localeCompare(b.date + firstTime(b));
const val = (x) => (x == null ? '' : x);

// ---------- tableau de bord ----------
export function viewDashboard() {
  const today = todayISO(); const tj = S.trajets.filter((t) => t.date === today && t.statut !== 'annule').sort(byTime);
  const late = S.trajets.filter((t) => isLate(t)); const un = S.trajets.filter((t) => !t.transporteur_id && t.date >= today && (t.statut === 'en_attente'));
  const active = S.trajets.filter((t) => t.statut === 'en_cours');
  const done = tj.filter((t) => t.statut === 'termine');
  const alerts = S.vehicules.filter((v) => v.actif).flatMap((v) => vehicleAlerts(v).map((a) => ({ v, a })));
  const stat = (n, l, go) => `<div class="stat" ${go ? `data-act="goto" data-tab="${go}" role="button" tabindex="0"` : ''}><div class="stat-val">${n}</div><div class="stat-lbl">${l}</div></div>`;
  const block = (title, list, empty = '') => (list.length ? `<h2 class="sec">${title}</h2>${list.map((t) => trajetCard(t)).join('')}` : empty);
  return `<div class="stats">${stat(tj.length, 'Trajets aujourd\'hui', 'trajets')}${stat(active.length, 'En cours')}${stat(done.length, 'Terminés aujourd\'hui')}${stat(late.length, 'En retard')}${stat(un.length, 'Non attribués', 'trajets')}</div>
    ${alerts.length ? `<div class="alert">${alerts.map(({ v, a }) => `<div>🔧 ${esc(v.marque)} ${esc(v.modele)} (${esc(v.plaque)}) : ${esc(a.text)}</div>`).join('')}</div>` : ''}
    ${block('⏰ En retard', late)}
    ${block('⚠ Non attribués', un)}
    <h2 class="sec">Aujourd'hui</h2>
    ${tj.length ? tj.map((t) => trajetCard(t)).join('') : '<div class="empty">Aucun trajet prévu aujourd\'hui</div>'}
    <div class="btn-row" style="margin-top:14px"><button class="btn btn-accent" data-act="new-trajet">➕ Nouveau trajet</button></div>`;
}
actions.goto = (el) => hooks.goto && hooks.goto(el.dataset.tab);

// ---------- liste des trajets ----------
function filtered() {
  const f = UI.f; const today = todayISO(); const q = f.q.trim().toLowerCase();
  let from = null; let to = null;
  if (f.periode === 'jour') from = to = f.date;
  else if (f.periode === 'semaine') { from = mondayOf(f.date); to = addDays(from, 6); }
  else if (f.periode === 'avenir') from = today;
  return S.trajets.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)
    && (!f.statut || t.statut === f.statut)
    && (!f.transporteur || (f.transporteur === 'none' ? !t.transporteur_id : t.transporteur_id === f.transporteur))
    && (!q || cliName(t.client_id).toLowerCase().includes(q) || String(t.numero) === q)).sort(byTime);
}
export function viewTrajets() {
  const f = UI.f; const list = filtered();
  const rad = (v, l) => `<label><input type="radio" name="periode" value="${v}" data-change="f-periode" ${f.periode === v ? 'checked' : ''}>${l}</label>`;
  const sel = (name, opts, cur) => `<select data-change="f-${name}" aria-label="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="toolbar"><div class="seg" style="margin:0">${rad('jour', 'Jour')}${rad('semaine', 'Semaine')}${rad('avenir', 'À venir')}${rad('tout', 'Tout')}</div>
      <button class="btn btn-accent" data-act="new-trajet">➕ Nouveau trajet</button></div>
    <div class="filters">
      ${f.periode === 'jour' || f.periode === 'semaine' ? `<div class="flex"><button class="btn btn-sm" data-act="f-shift" data-n="-1" aria-label="Précédent">◀</button><input type="date" value="${f.date}" data-change="f-date" aria-label="Date"><button class="btn btn-sm" data-act="f-shift" data-n="1" aria-label="Suivant">▶</button><button class="btn btn-sm" data-act="f-today">Aujourd'hui</button></div>` : ''}
      ${sel('statut', [['', 'Tous les statuts'], ['en_attente', 'En attente'], ['en_cours', 'En cours'], ['termine', 'Terminé'], ['annule', 'Annulé']], f.statut)}
      ${sel('transporteur', [['', 'Tous les transporteurs'], ['none', 'Non attribués'], ...transporteurs().map((p) => [p.id, profName(p.id)])], f.transporteur)}
      <input type="search" placeholder="Client ou n°…" value="${esc(f.q)}" data-input="f-q" aria-label="Recherche" id="f-q">
    </div>
    <div class="muted small" style="margin:6px 0">${list.length} trajet${list.length > 1 ? 's' : ''}${f.periode === 'jour' ? ' · ' + fmtDate(f.date) : ''}</div>
    ${list.length ? list.map((t) => trajetCard(t)).join('') : '<div class="empty">Aucun trajet pour ces critères</div>'}
    ${!S.allLoaded && (f.periode === 'tout') ? '<button class="btn btn-block" data-act="load-all">Charger tout l\'historique</button>' : ''}`;
}
changes['f-periode'] = (el) => { UI.f.periode = el.value; hooks.render(); if (el.value === 'tout' && !S.allLoaded) { /* bouton dédié */ } };
changes['f-date'] = (el) => { if (el.value) { UI.f.date = el.value; hooks.render(); } };
changes['f-statut'] = (el) => { UI.f.statut = el.value; hooks.render(); };
changes['f-transporteur'] = (el) => { UI.f.transporteur = el.value; hooks.render(); };
const rerenderQ = debounce(() => { hooks.render(); const i = $('#f-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
changes['f-q'] = (el) => { UI.f.q = el.value; rerenderQ(); };
actions['f-shift'] = (el) => { UI.f.date = addDays(UI.f.date, +el.dataset.n * (UI.f.periode === 'semaine' ? 7 : 1)); hooks.render(); };
actions['f-today'] = () => { UI.f.date = todayISO(); hooks.render(); };
actions['load-all'] = async () => { await loadAllHistory(); };

// ---------- planning ----------
export function viewPlanning() {
  const p = UI.plan; const days = p.mode === 'jour' ? [p.date] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(p.date), i));
  const trs = [...transporteurs().filter((x) => x.actif || S.trajets.some((t) => t.transporteur_id === x.id && days.includes(t.date))).map((x) => [x.id, profName(x.id)]), ['none', 'Non attribué']];
  const seg = (v, l) => `<label><input type="radio" name="pm" value="${v}" data-change="plan-mode" ${p.mode === v ? 'checked' : ''}>${l}</label>`;
  const cell = (day, tid) => S.trajets.filter((t) => t.date === day && t.statut !== 'annule' && (tid === 'none' ? !t.transporteur_id : t.transporteur_id === tid)).sort(byTime);
  const item = (t) => { const legs = legsOf(t); return `<div class="plan-item ${t.statut}" data-act="open-trajet" data-id="${esc(t.id)}" role="button" tabindex="0"><b>${hhmm(legs[0]?.heure_prevue)}${legs[1] ? ' ↔ ' + hhmm(legs[1].heure_prevue) : ''}</b> ${esc(cliName(t.client_id))}${isLate(t) ? ' ⏰' : ''}${t.statut === 'termine' ? ' ✓' : ''}</div>`; };
  const body = p.mode === 'jour'
    ? trs.map(([id, n]) => { const c = cell(p.date, id); return c.length || id !== 'none' ? `<div class="plan-group"><h3>${esc(n)} <span class="muted small">(${c.length})</span></h3>${c.length ? c.map(item).join('') : '<div class="muted small">Rien de prévu</div>'}</div>` : ''; }).join('')
    : `<div class="plan-week">${days.map((d) => { const all = trs.flatMap(([id, n]) => cell(d, id).map((t) => [n, t])); return `<div class="plan-day ${d === todayISO() ? 'today' : ''}"><h3>${fmtDay(d)}</h3>${all.length ? all.map(([n, t]) => `<div class="muted small">${esc(n)}</div>${item(t)}`).join('') : '<div class="muted small">—</div>'}</div>`; }).join('')}</div>`;
  return `<div class="toolbar"><div class="seg" style="margin:0">${seg('jour', 'Jour')}${seg('semaine', 'Semaine')}</div><button class="btn btn-accent" data-act="new-trajet">➕ Nouveau trajet</button></div>
    <div class="filters"><div class="flex"><button class="btn btn-sm" data-act="plan-shift" data-n="-1" aria-label="Précédent">◀</button><input type="date" value="${p.date}" data-change="plan-date" aria-label="Date"><button class="btn btn-sm" data-act="plan-shift" data-n="1" aria-label="Suivant">▶</button><button class="btn btn-sm" data-act="plan-today">Aujourd'hui</button></div></div>
    ${p.mode === 'semaine' ? `<div class="muted small" style="margin:6px 0">Semaine du ${fmtDay(days[0])} au ${fmtDay(days[6])}</div>` : `<div class="muted small" style="margin:6px 0">${fmtDate(p.date)}</div>`}${body}`;
}
changes['plan-mode'] = (el) => { UI.plan.mode = el.value; hooks.render(); };
changes['plan-date'] = (el) => { if (el.value) { UI.plan.date = el.value; hooks.render(); } };
actions['plan-shift'] = (el) => { UI.plan.date = addDays(UI.plan.date, +el.dataset.n * (UI.plan.mode === 'semaine' ? 7 : 1)); hooks.render(); };
actions['plan-today'] = () => { UI.plan.date = todayISO(); hooks.render(); };

// ---------- formulaire de trajet ----------
let formApi = null;
const legFields = (k, l = {}, title, req = true) => `<fieldset class="fieldset" data-leg="${k}"><legend>${title}</legend>
  <div class="grid2"><div class="field"><label>Heure de prise en charge</label><input type="time" name="${k}_heure" value="${hhmm(l.heure_prevue)}" ${req ? 'required' : ''} data-input="tf-check"></div>
  <div class="field"><label>Informations</label><input name="${k}_infos" value="${esc(l.infos)}" placeholder="Étage, fauteuil, bagages…"></div></div>
  <div class="field"><label>Adresse de départ</label><input name="${k}_depart" value="${esc(l.adresse_depart)}" ${req ? 'required' : ''} data-input="${k === 'aller' ? 'tf-sync' : 'tf-touch'}"></div>
  <div class="field"><label>Adresse d'arrivée</label><input name="${k}_arrivee" value="${esc(l.adresse_arrivee)}" ${req ? 'required' : ''} data-input="${k === 'aller' ? 'tf-sync' : 'tf-touch'}"></div></fieldset>`;

function formHtml(t, ed = !!t, allowRep = false) {
  const legs = t ? legsOf(t) : []; const a = legs[0] || {}; const r = legs[1];
  const type = t ? t.type : 'aller_simple';
  const cli = S.clients.slice().sort((x, y) => cliName(x.id).localeCompare(cliName(y.id)));
  const tr = transporteurs().filter((p) => p.actif || (t && p.id === t.transporteur_id));
  const vs = S.vehicules.filter((v) => v.actif || (t && v.id === t.vehicule_id));
  const retourAdr = (!r && a.adresse_depart) ? { adresse_depart: a.adresse_arrivee, adresse_arrivee: a.adresse_depart } : {};
  return `<form data-form="trajet" data-id="${ed ? esc(t.id) : ''}" autocomplete="off">
    <div class="field"><label>Type de trajet</label><div class="seg"><label><input type="radio" name="type" value="aller_simple" data-change="tf-type" ${type === 'aller_simple' ? 'checked' : ''}>Aller simple</label><label><input type="radio" name="type" value="aller_retour" data-change="tf-type" ${type === 'aller_retour' ? 'checked' : ''}>Aller-retour</label></div></div>
    <div class="grid2"><div class="field"><label>Date</label><input type="date" name="date" required value="${t ? t.date : UI.f.date || todayISO()}" data-input="tf-check"></div>
    <div class="field"><label>Client</label><div class="flex"><select name="client_id" required data-change="tf-client" style="flex:1"><option value="">— Choisir —</option>${cli.map((c) => `<option value="${esc(c.id)}" ${t && t.client_id === c.id ? 'selected' : ''}>${esc(cliName(c.id))}</option>`).join('')}</select><button type="button" class="btn btn-sm" data-act="client-inline" title="Nouveau client">＋</button></div></div></div>
    ${legFields('aller', a, type === 'aller_retour' ? 'ALLER' : 'TRAJET')}
    <div id="retour-box" class="${type === 'aller_retour' ? '' : 'hide'}">${legFields('retour', r || retourAdr, 'RETOUR', type === 'aller_retour')}</div>
    <div class="grid2"><div class="field"><label>Transporteur</label><select name="transporteur_id" data-change="tf-check"><option value="">— Non attribué —</option>${tr.map((p) => `<option value="${esc(p.id)}" ${t && t.transporteur_id === p.id ? 'selected' : ''}>${esc(profName(p.id))}${p.actif ? '' : ' (désactivé)'}</option>`).join('')}</select></div>
    <div class="field"><label>Véhicule</label><select name="vehicule_id" data-change="tf-check"><option value="">— Aucun —</option>${vs.map((v) => `<option value="${esc(v.id)}" ${t && t.vehicule_id === v.id ? 'selected' : ''}>${esc(vehName(v.id))}</option>`).join('')}</select></div></div>
    ${allowRep ? `<div class="field"><label class="toggle-row"><input type="checkbox" name="rep" data-change="tf-rep"> 🔁 Trajet régulier (il se répète)</label>
      <div id="rep-box" class="hide"><div class="grid2"><div class="field"><label>Tous les … jours</label><input type="number" name="rep_pas" min="1" max="365" value="7"><div class="hint">7 = chaque semaine · 14 = toutes les 2 semaines · 10, 15… au choix</div></div>
      <div class="field"><label>Jusqu'au</label><input type="date" name="rep_fin"></div></div>
      <div class="hint">Le trajet est créé pour chaque date, à la même heure. Le transporteur reçoit une seule notification.</div></div></div>` : ''}
    <div class="field"><label>Instructions pour le transporteur</label><textarea name="commentaires">${esc(t ? t.commentaires : '')}</textarea></div>
    <div id="conflicts"></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn btn-accent">${ed ? 'Enregistrer les modifications' : 'Créer le trajet'}</button></div></form>`;
}
export function openTrajetForm(t = null, preset = {}) {
  if (!S.clients.length && !t && !preset.demande) { toast('Ajoutez d\'abord un client (onglet Clients)', 'err'); return; }
  if (formApi) formApi.close();
  let pseudo = t; const d = preset.demande;
  if (d) { // la demande d'un transporteur pré-remplit un NOUVEAU trajet : le patron choisit transporteur et véhicule
    const leg = (sens, l) => ({ sens, heure_prevue: l.heure, adresse_depart: l.depart, adresse_arrivee: l.arrivee, infos: l.infos });
    pseudo = { type: d.type, date: d.date, client_id: d.client_id, transporteur_id: null, vehicule_id: null, commentaires: d.commentaires || '', trajet_etapes: [leg('aller', d.aller), ...(d.retour ? [leg('retour', d.retour)] : [])] };
  }
  formApi = openModal({ title: d ? `Demande n° ${d.numero} : choisir transporteur et véhicule` : t ? `Modifier le trajet n° ${t.numero}` : 'Nouveau trajet', size: 'lg', sticky: true, html: formHtml(pseudo, !!t, !t && !d), onClose: () => { formApi = null; } });
  if (d) formApi.el.querySelector('form').dataset.demande = d.id;
  if (!t && !d && preset.client_id) { const s = formApi.el.querySelector('[name=client_id]'); s.value = preset.client_id; }
  checkConflicts();
}
actions['new-trajet'] = () => openTrajetForm();
actions['edit-trajet'] = (el) => { const t = S.trajets.find((x) => x.id === el.dataset.id); if (t) openTrajetForm(t); };

function readForm(f) {
  const g = (n) => f.elements[n]?.value || '';
  const type = f.elements.type.value; const leg = (k) => ({ heure: g(k + '_heure'), depart: g(k + '_depart').trim(), arrivee: g(k + '_arrivee').trim(), infos: g(k + '_infos').trim() });
  const p = { type, date: g('date'), client_id: g('client_id') || null, transporteur_id: g('transporteur_id') || null, vehicule_id: g('vehicule_id') || null, commentaires: g('commentaires').trim(), aller: leg('aller') };
  if (type === 'aller_retour') p.retour = leg('retour');
  return p;
}
function checkConflicts() {
  const f = formApi && formApi.el.querySelector('form'); const box = f && f.querySelector('#conflicts'); if (!box) return;
  const p = readForm(f); const legs = [p.aller, p.retour].filter((l) => l && l.heure);
  if (!p.date || !legs.length) { box.innerHTML = ''; return; }
  const cs = conflictsFor({ id: f.dataset.id, date: p.date, transporteur_id: p.transporteur_id, vehicule_id: p.vehicule_id, legs }, S.trajets);
  const msg = cs.map((c) => `⚠ ${c.kind === 'transporteur' ? profName(c.trajet.transporteur_id) : vehName(c.trajet.vehicule_id)} a déjà le trajet n° ${c.trajet.numero} (${esc(cliName(c.trajet.client_id))}) vers ${c.heure}. Vous pouvez quand même enregistrer.`);
  box.innerHTML = msg.length ? `<div class="warn">${msg.join('<br>')}</div>` : '';
}
changes['tf-check'] = checkConflicts;
// Le retour reprend automatiquement l'aller à l'envers, tant que l'on n'a pas modifié les adresses du retour à la main.
changes['tf-touch'] = (el) => { el.closest('form').dataset.retourTouched = '1'; };
changes['tf-sync'] = (el) => {
  const f = el.closest('form'); if (f.dataset.id || f.dataset.retourTouched) return;
  f.elements.retour_depart.value = f.elements.aller_arrivee.value; f.elements.retour_arrivee.value = f.elements.aller_depart.value;
};
changes['tf-type'] = (el) => {
  const f = el.closest('form'); const ar = el.value === 'aller_retour';
  f.querySelector('#retour-box').classList.toggle('hide', !ar);
  f.querySelector('[data-leg=aller] legend').textContent = ar ? 'ALLER' : 'TRAJET';
  for (const n of ['retour_heure', 'retour_depart', 'retour_arrivee']) f.elements[n].required = ar;
  if (ar && !f.dataset.retourTouched && !f.elements.retour_depart.value) { f.elements.retour_depart.value = f.elements.aller_arrivee.value; f.elements.retour_arrivee.value = f.elements.aller_depart.value; }
  checkConflicts();
};
changes['tf-rep'] = (el) => {
  const f = el.closest('form'); const box = f.querySelector('#rep-box'); box.classList.toggle('hide', !el.checked);
  f.elements.rep_pas.required = el.checked; f.elements.rep_fin.required = el.checked;
  if (el.checked && !f.elements.rep_fin.value && f.elements.date.value) f.elements.rep_fin.value = addDays(f.elements.date.value, 84); // 12 semaines par défaut
};
changes['tf-client'] = (el) => {
  const c = S.clients.find((x) => x.id === el.value); const f = el.closest('form');
  if (c && c.adresse && !f.elements.aller_depart.value) f.elements.aller_depart.value = c.adresse;
  checkConflicts();
};
forms.trajet = async (f) => {
  const p = readForm(f); const id = f.dataset.id;
  if (!p.client_id) throw new Error('Choisissez un client');
  if (p.type === 'aller_retour' && p.retour.heure <= p.aller.heure) {
    if (!(await confirmDialog('L\'heure du retour est avant (ou égale à) celle de l\'aller. Continuer quand même ?', { ok: 'Oui, continuer' }))) return;
  }
  if (id) await rpc('modifier_trajet', { p_id: id, p });
  else if (f.dataset.demande) await rpc('traiter_demande', { p_id: f.dataset.demande, p_action: 'accepter', p, p_motif: null });
  else if (f.elements.rep && f.elements.rep.checked) {
    const pas = parseInt(f.elements.rep_pas.value, 10); const fin = f.elements.rep_fin.value;
    if (!pas || pas < 1) throw new Error('Indiquez tous les combien de jours le trajet se répète');
    if (!fin || fin < p.date) throw new Error('La date de fin doit être après la date du premier trajet');
    const n = Math.floor((new Date(fin) - new Date(p.date)) / 864e5 / pas) + 1;
    if (n > 60) throw new Error('Maximum 60 trajets d\'un coup : raccourcissez la période');
    if (!(await confirmDialog(`Créer ${n} trajet${n > 1 ? 's' : ''}, tous les ${pas} jour${pas > 1 ? 's' : ''}, du ${fmtDate(p.date)} au ${fmtDate(fin)} ?`, { ok: 'Oui, créer' }))) return;
    const nb = await rpc('creer_serie', { p, p_pas: pas, p_jusqu: fin });
    formApi && formApi.close(); toast(`${nb} trajets créés`, 'ok'); await refresh(); return;
  }
  else await rpc('creer_trajet', { p });
  formApi && formApi.close(); toast(id ? 'Trajet modifié' : f.dataset.demande ? 'Demande acceptée : trajet créé' : 'Trajet créé', 'ok'); await refresh();
};
actions['client-inline'] = () => openClientForm(null, async (c) => {
  await refresh(); const s = formApi && formApi.el.querySelector('[name=client_id]');
  if (s) { s.innerHTML = '<option value="">— Choisir —</option>' + S.clients.slice().sort((x, y) => cliName(x.id).localeCompare(cliName(y.id))).map((x) => `<option value="${esc(x.id)}">${esc(cliName(x.id))}</option>`).join(''); s.value = c.id; changes['tf-client'](s); }
});

// ---------- transporteurs ----------
export function viewTransporteurs() {
  const all = transporteurs(); const list = all.filter((p) => p.actif || UI.showInactive);
  const row = (p) => {
    const n = S.trajets.filter((t) => t.transporteur_id === p.id && t.date === todayISO() && t.statut !== 'annule').length;
    return `<div class="row"><div class="avatar">${esc(initials(profName(p.id)))}</div><div class="row-main"><div class="row-title">${esc(profName(p.id))} ${p.actif ? '' : '<span class="tag st-cancel">Désactivé</span>'}${p.must_change_password ? ' <span class="tag st-warn">Mot de passe provisoire</span>' : ''}</div>
      <div class="row-sub">E-mail : ${esc(p.identifiant)}${p.telephone ? ' · travail ' + esc(p.telephone) : ''}${p.telephone_perso ? ' · perso ' + esc(p.telephone_perso) : ''} · ${n} trajet${n > 1 ? 's' : ''} aujourd'hui</div></div>
      <div class="btn-row">${p.telephone ? `<a class="btn btn-sm btn-blue" href="${telHref(p.telephone)}">📞</a>` : ''}<button class="btn btn-sm" data-act="edit-transp" data-id="${esc(p.id)}">Modifier</button></div></div>`;
  };
  return `<div class="toolbar"><label class="toggle"><input type="checkbox" data-change="show-inactive" ${UI.showInactive ? 'checked' : ''}> Afficher les désactivés</label><button class="btn btn-accent" data-act="new-transp">➕ Nouveau transporteur</button></div>
    <div class="panel">${list.length ? list.map(row).join('') : '<div class="empty">Aucun transporteur. Créez le premier avec le bouton ci-dessus.</div>'}</div>`;
}
changes['show-inactive'] = (el) => { UI.showInactive = el.checked; hooks.render(); };

actions['new-transp'] = () => {
  const m = openModal({ title: 'Nouveau transporteur', sticky: true, html: `<form data-form="transp-new" autocomplete="off">
    <div class="grid2"><div class="field"><label>Prénom</label><input name="prenom" required></div><div class="field"><label>Nom</label><input name="nom" required></div></div>
    <div class="grid2"><div class="field"><label>Téléphone du travail</label><input name="telephone" type="tel"></div><div class="field"><label>Téléphone personnel</label><input name="telephone_perso" type="tel"></div></div>
    <div class="field"><label>Adresse e-mail du transporteur</label><input name="identifiant" required inputmode="email" placeholder="ex. marion@gmail.com" autocapitalize="none" autocorrect="off" spellcheck="false"><div class="hint">Elle sert à se connecter, et à retrouver son mot de passe s'il l'oublie.</div></div>
    <div class="field"><label>Mot de passe provisoire</label><div class="pwd-row"><input name="password" required minlength="8" value="${genPassword()}"><button type="button" class="btn btn-sm" data-act="gen-pwd">Autre</button></div><div class="hint">Le transporteur devra le changer à sa première connexion.</div></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn btn-accent">Créer le compte</button></div></form>` });
  m.el.dataset.kind = 'transp-new';
};
actions['gen-pwd'] = (el) => { el.closest('.pwd-row').querySelector('input').value = genPassword(); };
function showCreds(title, ident, pwd) {
  openModal({ title, sticky: true, html: `<div class="ok-msg">Communiquez ces accès au transporteur (en main propre ou par message). Le mot de passe ne sera plus affiché ensuite.</div>
    <dl class="kv"><dt>E-mail de connexion</dt><dd><b>${esc(ident)}</b></dd><dt>Mot de passe provisoire</dt><dd><b>${esc(pwd)}</b></dd><dt>Adresse du site</dt><dd>${esc(location.origin)}</dd></dl>
    <div class="modal-actions"><button class="btn" data-act="copy-creds" data-text="${esc(`ACE Taxi\nSite : ${location.origin}\nE-mail : ${ident}\nMot de passe provisoire : ${pwd}`)}">Copier</button><button class="btn btn-accent" data-act="close-modal">J'ai noté les accès</button></div>` });
}
actions['copy-creds'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Copié', 'ok'); } catch { toast('Copie impossible : notez les accès à la main', 'err'); } };
forms['transp-new'] = async (f) => {
  const identifiant = f.identifiant.value.trim().toLowerCase(); const password = f.password.value;
  await admin('create', { identifiant, password, prenom: f.prenom.value.trim(), nom: f.nom.value.trim(), telephone: f.telephone.value.trim(), telephone_perso: f.telephone_perso.value.trim() });
  closeAllModals(); await refresh(); showCreds('Compte créé', identifiant, password);
};
actions['edit-transp'] = (el) => {
  const p = S.profiles.find((x) => x.id === el.dataset.id); if (!p) return;
  openModal({ title: profName(p.id), html: `<dl class="kv"><dt>E-mail</dt><dd>${esc(p.identifiant)}</dd><dt>Statut</dt><dd>${p.actif ? 'Actif' : 'Désactivé (ne peut plus se connecter)'}</dd></dl>
    <form data-form="transp-phones" data-id="${esc(p.id)}" style="margin-top:12px">
      <div class="grid2"><div class="field"><label>Téléphone du travail</label><input name="telephone" type="tel" value="${esc(p.telephone)}"></div><div class="field"><label>Téléphone personnel</label><input name="telephone_perso" type="tel" value="${esc(p.telephone_perso)}"></div></div>
      <button class="btn btn-sm">Enregistrer les numéros</button></form>
    <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="reset-transp" data-id="${esc(p.id)}">🔑 Nouveau mot de passe</button>
    <button class="btn ${p.actif ? 'btn-danger' : 'btn-green'}" data-act="toggle-transp" data-id="${esc(p.id)}">${p.actif ? 'Désactiver' : 'Réactiver'}</button></div>
    <p class="hint" style="margin-top:12px">Un transporteur désactivé ne peut plus se connecter ; ses trajets passés restent dans l'historique.</p>` });
};
forms['transp-phones'] = async (f) => {
  const { error } = await sb.from('profiles').update({ telephone: f.telephone.value.trim() || null, telephone_perso: f.telephone_perso.value.trim() || null }).eq('id', f.dataset.id);
  if (error) throw new Error(friendly(error));
  toast('Numéros enregistrés', 'ok'); await refresh();
};
actions['reset-transp'] = async (el) => {
  const p = S.profiles.find((x) => x.id === el.dataset.id); const pwd = genPassword();
  if (!(await confirmDialog(`Créer un nouveau mot de passe provisoire pour ${profName(p.id)} ? L'ancien ne fonctionnera plus.`, { ok: 'Oui, réinitialiser' }))) return;
  await admin('reset_password', { id: p.id, password: pwd }); closeAllModals(); await refresh(); showCreds('Mot de passe réinitialisé', p.identifiant, pwd);
};
actions['toggle-transp'] = async (el) => {
  const p = S.profiles.find((x) => x.id === el.dataset.id); const to = !p.actif;
  let n = 0; if (!to) n = S.trajets.filter((t) => t.transporteur_id === p.id && t.date >= todayISO() && (t.statut === 'en_attente' || t.statut === 'en_cours')).length;
  if (!(await confirmDialog(to ? `Réactiver ${profName(p.id)} ?` : `Désactiver ${profName(p.id)} ? Il ne pourra plus se connecter.${n ? `\n\n⚠ ${n} trajet(s) à venir lui sont encore attribués : pensez à les réattribuer.` : ''}`, { ok: to ? 'Réactiver' : 'Désactiver', danger: !to }))) return;
  await admin('set_active', { id: p.id, actif: to }); closeAllModals(); toast(to ? 'Compte réactivé' : 'Compte désactivé', 'ok'); await refresh();
};

// ---------- clients ----------
export function viewClients() {
  const q = UI.cq.trim().toLowerCase();
  const list = S.clients.filter((c) => !q || cliName(c.id).toLowerCase().includes(q) || (c.telephone || '').includes(q)).sort((a, b) => cliName(a.id).localeCompare(cliName(b.id)));
  return `<div class="toolbar"><input type="search" id="c-q" placeholder="Rechercher un client…" value="${esc(UI.cq)}" data-input="c-q" aria-label="Recherche client"><button class="btn btn-accent" data-act="new-client">➕ Nouveau client</button></div>
    <div class="panel">${list.length ? list.map((c) => `<div class="row"><div class="avatar">${esc(initials(cliName(c.id)))}</div><div class="row-main"><div class="row-title">${esc(cliName(c.id))}${c.is_demo ? ' <span class="tag st-grey">Démo</span>' : ''}</div><div class="row-sub">${esc(c.telephone) || 'Pas de téléphone'}${c.adresse ? ' · ' + esc(c.adresse) : ''}</div></div>
      <div class="btn-row">${c.telephone ? `<a class="btn btn-sm btn-blue" href="${telHref(c.telephone)}">📞</a>` : ''}<button class="btn btn-sm" data-act="trajet-for" data-id="${esc(c.id)}">🚕 Trajet</button><button class="btn btn-sm" data-act="edit-client" data-id="${esc(c.id)}">Modifier</button></div></div>`).join('') : '<div class="empty">Aucun client</div>'}</div>`;
}
const rerenderC = debounce(() => { hooks.render(); const i = $('#c-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
changes['c-q'] = (el) => { UI.cq = el.value; rerenderC(); };
actions['trajet-for'] = (el) => openTrajetForm(null, { client_id: el.dataset.id });
export function openClientForm(c, onSaved) {
  const m = openModal({ title: c ? 'Modifier le client' : 'Nouveau client', sticky: true, html: `<form data-form="client" data-id="${c ? esc(c.id) : ''}" autocomplete="off">
    <div class="grid2"><div class="field"><label>Prénom</label><input name="prenom" value="${esc(c && c.prenom)}"></div><div class="field"><label>Nom</label><input name="nom" required value="${esc(c && c.nom)}"></div></div>
    <div class="field"><label>Téléphone</label><input name="telephone" type="tel" value="${esc(c && c.telephone)}"></div>
    <div class="field"><label>Adresse habituelle</label><input name="adresse" value="${esc(c && c.adresse)}"></div>
    <div class="field"><label>Remarques</label><textarea name="commentaires">${esc(c && c.commentaires)}</textarea></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn btn-accent">Enregistrer</button></div></form>` });
  m.body.querySelector('form').__saved = onSaved;
}
actions['new-client'] = () => openClientForm(null);
actions['edit-client'] = (el) => openClientForm(S.clients.find((x) => x.id === el.dataset.id));
forms.client = async (f) => {
  const row = { nom: f.nom.value.trim(), prenom: f.prenom.value.trim(), telephone: f.telephone.value.trim() || null, adresse: f.adresse.value.trim() || null, commentaires: f.commentaires.value.trim() || null };
  const q = f.dataset.id ? sb.from('clients').update(row).eq('id', f.dataset.id).select().single() : sb.from('clients').insert(row).select().single();
  const { data, error } = await q; if (error) throw new Error(friendly(error));
  const cb = f.__saved; f.closest('.modal-bg').querySelector('[data-act=close-modal]').click();
  toast('Client enregistré', 'ok'); if (cb) await cb(data); else await refresh();
};

// ---------- véhicules ----------
export function viewVehicules() {
  const list = S.vehicules.filter((v) => v.actif || UI.showInactive);
  const d = (x) => (x ? fmtDate(x) : '—');
  return `<div class="toolbar"><label class="toggle"><input type="checkbox" data-change="show-inactive" ${UI.showInactive ? 'checked' : ''}> Afficher les véhicules désactivés</label><button class="btn btn-accent" data-act="new-veh">➕ Nouveau véhicule</button></div>
    <div class="panel">${list.length ? list.map((v) => { const al = vehicleAlerts(v); return `<div class="row"><div class="avatar">🚗</div><div class="row-main"><div class="row-title">${esc(v.marque)} ${esc(v.modele)} · ${esc(v.plaque)} ${v.actif ? '' : '<span class="tag st-cancel">Désactivé</span>'}${v.is_demo ? ' <span class="tag st-grey">Démo</span>' : ''}</div>
      <div class="row-sub">CT : ${d(v.ct_prochain)} · Entretien : ${d(v.entretien_prochain)}${v.kilometrage != null ? ' · ' + v.kilometrage.toLocaleString('fr-FR') + ' km' : ''}</div>
      ${al.map((a) => `<span class="tag ${a.level === 'late' ? 'st-cancel' : 'st-warn'}">🔧 ${esc(a.text)}</span>`).join(' ')}</div>
      <div class="btn-row"><button class="btn btn-sm" data-act="edit-veh" data-id="${esc(v.id)}">Modifier</button></div></div>`; }).join('') : '<div class="empty">Aucun véhicule</div>'}</div>`;
}
const openVehForm = (v) => openModal({ title: v ? 'Modifier le véhicule' : 'Nouveau véhicule', sticky: true, html: `<form data-form="veh" data-id="${v ? esc(v.id) : ''}" autocomplete="off">
  <div class="grid2"><div class="field"><label>Marque</label><input name="marque" required value="${esc(v && v.marque)}"></div><div class="field"><label>Modèle</label><input name="modele" required value="${esc(v && v.modele)}"></div></div>
  <div class="grid2"><div class="field"><label>Plaque</label><input name="plaque" required value="${esc(v && v.plaque)}"></div><div class="field"><label>Kilométrage</label><input name="km" type="number" min="0" value="${val(v && v.kilometrage)}"></div></div>
  <div class="grid2"><div class="field"><label>Dernier contrôle technique</label><input name="ct_dernier" type="date" value="${val(v && v.ct_dernier)}"></div><div class="field"><label>Prochain contrôle technique</label><input name="ct_prochain" type="date" value="${val(v && v.ct_prochain)}"></div></div>
  <div class="grid2"><div class="field"><label>Dernière vidange</label><input name="vidange" type="date" value="${val(v && v.vidange_derniere)}"></div><div class="field"><label>Prochain entretien</label><input name="entretien" type="date" value="${val(v && v.entretien_prochain)}"></div></div>
  <div class="field"><label>Remarques</label><textarea name="commentaires">${esc(v && v.commentaires)}</textarea></div>
  ${v ? `<label class="toggle"><input type="checkbox" name="actif" ${v.actif ? 'checked' : ''}> Véhicule en service</label>` : ''}
  <div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn btn-accent">Enregistrer</button></div></form>` });
actions['new-veh'] = () => openVehForm(null);
actions['edit-veh'] = (el) => openVehForm(S.vehicules.find((x) => x.id === el.dataset.id));
forms.veh = async (f) => {
  const n = (x) => x.value || null;
  const row = { marque: f.marque.value.trim(), modele: f.modele.value.trim(), plaque: f.plaque.value.trim().toUpperCase(), kilometrage: f.km.value === '' ? null : +f.km.value, ct_dernier: n(f.ct_dernier), ct_prochain: n(f.ct_prochain), vidange_derniere: n(f.vidange), entretien_prochain: n(f.entretien), commentaires: f.commentaires.value.trim() || null };
  if (f.dataset.id) row.actif = f.actif.checked;
  const q = f.dataset.id ? sb.from('vehicules').update(row).eq('id', f.dataset.id) : sb.from('vehicules').insert(row);
  const { error } = await q; if (error) throw new Error(friendly(error));
  f.closest('.modal-bg').querySelector('[data-act=close-modal]').click(); toast('Véhicule enregistré', 'ok'); await refresh();
};

// ---------- demandes de transport proposées par les transporteurs ----------
export function viewDemandes() {
  const wait = pendingDemandes().slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = S.demandes.filter((x) => x.statut !== 'en_attente').slice(0, 30);
  const legTxt = (l, lbl) => `<div class="route"><b>${lbl} ${hhmm(l.heure)}</b> ${esc(l.depart)} → ${esc(l.arrivee)}${l.infos ? ' · ℹ️ ' + esc(l.infos) : ''}</div>`;
  const card = (d, actions_) => `<div class="tcard">
    <div class="tcard-head"><div><div class="tcard-title">${esc(cliName(d.client_id))} · ${fmtDate(d.date)}</div>
      <div class="tcard-sub">Demande n° ${d.numero} · proposée par ${esc(profName(d.demandeur_id))} le ${fmtDate(d.created_at.slice(0, 10))}</div></div>
      ${d.statut === 'en_attente' ? '<span class="tag st-warn">⏳ À traiter</span>' : d.statut === 'acceptee' ? '<span class="tag st-done">✓ Acceptée</span>' : '<span class="tag st-cancel">✕ Refusée</span>'}</div>
    ${legTxt(d.aller, d.retour ? 'Aller' : 'Trajet')}${d.retour ? legTxt(d.retour, 'Retour') : ''}
    ${d.commentaires ? `<div class="route">💬 ${esc(d.commentaires)}</div>` : ''}${d.motif_refus ? `<div class="route">Motif du refus : ${esc(d.motif_refus)}</div>` : ''}
    ${actions_ || ''}</div>`;
  return `<div class="muted" style="margin-bottom:8px">Transports proposés par vos transporteurs. Rien n'est créé tant que vous n'avez pas choisi le transporteur et le véhicule.</div>
    ${wait.length ? wait.map((d) => card(d, `<div class="btn-row" style="margin-top:10px"><button class="btn btn-accent" data-act="accept-demande" data-id="${esc(d.id)}">Choisir transporteur et véhicule</button>${d.trajet_source_id ? `<button class="btn btn-sm" data-act="open-trajet" data-id="${esc(d.trajet_source_id)}">Voir le trajet d'origine</button>` : ''}<button class="btn btn-sm btn-danger" data-act="refuse-demande" data-id="${esc(d.id)}">Refuser</button></div>`)).join('') : '<div class="empty">Aucune demande en attente</div>'}
    ${done.length ? '<h2 class="sec">Déjà traitées</h2>' + done.map((d) => card(d, d.trajet_id ? `<div class="btn-row" style="margin-top:8px"><button class="btn btn-sm" data-act="open-trajet" data-id="${esc(d.trajet_id)}">Voir le trajet créé</button></div>` : '')).join('') : ''}`;
}
actions['accept-demande'] = (el) => { const d = S.demandes.find((x) => x.id === el.dataset.id); if (d) openTrajetForm(null, { demande: d }); };
actions['refuse-demande'] = async (el) => {
  const d = S.demandes.find((x) => x.id === el.dataset.id); if (!d) return;
  const r = await askText({ title: 'Refuser la demande ?', label: 'Motif (facultatif, transmis au transporteur)', required: false, ok: 'Refuser la demande' });
  if (!r) return;
  await rpc('traiter_demande', { p_id: d.id, p_action: 'refuser', p: null, p_motif: r.texte });
  toast('Demande refusée', 'ok'); await refresh();
};
