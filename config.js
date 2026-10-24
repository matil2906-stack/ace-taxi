// Réglages publics de l'application (aucun secret ici : ces valeurs sont visibles par tous).
window.ACE_CONFIG = {
  SUPABASE_URL: "https://szwoyvljjwhroppdpvhd.supabase.co",
  SUPABASE_KEY: "sb_publishable_3KxV7Mw12FkCWfwEOXC-TA_jlyUYuNb",              // clé "publishable" (publique)
  EMAIL_TEMPLATE: "ace-taxi.{id}@example.com",     // doit être identique au réglage EMAIL_TEMPLATE des fonctions serveur
  PUSH: true,
  VAPID_PUBLIC_KEY: "BJ6i0DFr5S1sXv6RO8Y9RNYl7igRyymGBmAEgPsHS8mCcaxFal86FnMbfFlg9cecxjM41fpW20InsmMxZI6pne0"                       // clé publique des notifications push
};
