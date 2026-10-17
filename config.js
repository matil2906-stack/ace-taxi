// Réglages publics de l'application (aucun secret ici : ces valeurs sont visibles par tous).
window.ACE_CONFIG = {
  SUPABASE_URL: "__SUPABASE_URL__",
  SUPABASE_KEY: "__SUPABASE_KEY__",              // clé "publishable" (publique)
  EMAIL_TEMPLATE: "ace-taxi.{id}@example.com",     // doit être identique au réglage EMAIL_TEMPLATE des fonctions serveur
  PUSH: false,                                   // mettre true seulement après avoir installé les notifications automatiques (dossier "optionnel")
  VAPID_PUBLIC_KEY: "BJ6i0DFr5S1sXv6RO8Y9RNYl7igRyymGBmAEgPsHS8mCcaxFal86FnMbfFlg9cecxjM41fpW20InsmMxZI6pne0"                       // clé publique des notifications push
};
