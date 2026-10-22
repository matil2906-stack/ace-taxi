// Éléments communs au patron et aux transporteurs : cartes de trajet, fiche, étapes,
// notifications, paramètres du compte, notifications push.
import { esc, $, actions, forms, changes, toast, openModal, confirmDialog, askText, fmtDate, fmtTime, fmtDateTime, hhmm, telHref, tag, T_STATUT, E_STATUT, NOTIF_ICON, PROBLEMES, toLocalInput } from './lib.js';
import { sb, S, rpc, hooks, refresh, isPatron, cliName, cliOf, profName, profOf, vehName, transporteurs, legsOf, isLate, delayMin, changedFor, loadProfile, friendly, myUnread } from './data.js';

export const UI = { notifScope: 'mine' };
const cfg = window.ACE_CONFIG || {};

// ---------- carte de trajet ----------
// Présentation claire d'un sens du trajet : heure de récupération, où récupérer, où déposer
export function planHtml(l, title = '') {
  return `<div class="plan">${title ? `<div class="plan-title">${esc(title)}</div>` : ''}
    <div class="plan-row"><span class="pi">🕘</span><div><small>Heure de récupération</small><b>${hhmm(l.heure_prevue)}</b></div></div>
    <div class="plan-row"><span class="pi">📍</span><div><small>Récupérer à</small><b>${esc(l.adresse_depart)}</b></div></div>
    <div class="plan-row"><span class="pi">🏁</span><div><small>Déposer à</small><b>${esc(l.adresse_arrivee)}</b></div></div>
  </div>`;
}

export function trajetCard(t, { who = true, steps = false, highlight = false } = {}) {
  const legs = legsOf(t); const a = legs[0] || {}; const r = legs[1];
  const late = isLate(t); const un = !t.transporteur_id && t.statut !== 'annule';
  const cls = (t.statut === 'termine' ? ' done' : t.statut === 'annule' ? ' cancel' : '') + (highlight ? ' next' : '');
  const trans = t.transporteur_id ? profName(t.transporteur_id) || 'Transporteur' : 'Non attribué';
  const veh = vehName(t.vehicule_id);
  return `<div class="tcard${cls}" data-act="open-trajet" data-id="${esc(t.id)}">
    ${steps && changedFor(t.id) ? '<div class="changed">✏️ Ce trajet a été modifié : touchez pour voir le détail</div>' : ''}
    <div class="tcard-head">
      <div><div class="tcard-title">${hhmm(a.heure_prevue)} · ${esc(cliName(t.client_id))}</div>
      <div class="tcard-sub">${fmtDate(t.date)} · n° ${t.numero}${who ? ' · ' + esc(trans) : ''}${veh ? ' · 🚗 ' + esc(veh) : ''}</div></div>
      ${tag(T_STATUT, t.statut)}
    </div>
    ${planHtml(a, r ? 'ALLER' : '')}
    ${r ? planHtml(r, 'RETOUR') : ''}
    <div class="tags">
      ${r ? '<span class="tag st-info">🔄 Aller-retour</span>' : ''}
      ${late ? '<span class="tag st-warn">⏰ En retard</span>' : ''}
      ${un && who ? '<span class="tag st-warn">⚠ Non attribué</span>' : ''}
    </div>
    ${steps ? stepsHtml(t) : ''}
  </div>`;
}

// ---------- étapes (boutons du transporteur) ----------
export function stepsHtml(t, { problem = true } = {}) {
  const legs = legsOf(t); const isAR = legs.length > 1; const cli = cliName(t.client_id);
  const open = t.statut === 'en_attente' || t.statut === 'en_cours';
  const mine = !isPatron() && t.transporteur_id === S.user.id;
  const btn = (l, action, label, cls) => `<button type="button" class="btn ${cls}" data-act="step" data-etape="${esc(l.id)}" data-action="${action}" data-label="${esc(label)}" data-client="${esc(cli)}">${esc(label)}</button>`;
  const html = legs.map((l) => {
    const prefix = isAR ? (l.sens === 'aller' ? 'ALLER' : 'RETOUR') + ' — ' : '';
    const canStart = l.sens === 'aller' || legs[0].statut === 'depose';
    let b = '';
    if (mine && open) {
      if (l.statut === 'en_attente' && canStart) b = btn(l, 'pris_en_charge', prefix + (l.sens === 'retour' ? 'Personne reprise en charge' : 'Personne prise en charge'), 'btn-orange');
      else if (l.statut === 'pris_en_charge') b = btn(l, 'depose', prefix + 'Personne déposée', 'btn-green');
    }
    return `<div class="leg ${l.statut}" data-stop>
      <div class="leg-head"><span>${isAR ? (l.sens === 'aller' ? 'ALLER' : 'RETOUR') : 'TRAJET'}</span>${tag(E_STATUT, l.statut)}</div>
      ${planHtml(l)}
      ${l.infos ? `<div class="route">ℹ️ ${esc(l.infos)}</div>` : ''}
      ${l.pris_en_charge_at || l.depose_at ? `<div class="times"><span>Prise en charge : ${fmtTime(l.pris_en_charge_at)}</span><span>Dépôt : ${fmtTime(l.depose_at)}</span></div>` : ''}
      ${b}
    </div>`;
  }).join('');
  const pb = mine && open ? `<button type="button" class="btn btn-sm btn-block" style="margin-top:10px" data-act="probleme" data-id="${esc(t.id)}">⚠ Signaler un problème</button>` : '';
  const cancelled = t.statut === 'annule' ? '<div class="changed" style="margin-top:8px;border-color:var(--red);color:var(--red)">✕ Trajet annulé</div>' : '';
  return html + pb + cancelled;
}

