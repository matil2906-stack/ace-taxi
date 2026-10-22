// Accès à la base (Supabase), état de l'application et règles métier côté affichage.
// IMPORTANT : la sécurité réelle est dans la base (RLS + fonctions). Ici, on ne fait qu'afficher.
import { todayISO, addDays, parseISO, hhmm } from './lib.js';

const cfg = window.ACE_CONFIG || {};
export const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ace-taxi-auth' },
});

export const S = {
  user: null, profile: null,
  params: { nom: 'ACE Taxi', duree_trajet_min: 60, tolerance_retard_min: 10, alerte_entretien_jours: 30 },
  trajets: [], clients: [], vehicules: [], profiles: [], notifs: [], demandes: [],
  from: addDays(todayISO(), -45), allLoaded: false, tab: null, syncedAt: null,
};
export const hooks = { render() {}, refreshFiche() {}, badge() {} };
export const isPatron = () => S.profile?.role === 'patron';

export function friendly(error) {
  const m = (error && (error.message || error.msg)) || String(error || 'Erreur');
  if (/permission denied|row-level security/i.test(m)) return 'Action non autorisée. (détail : ' + m.slice(0, 160) + ')';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifiez internet et réessayez.';
  if (/JWT expired|invalid.*jwt/i.test(m)) return 'Session expirée, reconnectez-vous.';
  return m;
}
export async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(friendly(error));
  return data;
}
export async function admin(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('admin-users', { body: { action, ...payload } });
  if (error) throw new Error(friendly(error));
  if (!data || data.ok !== true) throw new Error((data && data.error) || 'Opération impossible');
  return data;
}

// ---------- chargement ----------
export async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
  if (error) throw new Error(friendly(error));
  S.profile = data;
  return data;
}

export async function loadAll() {
  const patron = isPatron();
  let tq = sb.from('trajets').select('*, trajet_etapes(*)').order('date').order('numero');
  if (!S.allLoaded && S.from) tq = tq.gte('date', S.from);
  const jobs = [
    tq,
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(300),
    sb.from('parametres_entreprise').select('*').maybeSingle(),
  ];
  if (patron) {
    jobs.push(sb.from('clients').select('*').order('nom'), sb.from('vehicules').select('*').order('marque'), sb.from('profiles').select('*').order('prenom'));
  } else {
    jobs.push(sb.from('clients_visibles').select('*'), sb.from('vehicules_visibles').select('*'));
  }
  jobs.push(sb.from('demandes_transport').select('*').order('created_at', { ascending: false }).limit(300));
  const res = await Promise.all(jobs);
  for (const r of res) if (r.error) throw new Error(friendly(r.error));
  S.trajets = res[0].data || [];
  S.notifs = res[1].data || [];
  if (res[2].data) S.params = { ...S.params, ...res[2].data };
  S.clients = res[3].data || [];
  S.vehicules = res[4].data || [];
  S.profiles = patron ? res[5].data || [] : [S.profile];
  S.demandes = res[res.length - 1].data || [];
  S.syncedAt = new Date();
}
export async function loadAllHistory() { S.allLoaded = true; await refresh(); }

let refreshing = null;
export function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try { await loadAll(); hooks.render(); hooks.refreshFiche(); hooks.badge(); }
    finally { refreshing = null; }
  })();
  return refreshing;
}

// ---------- noms ----------
export const cliName = (id) => { const c = S.clients.find((x) => x.id === id); return c ? `${c.prenom || ''} ${c.nom}`.trim() : 'Client'; };
export const cliOf = (id) => S.clients.find((x) => x.id === id);
export const profName = (id) => { const p = S.profiles.find((x) => x.id === id); return p ? `${p.prenom || ''} ${p.nom || ''}`.trim() || p.identifiant : ''; };
export const profOf = (id) => S.profiles.find((x) => x.id === id);
export const vehOf = (id) => S.vehicules.find((x) => x.id === id);
export const vehName = (id) => { const v = vehOf(id); return v ? `${v.marque} ${v.modele} (${v.plaque})` : ''; };
export const transporteurs = () => S.profiles.filter((p) => p.role === 'transporteur');
export const myUnread = () => S.notifs.filter((n) => n.user_id === S.user.id && !n.read_at);

