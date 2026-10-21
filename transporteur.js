// Écrans du transporteur : Mon planning (aujourd'hui / à venir) et Mes trajets (historique).
import { esc, actions, changes, todayISO, addDays, fmtDate, fmtDay, hhmm } from './lib.js';
import { S, hooks, cliName as _cn, legsOf, nextLeg, isLate, firstTime, loadAllHistory } from './data.js';
import { trajetCard } from './shared.js';

export const UI = { hist: 'mois', histQ: '' };
const byTime = (a, b) => (a.date + firstTime(a)).localeCompare(b.date + firstTime(b));
const mine = () => S.trajets.filter((t) => t.transporteur_id === S.user.id);

export function viewPlanning() {
  const today = todayISO(); const all = mine();
  const open = (t) => t.statut === 'en_attente' || t.statut === 'en_cours';
  const todayList = all.filter((t) => t.date === today && t.statut !== 'annule').sort(byTime);
  const overdue = all.filter((t) => t.date < today && open(t)).sort(byTime);
  const upcoming = all.filter((t) => t.date > today && t.date <= addDays(today, 14) && t.statut !== 'annule').sort(byTime);
  const nextId = (todayList.find((t) => open(t)) || {}).id;
  const todo = todayList.filter(open).length;
  const parDate = {}; upcoming.forEach((t) => { (parDate[t.date] ||= []).push(t); });
  return `<div class="muted" style="margin-bottom:8px">${fmtDate(today)} · ${todo ? `${todo} trajet${todo > 1 ? 's' : ''} à faire` : 'rien à faire pour le moment'}</div>
    ${overdue.length ? `<div class="alert">⚠ ${overdue.length} trajet${overdue.length > 1 ? 's' : ''} d'un jour précédent non terminé${overdue.length > 1 ? 's' : ''} : contactez le patron.</div>${overdue.map((t) => trajetCard(t, { who: false, steps: true })).join('')}` : ''}
    <h2 class="sec">Aujourd'hui</h2>
    ${todayList.length ? todayList.map((t) => trajetCard(t, { who: false, steps: true, highlight: t.id === nextId })).join('') : '<div class="empty">Aucun trajet aujourd\'hui</div>'}
    ${Object.keys(parDate).length ? '<h2 class="sec">À venir (14 jours)</h2>' + Object.keys(parDate).sort().map((d) => `<div class="muted small" style="margin:10px 0 4px">${fmtDate(d)}</div>${parDate[d].map((t) => trajetCard(t, { who: false, steps: true })).join('')}`).join('') : ''}`;
}

export function viewHistory() {
  const today = todayISO(); const h = UI.hist; const q = UI.histQ.trim().toLowerCase();
  const from = h === 'semaine' ? addDays(today, -7) : h === 'mois' ? addDays(today, -31) : null;
  const list = mine().filter((t) => t.date <= today && (!from || t.date >= from)).sort((a, b) => byTime(b, a));
  const rad = (v, l) => `<label><input type="radio" name="h" value="${v}" data-change="hist" ${h === v ? 'checked' : ''}>${l}</label>`;
  return `<div class="toolbar"><div class="seg" style="margin:0">${rad('semaine', '7 jours')}${rad('mois', '31 jours')}${rad('tout', 'Tout')}</div></div>
    <div class="muted small" style="margin:6px 0">${list.length} trajet${list.length > 1 ? 's' : ''}</div>
    ${list.length ? list.map((t) => trajetCard(t, { who: false })).join('') : '<div class="empty">Aucun trajet sur cette période</div>'}
    ${h === 'tout' && !S.allLoaded ? '<button class="btn btn-block" data-act="load-all-t">Charger tout l\'historique</button>' : ''}`;
}
changes.hist = (el) => { UI.hist = el.value; hooks.render(); };
actions['load-all-t'] = () => loadAllHistory();

export function viewDemandes() {
  const list = S.demandes.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const tag = (d) => (d.statut === 'en_attente' ? '<span class="tag st-warn">⏳ En attente du patron</span>' : d.statut === 'acceptee' ? '<span class="tag st-done">✓ Acceptée</span>' : '<span class="tag st-cancel">✕ Refusée</span>');
  return `<div class="muted" style="margin-bottom:8px">Pour proposer un transport, ouvrez un de vos trajets puis touchez « Proposer un autre transport ».</div>
    ${list.length ? list.map((d) => `<div class="tcard"><div class="tcard-head"><div><div class="tcard-title">${esc(_cn(d.client_id))} · ${fmtDate(d.date)}</div><div class="tcard-sub">Demande n° ${d.numero} · ${hhmm(d.aller.heure)} · ${esc(d.aller.depart)} → ${esc(d.aller.arrivee)}</div></div>${tag(d)}</div>
      ${d.retour ? `<div class="route"><b>Retour ${hhmm(d.retour.heure)}</b> ${esc(d.retour.depart)} → ${esc(d.retour.arrivee)}</div>` : ''}
      ${d.motif_refus ? `<div class="route">Motif : ${esc(d.motif_refus)}</div>` : ''}</div>`).join('') : '<div class="empty">Aucune demande envoyée</div>'}`;
}
