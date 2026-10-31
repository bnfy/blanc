'use strict';
// Exact shipping v1.44.1 messages from copy/messages; locale currently follows the system language.
const blockingCopy = {"en":{"settings.page.heading":"Settings","settings.privacy.title":"Privacy & Security","settings.privacy.blocking.title":"Blocking","settings.privacy.adblockEnabled.label":"Block ads & trackers","settings.privacy.adblockEnabled.hint":"Stops ads and the hidden trackers that follow you from site to site. On by default.","settings.privacy.sitesListedHereLoad":"Sites listed here load with ad-blocking turned off, e.g. for sites that break under it.","settings.privacy.exceptionAdd":"Add","settings.privacy.exceptionList.empty":"No exceptions added.","settings.siteList.remove":"Remove {site}","settings.blockingStatus.ready":"{provider} ready.","settings.blockingStatus.initializing":"{provider} initializing.","settings.blockingStatus.disabled":"{provider} disabled.","settings.blockingStatus.failed":"{provider} could not continue ({error}). Affected requests remain blocked.","settings.privacy.sitePermissions.title":"Site permissions","settings.privacy.clearBrowsingData":"Clear cookies, cache & site data","pagesNav.downloads":"Downloads","settings.general.cards.browsing":"Browsing"},"de":{"settings.page.heading":"Einstellungen","settings.privacy.title":"Datenschutz & Sicherheit","settings.privacy.blocking.title":"Blockieren","settings.privacy.adblockEnabled.label":"Werbung & Tracker blockieren","settings.privacy.adblockEnabled.hint":"Stoppt Werbung und die versteckten Tracker, die dir von Website zu Website folgen. Standardmäßig an.","settings.privacy.sitesListedHereLoad":"Hier aufgeführte Websites laden ohne Werbeblocker, z. B. für Websites, die damit nicht funktionieren.","settings.privacy.exceptionAdd":"Hinzufügen","settings.privacy.exceptionList.empty":"Keine Ausnahmen hinzugefügt.","settings.siteList.remove":"{site} entfernen","settings.blockingStatus.ready":"{provider} ist bereit.","settings.blockingStatus.initializing":"{provider} wird gestartet.","settings.blockingStatus.disabled":"{provider} ist deaktiviert.","settings.blockingStatus.failed":"{provider} konnte nicht weiterarbeiten ({error}). Betroffene Anfragen bleiben blockiert.","settings.privacy.sitePermissions.title":"Website-Berechtigungen","settings.privacy.clearBrowsingData":"Cookies, Cache & Websitedaten löschen","pagesNav.downloads":"Downloads","settings.general.cards.browsing":"Surfen"},"es":{"settings.page.heading":"Configuración","settings.privacy.title":"Privacidad y seguridad","settings.privacy.blocking.title":"Bloqueo","settings.privacy.adblockEnabled.label":"Bloquear anuncios y rastreadores","settings.privacy.adblockEnabled.hint":"Detiene los anuncios y los rastreadores ocultos que te siguen de un sitio a otro. Activado por defecto.","settings.privacy.sitesListedHereLoad":"Los sitios de esta lista se cargan con el bloqueo de anuncios desactivado, p. ej., los que dejan de funcionar con él.","settings.privacy.exceptionAdd":"Añadir","settings.privacy.exceptionList.empty":"No se ha añadido ninguna excepción.","settings.siteList.remove":"Quitar {site}","settings.blockingStatus.ready":"{provider} listo.","settings.blockingStatus.initializing":"{provider} iniciándose.","settings.blockingStatus.disabled":"{provider} desactivado.","settings.blockingStatus.failed":"{provider} no pudo continuar ({error}). Las solicitudes afectadas siguen bloqueadas.","settings.privacy.sitePermissions.title":"Permisos de los sitios","settings.privacy.clearBrowsingData":"Borrar cookies, caché y datos de sitios","pagesNav.downloads":"Descargas","settings.general.cards.browsing":"Navegación"},"fr":{"settings.page.heading":"Réglages","settings.privacy.title":"Confidentialité et sécurité","settings.privacy.blocking.title":"Blocage","settings.privacy.adblockEnabled.label":"Bloquer les publicités et traceurs","settings.privacy.adblockEnabled.hint":"Bloque les publicités et les traceurs cachés qui vous suivent d’un site à l’autre. Activé par défaut.","settings.privacy.sitesListedHereLoad":"Les sites listés ici se chargent sans blocage des publicités, p. ex. ceux qui ne fonctionnent plus avec.","settings.privacy.exceptionAdd":"Ajouter","settings.privacy.exceptionList.empty":"Aucune exception ajoutée.","settings.siteList.remove":"Retirer {site}","settings.blockingStatus.ready":"{provider} prêt.","settings.blockingStatus.initializing":"{provider} en cours d’initialisation.","settings.blockingStatus.disabled":"{provider} désactivé.","settings.blockingStatus.failed":"{provider} n’a pas pu continuer ({error}). Les requêtes concernées restent bloquées.","settings.privacy.sitePermissions.title":"Autorisations des sites","settings.privacy.clearBrowsingData":"Effacer cookies, cache et données de sites","pagesNav.downloads":"Téléchargements","settings.general.cards.browsing":"Navigation"},"it":{"settings.page.heading":"Impostazioni","settings.privacy.title":"Privacy e sicurezza","settings.privacy.blocking.title":"Blocco","settings.privacy.adblockEnabled.label":"Blocca annunci e tracker","settings.privacy.adblockEnabled.hint":"Ferma gli annunci e i tracker nascosti che ti seguono da un sito all’altro. Attivo per impostazione predefinita.","settings.privacy.sitesListedHereLoad":"I siti di questo elenco si caricano con il blocco degli annunci disattivato, ad esempio quelli che smettono di funzionare con il blocco.","settings.privacy.exceptionAdd":"Aggiungi","settings.privacy.exceptionList.empty":"Nessuna eccezione aggiunta.","settings.siteList.remove":"Rimuovi {site}","settings.blockingStatus.ready":"{provider} pronto.","settings.blockingStatus.initializing":"{provider} in fase di avvio.","settings.blockingStatus.disabled":"{provider} disattivato.","settings.blockingStatus.failed":"{provider} non è riuscito a continuare ({error}). Le richieste interessate restano bloccate.","settings.privacy.sitePermissions.title":"Autorizzazioni dei siti","settings.privacy.clearBrowsingData":"Cancella cookie, cache e dati dei siti","pagesNav.downloads":"Download","settings.general.cards.browsing":"Navigazione"},"pt-BR":{"settings.page.heading":"Configurações","settings.privacy.title":"Privacidade e segurança","settings.privacy.blocking.title":"Bloqueio","settings.privacy.adblockEnabled.label":"Bloquear anúncios e rastreadores","settings.privacy.adblockEnabled.hint":"Bloqueia anúncios e os rastreadores ocultos que seguem você de site em site. Ativado por padrão.","settings.privacy.sitesListedHereLoad":"Os sites listados aqui carregam com o bloqueio de anúncios desativado, por exemplo os que quebram com ele.","settings.privacy.exceptionAdd":"Adicionar","settings.privacy.exceptionList.empty":"Nenhuma exceção adicionada.","settings.siteList.remove":"Remover {site}","settings.blockingStatus.ready":"{provider} pronto.","settings.blockingStatus.initializing":"{provider} iniciando.","settings.blockingStatus.disabled":"{provider} desativado.","settings.blockingStatus.failed":"{provider} não conseguiu continuar ({error}). As solicitações afetadas continuam bloqueadas.","settings.privacy.sitePermissions.title":"Permissões dos sites","settings.privacy.clearBrowsingData":"Limpar cookies, cache e dados de sites","pagesNav.downloads":"Downloads","settings.general.cards.browsing":"Navegação"}};
// Shipping settings.js normalization: accepts a host or URL and removes www.
function normalizeBlockingHostname(input) {
  try {
    return new URL(input.includes('://') ? input : `https://${input}`).hostname
      .toLowerCase().replace(/^www\./, '') || null;
  } catch { return null; }
}
if (typeof module !== 'undefined') module.exports = { normalizeBlockingHostname };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  // Injected only into the trusted settings document by the native host.
  const requested = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  const locale = Object.keys(blockingCopy).find(key => key.toLowerCase() === requested)
    || Object.keys(blockingCopy).find(key => key.toLowerCase().split('-')[0] === requested.split('-')[0]) || 'en';
  const t = (key, vars = {}) => (blockingCopy[locale][key] || blockingCopy.en[key] || key)
    .replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
  document.documentElement.lang = locale;
  for (const element of document.querySelectorAll('[data-blocking-i18n]'))
    element.textContent = t(element.dataset.blockingI18n);
  document.title = t('settings.page.heading');
  const bridge = window.blancBlockingSettings;
  const enabled = document.getElementById('blocking-enabled');
  const input = document.getElementById('exception-input');
  const add = document.getElementById('exception-add');
  const list = document.getElementById('exception-list');
  const status = document.getElementById('provider-status');
  const error = document.getElementById('blocking-error');
  let queue = Promise.resolve();
  let lastExceptions = null;
  let healthRefreshPending = false;
  const setStatus = value => { if (status.textContent !== value) status.textContent = value; };
  input.setAttribute('aria-label', t('settings.privacy.sitesListedHereLoad'));
  const showError = e => { error.textContent = e?.message || 'Blocking settings could not be saved.'; error.hidden = false; };
  const refresh = async () => {
    const state = await bridge.get();
    if (typeof state?.enabled !== 'boolean' || !Array.isArray(state.exceptions) ||
        !state.exceptions.every(h => typeof h === 'string')) throw new Error('Blocking settings are unavailable.');
    enabled.checked = state.enabled;
    enabled.disabled = input.disabled = add.disabled = false;
    const provider = 'Blanc Blocker';
    setStatus(!state.enabled ? t('settings.blockingStatus.disabled', { provider })
      : state.health === 'ready' ? t('settings.blockingStatus.ready', { provider })
      : state.health === 'unavailable' ? t('settings.blockingStatus.failed', { provider, error: 'unavailable' })
      : t('settings.blockingStatus.initializing', { provider }));
    const exceptionsKey = JSON.stringify([...state.exceptions].sort());
    if (exceptionsKey === lastExceptions) return;
    lastExceptions = exceptionsKey;
    list.replaceChildren();
    if (!state.exceptions.length) {
      const empty = document.createElement('div'); empty.className = 'site-list-empty';
      empty.textContent = t('settings.privacy.exceptionList.empty'); list.append(empty);
    }
    [...state.exceptions].sort().forEach((host, index) => {
      const row = document.createElement('div'); row.className = 'site-row';
      const name = document.createElement('span'); name.className = 'site-row-name'; name.textContent = host;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'site-row-remove';
      remove.textContent = '×'; remove.setAttribute('aria-label', t('settings.siteList.remove', { site: host }));
      remove.addEventListener('click', () => {
        const hadFocus = document.activeElement === remove;
        run(async () => { await bridge.removeException(host); await refresh();
          if (hadFocus) { const buttons = list.querySelectorAll('.site-row-remove');
            (buttons[Math.min(index, buttons.length - 1)] ?? input).focus(); } });
      });
      row.append(name, remove); list.append(row);
    });
  };
  const run = (fn, passive = false) => { queue = queue.then(async () => { if (!passive) error.hidden = true; await fn(); }).catch(async e => {
    if (!passive || error.hidden) showError(e); try { await refresh(); } catch { enabled.disabled = input.disabled = add.disabled = true; }
  }); return queue; };
  if (!bridge || typeof bridge.get !== 'function' || typeof bridge.setEnabled !== 'function' ||
      typeof bridge.addException !== 'function' || typeof bridge.removeException !== 'function') {
    setStatus(t('settings.blockingStatus.failed', { provider: 'Blanc Blocker', error: 'unavailable' })); return;
  }
  enabled.addEventListener('change', () => { const value = enabled.checked; run(async () => { await bridge.setEnabled(value); await refresh(); }); });
  document.getElementById('exception-form').addEventListener('submit', event => {
    event.preventDefault(); const host = normalizeBlockingHostname(input.value.trim());
    if (!host) { showError(new Error('Enter a valid site address.')); return; }
    run(async () => { await bridge.addException(host); input.value = ''; await refresh(); });
  });
  if (typeof bridge.onChanged === 'function') bridge.onChanged(() => run(refresh, true));
  run(refresh, true);
  // Provider health changes independently of preferences. Keep the status
  // current without rebuilding the list (and stealing keyboard focus).
  setInterval(() => {
    if (document.hidden || healthRefreshPending) return;
    healthRefreshPending = true;
    run(refresh, true).finally(() => { healthRefreshPending = false; });
  }, 2000);
});