// ---------- règles métier (affichage) ----------
export const legsOf = (t) => (t.trajet_etapes || []).slice().sort((a, b) => (a.sens === 'aller' ? -1 : 1) - (b.sens === 'aller' ? -1 : 1));
export const legWhen = (date, heure) => { const [h, m] = String(heure).split(':'); const d = parseISO(date); d.setHours(+h, +m, 0, 0); return d; };
export const nextLeg = (t) => {
  const legs = legsOf(t);
  const next = legs.find((l) => l.statut !== 'depose');
  return next || legs[0];
};
export const firstTime = (t) => hhmm((legsOf(t)[0] || {}).heure_prevue);

export function isLate(t, now = new Date()) {
  if (t.statut !== 'en_attente' && t.statut !== 'en_cours') return false;
  const legs = legsOf(t);
  const next = legs.find((l) => l.statut === 'en_attente');
  if (!next) return false;
  if (next.sens === 'retour' && legs[0].statut !== 'depose') return false;
  return now.getTime() > legWhen(t.date, next.heure_prevue).getTime() + S.params.tolerance_retard_min * 60000;
}
export const delayMin = (t, leg) => (leg.pris_en_charge_at ? Math.round((new Date(leg.pris_en_charge_at) - legWhen(t.date, leg.heure_prevue)) / 60000) : null);

// Chevauchements possibles (avertissement seulement, jamais bloquant)
export function conflictsFor(cand, others) {
  const dur = S.params.duree_trajet_min * 60000; const out = [];
  for (const o of others) {
    if (o.id === cand.id || o.statut === 'annule' || o.date !== cand.date) continue;
    for (const kind of ['transporteur', 'vehicule']) {
      const same = kind === 'transporteur' ? cand.transporteur_id && o.transporteur_id === cand.transporteur_id : cand.vehicule_id && o.vehicule_id === cand.vehicule_id;
      if (!same) continue;
      let hit = null;
      for (const cl of cand.legs) for (const ol of o.trajet_etapes || []) {
        const a = legWhen(cand.date, cl.heure).getTime(); const b = legWhen(o.date, ol.heure_prevue).getTime();
        if (a < b + dur && b < a + dur) hit = ol;
      }
      if (hit) out.push({ kind, trajet: o, heure: hhmm(hit.heure_prevue) });
    }
  }
  return out;
}

export function vehicleAlerts(v) {
  const out = []; const today = parseISO(todayISO());
  for (const [champ, label] of [['ct_prochain', 'Contrôle technique'], ['entretien_prochain', 'Entretien']]) {
    if (!v[champ]) continue;
    const days = Math.round((parseISO(v[champ]) - today) / 86400000);
    if (days < 0) out.push({ label, level: 'late', text: `${label} dépassé depuis ${-days} j` });
    else if (days <= S.params.alerte_entretien_jours) out.push({ label, level: 'soon', text: `${label} dans ${days} j` });
  }
  return out;
}

// Le trajet a-t-il une notification non lue importante (modif, attribution, annulation) ?
export const changedFor = (tid) => S.notifs.some((n) => n.trajet_id === tid && n.user_id === S.user.id && !n.read_at && ['modification', 'attribution', 'annulation', 'reattribution'].includes(n.type));

// ---------- temps réel ----------
let channel = null;
export function startRealtime(onNotif) {
  stopRealtime();
  let timer = null;
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 400); };
  channel = sb.channel('ace-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trajets' }, soon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trajet_etapes' }, soon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_transport' }, soon)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => { if (p.new && p.new.user_id === S.user?.id) onNotif(p.new); soon(); })
    .subscribe();
}
export function stopRealtime() { if (channel) { sb.removeChannel(channel); channel = null; } }

export const pendingDemandes = () => S.demandes.filter((x) => x.statut === 'en_attente');