actions['open-trajet'] = (el) => openFiche(el.dataset.id);
// ---------- SMS : ouvre l'application Messages du téléphone, texte déjà écrit (il reste à appuyer sur « Envoyer ») ----------
const isApple = /iphone|ipad|ipod/i.test(navigator.userAgent);
export const smsHref = (phones, body) => `sms:${[].concat(phones).map((p) => String(p).replace(/[^\d+]/g, '')).filter(Boolean).join(',')}${isApple ? '&' : '?'}body=${encodeURIComponent(body)}`;
const patronPhones = () => [S.params.telephone].filter((x) => x && String(x).trim());
function offerSms(body) {
  const phone = patronPhones(); if (!phone.length || isPatron()) return;
  openModal({ title: 'Prévenir le patron par SMS ?', html: `<p style="margin-bottom:10px">Le patron est déjà prévenu par notification. Vous pouvez aussi lui envoyer ce SMS (sur son numéro) :</p>
    <div class="panel" style="padding:12px;margin-bottom:12px">« ${esc(body)} »</div>
    <a class="btn btn-blue btn-block" href="${esc(smsHref(phone, body))}" data-sms>💬 Ouvrir le SMS</a>
    <button type="button" class="btn btn-block" style="margin-top:8px" data-act="close-modal">Plus tard</button>` });
}
const nowHM = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
actions.step = async (el) => {
  const { etape, action, label, client } = el.dataset;
  if (!(await confirmDialog(`${label}\nClient : ${client}`, { ok: 'Oui, valider', title: 'Valider cette étape ?' }))) return;
  el.disabled = true;
  try { await rpc('etape_trajet', { p_etape: etape, p_action: action }); toast('Étape enregistrée', 'ok'); }
  finally { await refresh(); }
  const sens = /^RETOUR/.test(label) ? ' (retour)' : /^ALLER/.test(label) ? ' (aller)' : '';
  offerSms(`${S.profile.prenom} a ${action === 'pris_en_charge' ? 'pris en charge' : 'déposé'} ${client}${sens} à ${nowHM()}.`);
};
actions.probleme = async (el) => {
  const id = el.dataset.id;
  const r = await askText({
    title: 'Signaler un problème', label: 'Commentaire (facultatif)', required: false, ok: 'Envoyer au patron',
    extra: `<div class="radio-list">${PROBLEMES.map(([v, l], i) => `<label><input type="radio" name="type" value="${v}" ${i === 0 ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`,
  });
  if (!r) return;
  await rpc('signaler_probleme', { p_trajet: id, p_type: r.form.type.value, p_commentaire: r.texte });
  toast('Le patron a été prévenu', 'ok'); await refresh();
  const t = S.trajets.find((x) => x.id === id); const lbl = (PROBLEMES.find((p) => p[0] === r.form.type.value) || [0, ''])[1];
  offerSms(`${S.profile.prenom} signale un problème : ${lbl}${t ? ' (client ' + cliName(t.client_id) + ')' : ''}.${r.texte ? ' ' + r.texte : ''}`);
};

// ---------- fiche détaillée d'un trajet ----------
let ficheApi = null; let ficheId = null; let ficheNotif = null;
export async function openFiche(id, { notif = null } = {}) {
  if (ficheApi) ficheApi.close();
  ficheId = id; ficheNotif = notif;
  ficheApi = openModal({ title: 'Trajet', size: 'lg', html: '<div class="spinner">Chargement…</div>', onClose: () => { ficheApi = null; ficheId = null; ficheNotif = null; } });
  await renderFiche();
}
const refreshFiche = () => (ficheId ? renderFiche() : null);
hooks.refreshFiche = refreshFiche;

async function renderFiche() {
  if (!ficheApi) return;
  const id = ficheId;
  let t = S.trajets.find((x) => x.id === id);
  if (!t) {
    const { data } = await sb.from('trajets').select('*, trajet_etapes(*)').eq('id', id).maybeSingle();
    t = data || null;
  }
  if (!ficheApi || ficheId !== id) return;
  if (!t) {
    const n = ficheNotif || S.notifs.find((x) => x.trajet_id === id);
    ficheApi.setTitle('Trajet');
    ficheApi.setHtml(`<div class="warn">Ce trajet n'existe pas, ou il ne vous est plus attribué.</div>${n ? `<div class="panel" style="padding:12px"><div class="row-title">${esc(n.titre)}</div><div class="row-sub" style="white-space:pre-line">${esc(n.corps)}</div></div>` : ''}`);
    return;
  }
  const { data: events } = await sb.from('trajet_evenements').select('*').eq('trajet_id', id).order('created_at').order('id');
  if (!ficheApi || ficheId !== id) return;
  ficheApi.setTitle(`Trajet n° ${t.numero}`);
  ficheApi.setHtml(ficheHtml(t, events || []));
}

const CH_LABEL = { date: 'Date', client: 'Client', vehicule: 'Véhicule', commentaires: 'Instructions', type: 'Type', heure_aller: 'Heure de l\'aller', depart_aller: 'Départ (aller)', arrivee_aller: 'Destination (aller)', infos_aller: 'Infos (aller)', heure_retour: 'Heure du retour', depart_retour: 'Départ (retour)', arrivee_retour: 'Destination (retour)', infos_retour: 'Infos (retour)' };
const fmtVal = (champ, v) => (v == null || v === '' ? '—' : /^heure/.test(champ) ? hhmm(v) : champ === 'date' ? fmtDate(v) : champ === 'type' ? (v === 'aller_retour' ? 'Aller-retour' : 'Aller simple') : String(v));
function eventHtml(ev) {
  const d = ev.details || {}; let label = ''; let extra = '';
  const sens = d.sens === 'retour' ? ' (retour)' : '';
  switch (ev.type) {
    case 'creation': label = 'Trajet créé'; break;
    case 'modification': label = 'Trajet modifié'; extra = (d.changements || []).map((c) => `<div class="chg">${esc(CH_LABEL[c.champ] || c.champ)} : <s>${esc(fmtVal(c.champ, c.ancien))}</s> → <b>${esc(fmtVal(c.champ, c.nouveau))}</b></div>`).join(''); break;
    case 'annulation': label = 'Trajet annulé'; extra = d.motif ? `<div class="chg">Motif : ${esc(d.motif)}</div>` : ''; break;
    case 'attribution': label = `Attribué à ${esc(d.nouveau_nom || '')}`; break;
    case 'reattribution': label = `Réattribué : ${esc(d.ancien_nom || 'aucun')} → ${esc(d.nouveau_nom || 'aucun')}`; break;
    case 'pris_en_charge': label = `Client ${d.sens === 'retour' ? 'repris en charge' : 'pris en charge'}${sens} à ${fmtTime(d.heure)}`; break;
    case 'depose': label = `Client déposé${sens} à ${fmtTime(d.heure)}`; break;
    case 'termine': label = 'Trajet terminé'; break;
    case 'probleme': label = `Problème signalé : ${esc((PROBLEMES.find((p) => p[0] === d.type) || [0, d.type])[1])}`; extra = d.commentaire ? `<div class="chg">${esc(d.commentaire)}</div>` : ''; break;
    case 'demande': label = `Demande de nouveau transport n° ${esc(d.numero)} (${fmtDate(d.date)} à ${hhmm(d.heure)}) envoyée au patron`; break;
    case 'demande_traitee': label = `Demande n° ${esc(d.numero)} : ${d.resultat === 'acceptee' ? 'acceptée (trajet n° ' + esc(d.trajet_numero) + ')' : 'refusée'}`; extra = d.motif ? `<div class="chg">Motif : ${esc(d.motif)}</div>` : ''; break;
    case 'correction': label = `Heure réelle corrigée${sens} (${d.champ === 'depose_at' ? 'dépôt' : 'prise en charge'})`; extra = `<div class="chg"><s>${fmtDateTime(d.ancien)}</s> → <b>${fmtDateTime(d.nouveau)}</b> · Motif : ${esc(d.motif)}</div>`; break;
    default: label = esc(ev.type);
  }
  return `<li><div class="when">${fmtDateTime(ev.created_at)} · ${esc(ev.user_nom || 'Système')}</div><div>${label}</div>${extra}</li>`;
}

export function payloadOf(t, over = {}) {
  const legs = legsOf(t); const a = legs[0]; const r = legs[1];
  const leg = (l) => ({ heure: hhmm(l.heure_prevue), depart: l.adresse_depart, arrivee: l.adresse_arrivee, infos: l.infos || '' });
  const p = { type: t.type, date: t.date, client_id: t.client_id, transporteur_id: t.transporteur_id, vehicule_id: t.vehicule_id, commentaires: t.commentaires || '', aller: leg(a) };
  if (r) p.retour = leg(r);
  return { ...p, ...over };
}

const trPhones = (p) => (p ? [['travail', p.telephone], ['perso', p.telephone_perso]].filter((x) => x[1] && String(x[1]).trim()).map((x) => ({ lbl: x[0], num: x[1] })) : []);
function smsTrajet(t) {
  const [a, r] = legsOf(t);
  return `ACE Taxi - Trajet n°${t.numero} : ${cliName(t.client_id)} le ${fmtDate(t.date)} à ${hhmm(a.heure_prevue)}, de ${a.adresse_depart} à ${a.adresse_arrivee}.`
    + (r ? ` Retour à ${hhmm(r.heure_prevue)}, de ${r.adresse_depart} à ${r.adresse_arrivee}.` : '') + (t.commentaires ? ` Instructions : ${t.commentaires}` : '');
}
function ficheHtml(t, events) {
  const patron = isPatron(); const cli = cliOf(t.client_id); const tr = profOf(t.transporteur_id);
  const legs = legsOf(t); const isAR = legs.length > 1; const late = isLate(t); const open = t.statut === 'en_attente' || t.statut === 'en_cours';
  const call = (p, role, name) => (p ? `<a class="btn btn-blue btn-sm" href="${telHref(p)}">📞 Appeler ${role}${name ? ' : ' + esc(name) : ''}</a>` : '<span class="muted small">Pas de numéro enregistré</span>');
  const legBlocks = legs.map((l) => {
    const dl = delayMin(t, l);
    const fix = (champ, label, val) => (patron && val ? ` <button class="btn btn-sm" type="button" data-act="corriger" data-etape="${esc(l.id)}" data-champ="${champ}" data-val="${esc(val)}" aria-label="Corriger ${label}">✎</button>` : '');
    return `<div class="leg ${l.statut}">
      <div class="leg-head"><span>${isAR ? (l.sens === 'aller' ? 'ALLER' : 'RETOUR') : 'TRAJET'} · prévu à ${hhmm(l.heure_prevue)}</span>${tag(E_STATUT, l.statut)}</div>
      <div class="route"><b>${esc(l.adresse_depart)}</b> → <b>${esc(l.adresse_arrivee)}</b></div>
      ${l.infos ? `<div class="route">ℹ️ ${esc(l.infos)}</div>` : ''}
      <div class="times"><span>Prise en charge réelle : ${fmtTime(l.pris_en_charge_at)}${fix('pris_en_charge_at', 'la prise en charge', l.pris_en_charge_at)}</span><span>Dépôt réel : ${fmtTime(l.depose_at)}${fix('depose_at', 'le dépôt', l.depose_at)}</span>${dl != null && dl > S.params.tolerance_retard_min ? `<span class="tag st-warn">⏰ +${dl} min</span>` : ''}</div>
    </div>`;
  }).join('');
  const opts = transporteurs().filter((p) => p.actif || p.id === t.transporteur_id);
  return `
    <div class="tags" style="margin:0 0 12px">${tag(T_STATUT, t.statut)}${isAR ? '<span class="tag st-info">🔄 Aller-retour</span>' : ''}${late ? '<span class="tag st-warn">⏰ En retard</span>' : ''}${!t.transporteur_id && t.statut !== 'annule' ? '<span class="tag st-warn">⚠ Non attribué</span>' : ''}</div>
    ${t.statut === 'annule' ? `<div class="warn">Trajet annulé le ${fmtDateTime(t.annule_le)}.${t.motif_annulation ? ' Motif : ' + esc(t.motif_annulation) : ''}</div>` : ''}
    <dl class="kv">
      <dt>N° du trajet</dt><dd>${t.numero}</dd>
      <dt>Date</dt><dd>${fmtDate(t.date)}</dd>
      <dt>Client</dt><dd>${esc(cliName(t.client_id))}${cli && cli.telephone ? ' · ' + esc(cli.telephone) : ''}${patron && cli && cli.adresse ? `<div class="muted small">Adresse habituelle : ${esc(cli.adresse)}</div>` : ''}</dd>
      ${patron ? `<dt>Transporteur</dt><dd>${t.transporteur_id ? esc(profName(t.transporteur_id)) + (tr && tr.telephone ? ' · ' + esc(tr.telephone) : '') : 'Non attribué'}</dd>` : ''}
      <dt>Véhicule</dt><dd>${esc(vehName(t.vehicule_id)) || '—'}</dd>
      <dt>Instructions</dt><dd>${esc(t.commentaires) || '—'}</dd>
    </dl>
    <div class="btn-row" style="margin:6px 0 14px">
      ${call(cli && cli.telephone, 'le client', cliName(t.client_id))}
      ${patron ? trPhones(tr).map((x) => `<a class="btn btn-blue btn-sm" href="${telHref(x.num)}">📞 Appeler ${esc(tr.prenom || 'le transporteur')}${trPhones(tr).length > 1 ? ' (' + x.lbl + ')' : ''}</a>`).join('') || '<span class="muted small">Pas de numéro pour le transporteur</span>' : ''}
    </div>
    ${patron && open && trPhones(tr).length ? `<div class="btn-row" style="margin:-4px 0 14px"><span class="muted small" style="align-self:center">💬 Envoyer le trajet par SMS à ${esc(tr.prenom || 'lui')} :</span>${trPhones(tr).length > 1 ? `<a class="btn btn-sm" data-sms data-sms-to="both" href="${esc(smsHref(trPhones(tr).map((x) => x.num), smsTrajet(t)))}">Aux deux</a>` : ''}${trPhones(tr).map((x) => `<a class="btn btn-sm" data-sms data-sms-to="${x.lbl}" href="${esc(smsHref(x.num, smsTrajet(t)))}">${trPhones(tr).length > 1 ? (x.lbl === 'travail' ? 'Travail seulement' : 'Perso seulement') : 'Envoyer'}</a>`).join('')}</div>` : ''}
    <h2 class="sec">Étapes</h2>
    ${patron ? legBlocks : stepsHtml(t)}
    ${!patron && t.transporteur_id === S.user.id && t.statut !== 'annule' ? `<button type="button" class="btn btn-blue btn-block" style="margin-top:12px" data-act="new-demande" data-id="${esc(t.id)}">➕ Proposer un autre transport pour ${esc(cliName(t.client_id))}</button>` : ''}
    ${patron && open ? `<div class="btn-row" style="margin-top:14px">
        <button type="button" class="btn btn-accent" data-act="edit-trajet" data-id="${esc(t.id)}">✏️ Modifier le trajet</button>
        <button type="button" class="btn btn-danger" data-act="cancel-trajet" data-id="${esc(t.id)}">Annuler le trajet</button></div>
      <div class="field" style="margin-top:14px"><label>Réattribuer à</label><div class="btn-row"><select id="reassign-select" style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;min-height:44px"><option value="">— Non attribué —</option>${opts.map((p) => `<option value="${esc(p.id)}" ${p.id === t.transporteur_id ? 'selected' : ''}>${esc(profName(p.id))}${p.actif ? '' : ' (désactivé)'}</option>`).join('')}</select><button type="button" class="btn" data-act="reassign" data-id="${esc(t.id)}">Réattribuer</button></div></div>` : ''}
    <h2 class="sec">Historique</h2>
    <ul class="hist">${events.length ? events.map(eventHtml).join('') : '<li class="muted">Aucun événement</li>'}</ul>`;
}

actions['cancel-trajet'] = async (el) => {
  const t = S.trajets.find((x) => x.id === el.dataset.id); if (!t) return;
  const r = await askText({ title: 'Annuler le trajet ?', label: 'Motif (facultatif)', required: false, ok: 'Oui, annuler le trajet', extra: `<p style="margin-bottom:12px">Le trajet n° ${t.numero} (${esc(cliName(t.client_id))}, ${fmtDate(t.date)}) sera marqué « Annulé » et conservé dans l'historique.${t.transporteur_id ? ' Le transporteur sera prévenu.' : ''}</p>` });
  if (!r) return;
  await rpc('annuler_trajet', { p_id: t.id, p_motif: r.texte });
  toast('Trajet annulé', 'ok'); await refresh();
};
actions.reassign = async (el) => {
  const t = S.trajets.find((x) => x.id === el.dataset.id); if (!t) return;
  const val = $('#reassign-select').value || null;
  if (val === (t.transporteur_id || null)) { toast('Ce transporteur est déjà attribué'); return; }
  await rpc('modifier_trajet', { p_id: t.id, p: payloadOf(t, { transporteur_id: val }) });
  toast('Trajet réattribué', 'ok'); await refresh();
};
actions.corriger = async (el) => {
  const champ = el.dataset.champ;
  const r = await askText({ title: 'Corriger une heure réelle', label: 'Motif de la correction (obligatoire)', ok: 'Enregistrer la correction',
    extra: `<div class="field"><label>Nouvelle date et heure</label><input type="datetime-local" name="quand" required value="${toLocalInput(el.dataset.val)}"></div>` });
  if (!r) return;
  await rpc('corriger_etape', { p_etape: el.dataset.etape, p_champ: champ, p_valeur: new Date(r.form.quand.value).toISOString(), p_motif: r.texte });
  toast('Correction enregistrée (tracée dans l\'historique)', 'ok'); await refresh();
};

// ---------- notifications ----------
export function viewNotifications() {
  const patron = isPatron();
  const mine = S.notifs.filter((n) => n.user_id === S.user.id);
  const others = patron ? S.notifs.filter((n) => n.user_id !== S.user.id) : [];
  const list = patron && UI.notifScope === 'others' ? others : mine;
  const unread = mine.filter((n) => !n.read_at).length;
  const item = (n) => `<div class="notif ${!n.read_at && n.user_id === S.user.id ? 'unread' : ''}">
    <div class="ico" aria-hidden="true">${NOTIF_ICON[n.type] || '🔔'}</div>
    <div class="body"><div class="t">${!n.read_at && n.user_id === S.user.id ? '<span class="unread-dot" title="Non lue"></span>' : ''}${esc(n.titre)}${n.user_id !== S.user.id ? ` <span class="muted small">→ ${esc(profName(n.user_id))}</span>` : ''}</div>
      <div class="c">${esc(n.corps)}</div><div class="w">${fmtDateTime(n.created_at)}</div>
      <div class="btn-row" style="margin-top:8px"><button class="btn btn-sm btn-blue" data-act="open-notif" data-id="${esc(n.id)}">Voir les détails</button></div></div></div>`;
  return `<div class="toolbar"><div>${patron ? `<div class="seg" style="margin:0"><label><input type="radio" name="scope" value="mine" data-change="notif-scope" ${UI.notifScope !== 'others' ? 'checked' : ''}>Mes notifications${unread ? ` (${unread})` : ''}</label><label><input type="radio" name="scope" value="others" data-change="notif-scope" ${UI.notifScope === 'others' ? 'checked' : ''}>Envoyées aux transporteurs</label></div>` : `<span class="muted">${unread} non lue${unread > 1 ? 's' : ''}</span>`}</div>
    ${unread && UI.notifScope !== 'others' ? '<button class="btn btn-sm" data-act="read-all">Tout marquer comme lu</button>' : ''}</div>
    <div class="panel">${list.length ? list.map(item).join('') : '<div class="empty">Aucune notification</div>'}</div>`;
}
changes['notif-scope'] = (el) => { UI.notifScope = el.value; hooks.render(); };
actions['read-all'] = async () => { await rpc('lire_notifications', { p_ids: null }); await refresh(); };
actions['open-notif'] = async (el) => {
  const n = S.notifs.find((x) => x.id === el.dataset.id); if (!n) return;
  if (n.user_id === S.user.id && !n.read_at) { await rpc('lire_notifications', { p_ids: [n.id] }); refresh(); }
  if (n.type === 'demande' && isPatron()) { hooks.goto('demandes'); return; }
  if (n.trajet_id) await openFiche(n.trajet_id, { notif: n });
  else openModal({ title: n.titre, html: `<p style="white-space:pre-line">${esc(n.corps)}</p>` });
};

// ---------- paramètres du compte ----------
export function viewSettings() {
  const p = S.profile; const patron = isPatron(); const e = S.params;
  return `<div class="grid2" style="align-items:start">
    <div>
      <h2 class="sec" style="margin-top:0">Mon compte</h2>
      <form class="panel" style="padding:14px" data-form="profil">
        <div class="field"><label>E-mail de connexion</label><input value="${esc(p.identifiant)}" disabled></div>
        <div class="grid2"><div class="field"><label>Prénom</label><input name="prenom" value="${esc(p.prenom)}" required></div><div class="field"><label>Nom</label><input name="nom" value="${esc(p.nom)}" required></div></div>
        <div class="grid2"><div class="field"><label>Téléphone du travail</label><input name="telephone" type="tel" value="${esc(p.telephone)}"></div>
        <div class="field"><label>Téléphone personnel</label><input name="telephone_perso" type="tel" value="${esc(p.telephone_perso)}"></div></div>
        <button class="btn btn-accent btn-block">Enregistrer</button>
      </form>
      <h2 class="sec">Mot de passe</h2>
      <form class="panel" style="padding:14px" data-form="password" autocomplete="off">
        <div class="field"><label>Mot de passe actuel</label><input type="password" name="cur" required autocomplete="current-password"></div>
        <div class="field"><label>Nouveau mot de passe</label><input type="password" name="nw" required minlength="8" autocomplete="new-password"><div class="hint">8 caractères minimum.</div></div>
        <div class="field"><label>Confirmer le nouveau mot de passe</label><input type="password" name="cf" required minlength="8" autocomplete="new-password"></div>
        <button class="btn btn-accent btn-block">Changer le mot de passe</button>
      </form>
    </div>
    <div>
      ${installPanel()}
      <h2 class="sec"${isStandalone() ? ' style="margin-top:0"' : ''}>Notifications sur cet appareil</h2>
      <div class="panel" style="padding:14px" id="push-box"><span class="muted">Vérification…</span></div>
      ${patron ? `<h2 class="sec">Entreprise</h2>
      <form class="panel" style="padding:14px" data-form="entreprise">
        <div class="field"><label>Nom de l'entreprise</label><input name="nom" value="${esc(e.nom)}" required></div>
        <div class="field"><label>Téléphone du patron (reçoit les SMS des transporteurs)</label><input name="telephone" type="tel" value="${esc(e.telephone)}"></div>
        <div class="field"><label>Adresse</label><input name="adresse" value="${esc(e.adresse)}"></div>
        <div class="grid2"><div class="field"><label>Durée d'un trajet (min)</label><input name="duree" type="number" min="5" max="600" value="${e.duree_trajet_min}" required><div class="hint">Sert à repérer les chevauchements.</div></div>
        <div class="field"><label>Tolérance de retard (min)</label><input name="tol" type="number" min="0" max="240" value="${e.tolerance_retard_min}" required></div></div>
        <div class="field"><label>Alerte entretien (jours avant)</label><input name="alerte" type="number" min="1" max="365" value="${e.alerte_entretien_jours}" required></div>
        <button class="btn btn-accent btn-block">Enregistrer</button>
      </form>` : ''}
      <h2 class="sec">Session</h2>
      <button class="btn btn-block" data-act="logout">Se déconnecter</button>
    </div></div>`;
}
export async function postSettings() { await fillPushBox(); }

forms.profil = async (f) => {
  await rpc('maj_mon_profil', { p_prenom: f.prenom.value, p_nom: f.nom.value, p_telephone: f.telephone.value, p_telephone_perso: f.telephone_perso.value });
  await loadProfile(); hooks.badge(); toast('Informations enregistrées', 'ok');
};
const pwdMsg = (e) => (/different from the old/i.test(e.message) ? 'Le nouveau mot de passe doit être différent de l\'ancien.' : /weak|short|at least/i.test(e.message) ? 'Mot de passe trop faible (8 caractères minimum).' : friendly(e));
forms.password = async (f) => {
  const cur = f.cur.value; const nw = f.nw.value; const cf = f.cf.value;
  if (nw.length < 8) throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères');
  if (nw !== cf) throw new Error('La confirmation ne correspond pas au nouveau mot de passe');
  if (nw === cur) throw new Error('Le nouveau mot de passe doit être différent de l\'ancien');
  const r1 = await sb.auth.signInWithPassword({ email: S.user.email, password: cur });
  if (r1.error) throw new Error('Mot de passe actuel incorrect');
  const r2 = await sb.auth.updateUser({ password: nw });
  if (r2.error) throw new Error(pwdMsg(r2.error));
  await rpc('mdp_change_fait'); f.reset(); toast('Mot de passe modifié', 'ok');
};
forms.entreprise = async (f) => {
  const { error } = await sb.from('parametres_entreprise').update({ nom: f.nom.value.trim(), telephone: f.telephone.value.trim() || null, adresse: f.adresse.value.trim() || null, duree_trajet_min: +f.duree.value, tolerance_retard_min: +f.tol.value, alerte_entretien_jours: +f.alerte.value }).eq('id', 1);
  if (error) throw new Error(friendly(error));
  await refresh(); toast('Paramètres enregistrés', 'ok');
};

// ---------- notifications push ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToU8 = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map((c) => c.charCodeAt(0))); };
export async function pushStatus() {
  if (!pushSupported()) return isIOS && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return Notification.permission === 'granted' && sub ? 'on' : 'off';
}
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées : autorisez-les dans les réglages du navigateur');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  await rpc('register_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await rpc('unregister_push', { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}
// Si l'appareil est déjà autorisé, on le rattache silencieusement au compte connecté.
export async function syncPush() {
  try { if ((await pushStatus()) === 'on') await enablePush(); } catch (e) { /* silencieux */ }
}
export async function fillPushBox() {
  const box = $('#push-box'); if (!box) return;
  if (!cfg.PUSH) { box.closest('h2, div')?.previousElementSibling?.remove?.(); box.remove(); return; }
  const st = await pushStatus();
  const msg = {
    on: ['✅ Activées sur cet appareil.', '<button class="btn btn-sm" data-act="push-off">Désactiver</button>'],
    off: ['Recevez les nouveautés même quand l\'application est fermée.', '<button class="btn btn-accent btn-sm" data-act="push-on">Activer les notifications</button>'],
    denied: ['🚫 Bloquées dans le navigateur : autorisez-les dans les réglages du site, puis revenez ici.', ''],
    'ios-install': ['Sur iPhone : touchez « Partager » puis « Sur l\'écran d\'accueil », ouvrez l\'application depuis l\'icône, puis activez les notifications ici.', ''],
    unsupported: ['Les notifications ne sont pas disponibles sur ce navigateur.', ''],
  }[st];
  box.innerHTML = `<p style="margin-bottom:${msg[1] ? 10 : 0}px">${msg[0]}</p>${msg[1]}`;
}
actions['push-on'] = async () => { await enablePush(); toast('Notifications activées', 'ok'); await fillPushBox(); hooks.badge(); };
actions['push-off'] = async () => { await disablePush(); toast('Notifications désactivées'); await fillPushBox(); hooks.badge(); };


// ---------- installer l'application sur l'appareil (bouton « Installer ») ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; document.querySelectorAll('[data-install]').forEach((n) => n.remove()); });
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const installBtn = (cls = 'btn btn-accent btn-sm') => (isStandalone() ? '' : `<button type="button" class="${cls}" data-act="install-app" data-install>📲 Installer l'application</button>`);
function installPanel() {
  if (isStandalone()) return '';
  return `<h2 class="sec" style="margin-top:0">Application sur le téléphone</h2>
    <div class="panel" style="padding:14px;margin-bottom:18px" data-install><p style="margin-bottom:10px">Ajoutez ACE Taxi sur l'écran d'accueil : une icône, comme une vraie application.</p>${installBtn('btn btn-accent')}</div>`;
}
actions['install-app'] = async () => {
  if (deferredInstall) { const d = deferredInstall; deferredInstall = null; d.prompt(); await d.userChoice.catch(() => {}); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openModal({ title: 'Installer l\'application', html: ios
    ? `<ol style="padding-left:18px;line-height:1.7"><li>Ouvrez ce site avec <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l'écran d'accueil »</b>.</li><li>Touchez <b>Ajouter</b>.</li></ol><div class="modal-actions"><button class="btn btn-accent" data-act="close-modal">OK</button></div>`
    : `<ol style="padding-left:18px;line-height:1.7"><li>Touchez les <b>3 points ⋮</b> du navigateur (en haut à droite).</li><li>Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li><li>Confirmez.</li></ol><div class="modal-actions"><button class="btn btn-accent" data-act="close-modal">OK</button></div>` });
};

// ---------- demande de nouveau transport (transporteur → patron) ----------
const demLeg = (k, title, req) => `<fieldset class="fieldset" data-leg="${k}"><legend>${title}</legend>
  <div class="grid2"><div class="field"><label>Heure de prise en charge</label><input type="time" name="${k}_heure" ${req ? 'required' : ''}></div>
  <div class="field"><label>Informations</label><input name="${k}_infos" placeholder="Étage, fauteuil, bagages…"></div></div>
  <div class="field"><label>Adresse de départ</label><input name="${k}_depart" ${req ? 'required' : ''} data-input="${k === 'aller' ? 'dem-sync' : 'dem-touch'}"></div>
  <div class="field"><label>Adresse d'arrivée</label><input name="${k}_arrivee" ${req ? 'required' : ''} data-input="${k === 'aller' ? 'dem-sync' : 'dem-touch'}"></div></fieldset>`;
actions['new-demande'] = (el) => {
  const t = S.trajets.find((x) => x.id === el.dataset.id); if (!t) return;
  const m = openModal({ title: 'Proposer un transport', size: 'lg', sticky: true, html: `<form data-form="demande" data-id="${esc(t.id)}" autocomplete="off">
    <div class="ok-msg" style="margin-bottom:12px">Client : <b>${esc(cliName(t.client_id))}</b>. Ceci n'est pas un trajet : le patron recevra votre demande, la validera et choisira le transporteur et le véhicule.</div>
    <div class="field"><label>Type</label><div class="seg"><label><input type="radio" name="type" value="aller_simple" data-change="dem-type" checked>Aller simple</label><label><input type="radio" name="type" value="aller_retour" data-change="dem-type">Aller-retour</label></div></div>
    <div class="field"><label>Date souhaitée</label><input type="date" name="date" required min="${new Date().toLocaleDateString('sv-SE')}"></div>
    ${demLeg('aller', 'ALLER', true)}
    <div id="dem-retour" class="hide">${demLeg('retour', 'RETOUR', false)}</div>
    <div class="field"><label>Précisions pour le patron</label><textarea name="commentaires" placeholder="Ex. le client préfère le matin, besoin d'un véhicule adapté…"></textarea></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn btn-accent">Envoyer au patron</button></div></form>` });
  m.el.dataset.kind = 'demande';
};
changes['dem-touch'] = (el) => { el.closest('form').dataset.retourTouched = '1'; };
changes['dem-sync'] = (el) => { const f = el.closest('form'); if (f.dataset.retourTouched) return; f.elements.retour_depart.value = f.elements.aller_arrivee.value; f.elements.retour_arrivee.value = f.elements.aller_depart.value; };
changes['dem-type'] = (el) => {
  const f = el.closest('form'); const ar = el.value === 'aller_retour';
  f.querySelector('#dem-retour').classList.toggle('hide', !ar);
  for (const n of ['retour_heure', 'retour_depart', 'retour_arrivee']) f.elements[n].required = ar;
  if (ar && !f.elements.retour_depart.value) { f.elements.retour_depart.value = f.elements.aller_arrivee.value; f.elements.retour_arrivee.value = f.elements.aller_depart.value; }
};
forms.demande = async (f) => {
  const g = (n) => f.elements[n].value.trim(); const ar = f.elements.type.value === 'aller_retour';
  const leg = (k) => ({ heure: g(k + '_heure'), depart: g(k + '_depart'), arrivee: g(k + '_arrivee'), infos: g(k + '_infos') });
  const p = { type: f.elements.type.value, date: g('date'), commentaires: g('commentaires'), aller: leg('aller') };
  if (ar) p.retour = leg('retour');
  await rpc('creer_demande', { p_trajet_source: f.dataset.id, p });
  f.closest('.modal-bg').querySelector('[data-act=close-modal]').click();
  toast('Demande envoyée au patron', 'ok'); await refresh();
};
