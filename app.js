// ACE Taxi — démarrage : connexion, routage par rôle, navigation, notifications, temps réel.
import { esc, $, actions, forms, toast, showError, openModal, closeAllModals } from './lib.js';
import { sb, S, hooks, rpc, loadProfile, refresh, isPatron, friendly, startRealtime, stopRealtime, myUnread, pendingDemandes } from './data.js';
import * as shared from './shared.js';
import * as patron from './patron.js';
import * as transp from './transporteur.js';

const cfg = window.ACE_CONFIG || {};
const app = $('#app');
const emailFor = (id) => (id.includes('@') ? id : cfg.EMAIL_TEMPLATE.replace('{id}', id));
const normId = (v) => v.trim().toLowerCase();

// ---------- écrans simples ----------
function screen(html) { closeAllModals(); app.innerHTML = `<div class="login-wrap"><div class="login-logo"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" stroke-width="2"><path d="M5 17h14M6 17l1.5-6h9L18 17M7 17v2m10-2v2M9 11l1-3h4l1 3"/></svg></div>${html}</div>`; }
const pwdField = (name, label, auto) => `<div class="field"><label>${label}</label><div class="pwd-row"><input type="password" name="${name}" required autocomplete="${auto}" ${name !== 'password' ? 'minlength="8"' : ''}><button type="button" class="btn btn-sm" data-act="toggle-pwd" aria-label="Afficher ou masquer le mot de passe">👁</button></div></div>`;
actions['toggle-pwd'] = (el) => { const i = el.closest('.pwd-row').querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; };

function showConfigError() {
  screen(`<div class="login-title">ACE Taxi</div><div class="warn" style="max-width:420px">L'application n'est pas encore reliée à sa base de données : les réglages du fichier <b>config.js</b> n'ont pas été renseignés. Suivez le guide d'installation.</div>`);
}
function showLogin(msg = '') {
  stopRealtime();
  screen(`<div class="login-title">${esc(S.params.nom)}</div><div class="login-sub">Connectez-vous pour continuer</div>
    <form data-form="login" style="width:100%;max-width:360px" novalidate>
      ${msg ? `<div class="warn" role="alert">${esc(msg)}</div>` : ''}
      <div class="field"><label>Adresse e-mail</label><input name="identifiant" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></div>
      ${pwdField('password', 'Mot de passe', 'current-password')}
      <div id="login-err" class="err" role="alert"></div>
      <button class="btn btn-accent btn-block">Se connecter</button>
      <div style="text-align:center;margin-top:14px"><button type="button" class="link-btn" data-act="forgot">Mot de passe oublié ?</button></div>
    </form>`);
}
forms.login = async (f) => {
  const id = normId(f.identifiant.value); const err = $('#login-err');
  err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: emailFor(id), password: f.password.value });
  if (error) {
    err.textContent = /Invalid login|credentials/i.test(error.message) ? 'E-mail ou mot de passe incorrect.' : /banned|disabled/i.test(error.message) ? 'Ce compte est désactivé. Contactez le patron.' : friendly(error);
    return;
  }
  await startSession();
};
actions.forgot = () => {
  openModal({ title: 'Mot de passe oublié', html: `<p style="margin-bottom:12px">Saisissez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
    <form data-form="forgot"><div class="field"><label>Adresse e-mail</label><input type="email" name="email" required autocomplete="email"></div><div class="modal-actions"><button type="button" class="btn" data-act="close-modal">Fermer</button><button class="btn btn-accent">Envoyer le lien</button></div></form>` });
};
forms.forgot = async (f) => {
  const { error } = await sb.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: location.origin + '/' });
  if (error) throw new Error(friendly(error));
  closeAllModals(); toast('Si ce compte existe, un e-mail vient d\'être envoyé.', 'ok');
};

// Nouveau mot de passe (première connexion ou lien de réinitialisation)
function showNewPassword(reason) {
  screen(`<div class="login-title">Nouveau mot de passe</div><div class="login-sub">${reason === 'recovery' ? 'Choisissez votre nouveau mot de passe' : 'Pour votre sécurité, choisissez votre mot de passe personnel'}</div>
    <form data-form="newpwd" style="width:100%;max-width:360px">
      ${pwdField('nw', 'Nouveau mot de passe', 'new-password')}${pwdField('cf', 'Confirmer', 'new-password')}
      <div class="hint" style="margin-bottom:12px">8 caractères minimum.</div>
      <button class="btn btn-accent btn-block">Enregistrer et continuer</button>
      <div style="text-align:center;margin-top:14px"><button type="button" class="link-btn" data-act="logout">Se déconnecter</button></div>
    </form>`);
}
forms.newpwd = async (f) => {
  if (f.nw.value.length < 8) throw new Error('8 caractères minimum');
  if (f.nw.value !== f.cf.value) throw new Error('La confirmation ne correspond pas');
  const { error } = await sb.auth.updateUser({ password: f.nw.value });
  if (error) throw new Error(/different from the old/i.test(error.message) ? 'Choisissez un mot de passe différent de l\'ancien.' : friendly(error));
  await rpc('mdp_change_fait').catch(() => {});
  history.replaceState(null, '', location.pathname);
  await startSession(true);
};

// ---------- session ----------
let started = false;
async function startSession(skipForce = false) {
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();
  S.user = data.session.user;
  try { await loadProfile(); } catch (e) { return showLogin(friendly(e)); }
  if (!S.profile || !S.profile.actif) { const m = S.profile ? 'Ce compte est désactivé. Contactez le patron.' : 'Ce compte n\'est pas configuré. Contactez le patron.'; await sb.auth.signOut(); S.user = S.profile = null; return showLogin(m); }
  if (S.profile.must_change_password && !skipForce) return showNewPassword('first');
  S.tab = S.tab || tabsFor()[0][0];
  app.innerHTML = '<div class="login-wrap"><div class="spinner">Chargement…</div></div>';
  try { await refresh(); } catch (e) { return loadError(e); }
  started = true;
  buildShell(); render();
  startRealtime(onNewNotif);
  shared.syncPush();
  handleUrl(location.search);
  shared.pushStatus().then(pushBanner);
}
function loadError(e) {
  screen(`<div class="login-title">Chargement impossible</div><div class="warn" style="max-width:420px">${esc(friendly(e))}</div><div class="btn-row"><button class="btn btn-accent" data-act="retry">Réessayer</button><button class="btn" data-act="logout">Se déconnecter</button></div>`);
}
actions.retry = () => startSession();
actions.logout = async () => {
  stopRealtime(); started = false;
  try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = reg && (await reg.pushManager.getSubscription()); if (sub) await rpc('unregister_push', { p_endpoint: sub.endpoint }).catch(() => {}); } catch (e) { /* ignore */ }
  await sb.auth.signOut();
  Object.assign(S, { user: null, profile: null, trajets: [], notifs: [], clients: [], vehicules: [], profiles: [], tab: null, allLoaded: false });
  history.replaceState(null, '', location.pathname);
  showLogin();
};

// ---------- onglets ----------
function tabsFor() {
  return isPatron()
    ? [['dashboard', 'Tableau de bord'], ['trajets', 'Trajets'], ['planning', 'Planning'], ['demandes', 'Demandes'], ['transporteurs', 'Transporteurs'], ['clients', 'Clients'], ['vehicules', 'Véhicules'], ['notifications', 'Notifications'], ['parametres', 'Paramètres']]
    : [['planning', 'Mon planning'], ['trajets', 'Mes trajets'], ['demandes', 'Mes demandes'], ['notifications', 'Mes notifications'], ['parametres', 'Mes paramètres']];
}
function viewFor(tab) {
  if (tab === 'notifications') return shared.viewNotifications();
  if (tab === 'parametres') return shared.viewSettings();
  if (isPatron()) return { dashboard: patron.viewDashboard, trajets: patron.viewTrajets, planning: patron.viewPlanning, transporteurs: patron.viewTransporteurs, clients: patron.viewClients, vehicules: patron.viewVehicules, demandes: patron.viewDemandes }[tab]();
  return { planning: transp.viewPlanning, trajets: transp.viewHistory, demandes: transp.viewDemandes }[tab]();
}
function buildShell() {
  const p = S.profile;
  app.innerHTML = `<div class="topbar"><div><div class="brand">${esc(S.params.nom)}</div><span class="badge ${isPatron() ? '' : 'green'}">${isPatron() ? 'Patron' : 'Transporteur'} · ${esc(((p.prenom || '') + ' ' + (p.nom || '')).trim() || p.identifiant)}</span></div>
    <div class="top-right"><button class="icon-btn" data-act="goto-notifs" aria-label="Notifications">🔔<span class="bell-count hide" id="bell-count"></span></button></div></div>
    <nav class="tabs" role="tablist">${tabsFor().map(([k, l]) => `<button class="tab" role="tab" data-act="tab" data-tab="${k}">${esc(l)}<span class="dot hide" data-dot="${k}"></span></button>`).join('')}</nav>
    <div id="banner"></div><div class="sync-bar"><span class="sdot ok" id="sdot"></span><span id="sync-txt"></span><button class="link-btn" style="margin-left:auto" data-act="sync">Actualiser</button></div>
    <main id="view" style="padding:14px;max-width:1100px;margin:0 auto"></main>`;
}
actions.tab = (el) => setTab(el.dataset.tab);
actions['goto-notifs'] = () => setTab('notifications');
actions.sync = async () => { try { await refresh(); toast('À jour', 'ok'); } catch (e) { showError(e); } };
function setTab(t) { S.tab = t; render(); window.scrollTo(0, 0); }
hooks.goto = setTab;

function render() {
  if (!started) return;
  const v = $('#view'); if (!v) return;
  if (!tabsFor().some(([k]) => k === S.tab)) S.tab = tabsFor()[0][0];
  const y = window.scrollY;
  try { v.innerHTML = viewFor(S.tab); } catch (e) { console.error(e); v.innerHTML = `<div class="warn">Erreur d'affichage : ${esc(e.message)}</div>`; }
  document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.tab === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  if (S.tab === 'parametres') shared.postSettings();
  window.scrollTo(0, y);
  updateBadge();
}
hooks.render = render;
function updateBadge() {
  const n = myUnread().length;
  const bc = $('#bell-count'); if (bc) { bc.textContent = n > 99 ? '99+' : n; bc.classList.toggle('hide', !n); }
  const d = document.querySelector('[data-dot="notifications"]'); if (d) { d.textContent = n || ''; d.classList.toggle('hide', !n); }
  const dd = document.querySelector('[data-dot="demandes"]'); if (dd) { const k = isPatron() ? pendingDemandes().length : 0; dd.textContent = k || ''; dd.classList.toggle('hide', !k); }
  document.title = (n ? `(${n}) ` : '') + S.params.nom;
  const t = $('#sync-txt'); if (t && S.syncedAt) t.textContent = 'Mis à jour à ' + S.syncedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sd = $('#sdot'); if (sd) sd.className = 'sdot ok';
  if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}
hooks.badge = updateBadge;

// ---------- notifications entrantes / liens profonds ----------
function onNewNotif(n) { toast(`🔔 ${n.titre}`, 'ok'); }
function handleUrl(search) {
  const q = new URLSearchParams(search); const tid = q.get('trajet'); const nid = q.get('notif');
  if (!tid && !nid) return;
  history.replaceState(null, '', location.pathname);
  (async () => {
    const n = nid ? S.notifs.find((x) => x.id === nid) : null;
    if (n && !n.read_at && n.user_id === S.user.id) rpc('lire_notifications', { p_ids: [n.id] }).then(refresh).catch(() => {});
    if (n && n.type === 'demande' && isPatron()) return setTab('demandes');
    if (tid) await shared.openFiche(tid, { notif: n });
    else setTab('notifications');
  })().catch(showError);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async (e) => {
    if (!e.data || e.data.type !== 'open-url' || !started) return;
    try { await refresh(); } catch (err) { /* hors ligne */ }
    handleUrl(new URL(e.data.url, location.origin).search);
  });
}

// ---------- bandeau d'activation des notifications ----------
function pushBanner(st) {
  const b = $('#banner'); if (!b) return;
  if (!cfg.PUSH) { b.innerHTML = ''; return; }
  let dismissed = false; try { dismissed = sessionStorage.getItem('ace-push-dismiss') === '1'; } catch (e) { /* ignore */ }
  if (dismissed || st === 'on' || st === 'unsupported') { b.innerHTML = ''; return; }
  b.innerHTML = `<div class="banner"><span>${st === 'ios-install' ? '🔔 Pour recevoir les notifications sur iPhone : ajoutez l\'application à l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil).' : st === 'denied' ? '🔔 Notifications bloquées dans le navigateur.' : '🔔 Activez les notifications pour être prévenu même application fermée.'}</span>
    <span class="btn-row">${st === 'off' ? '<button class="btn btn-accent btn-sm" data-act="banner-on">Activer</button>' : ''}<button class="btn btn-sm" data-act="banner-off">Plus tard</button></span></div>`;
}
actions['banner-on'] = async () => { await shared.enablePush(); toast('Notifications activées', 'ok'); pushBanner('on'); if (S.tab === 'parametres') shared.postSettings(); };
actions['banner-off'] = () => { try { sessionStorage.setItem('ace-push-dismiss', '1'); } catch (e) { /* ignore */ } $('#banner').innerHTML = ''; };

// ---------- démarrage ----------
async function boot() {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY || /__SUPABASE/.test(cfg.SUPABASE_URL + cfg.SUPABASE_KEY)) return showConfigError();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  const recovery = /type=recovery/.test(location.hash + location.search);
  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === 'PASSWORD_RECOVERY') showNewPassword('recovery');
    else if (evt === 'SIGNED_OUT' && started) { started = false; showLogin('Session terminée, reconnectez-vous.'); }
  });
  if (recovery) { await new Promise((r) => setTimeout(r, 600)); const { data } = await sb.auth.getSession(); if (data.session) return showNewPassword('recovery'); }
  const { data } = await sb.auth.getSession();
  if (data.session) await startSession(); else showLogin();
}
// rafraîchissement : retour au premier plan, reconnexion réseau, et toutes les 60 s (retards, secours du temps réel)
document.addEventListener('visibilitychange', () => { if (started && document.visibilityState === 'visible') refresh().catch(() => {}); });
window.addEventListener('online', () => { if (started) refresh().catch(() => {}); });
window.addEventListener('offline', () => { const sd = $('#sdot'); if (sd) sd.className = 'sdot err'; const t = $('#sync-txt'); if (t) t.textContent = 'Hors connexion'; });
setInterval(() => { if (started && document.visibilityState === 'visible') refresh().catch(() => { const sd = $('#sdot'); if (sd) sd.className = 'sdot err'; }); }, 60000);
boot().catch((e) => { console.error(e); loadError(e); });
