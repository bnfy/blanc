'use strict';
// Settings → Bangs, ported from shipping v1.45.1 (src/renderer/pages/settings.js
// and settings.html): the switch and the person's own bangs. Stored in the
// profile's preferences; the native settings handler is the only validator,
// as shipping's main process is (bangs.cc). tools/bang-settings.test.mjs
// checks the copy against shipping.
const bangCopy = {"en":{"settings.general.bangs.label":"Bangs","settings.general.bangs.hint":"Type ! followed by a site's code to search that site directly, for example !w for Wikipedia or !yt for YouTube. Type ! alone to see them. It syncs with your other settings.","settings.general.customBangs.label":"Your bangs","settings.general.customBangs.hint":"Syncs with your other settings; the device that saves last wins.","settings.general.customBangs.code":"Code","settings.general.customBangs.name":"Name","settings.general.customBangs.address":"Address with %s","settings.general.customBangs.add":"Add","settings.general.customBangs.empty":"No bangs of your own yet.","settings.general.customBangs.replaces":"Replaces the built-in !{code} ({site})","settings.general.customBangs.duplicate":"You already have !{code}.","settings.general.customBangsError":"That bang isn't valid — check the code and the address.","settings.general.customBangs.remove":"Remove !{code}"},"de":{"settings.general.bangs.label":"Bangs","settings.general.bangs.hint":"Tippe ! und das Kürzel einer Website, um direkt dort zu suchen, zum Beispiel !w für Wikipedia oder !yt für YouTube. Tippe nur !, um alle zu sehen. Wird mit deinen anderen Einstellungen synchronisiert.","settings.general.customBangs.label":"Deine Bangs","settings.general.customBangs.hint":"Wird mit deinen anderen Einstellungen synchronisiert; das zuletzt speichernde Gerät gewinnt.","settings.general.customBangs.code":"Kürzel","settings.general.customBangs.name":"Name","settings.general.customBangs.address":"Adresse mit %s","settings.general.customBangs.add":"Hinzufügen","settings.general.customBangs.empty":"Noch keine eigenen Bangs.","settings.general.customBangs.replaces":"Ersetzt das eingebaute !{code} ({site})","settings.general.customBangs.duplicate":"!{code} hast du schon.","settings.general.customBangsError":"Dieser Bang ist ungültig – prüfe Kürzel und Adresse.","settings.general.customBangs.remove":"!{code} entfernen"},"es":{"settings.general.bangs.label":"Bangs","settings.general.bangs.hint":"Escribe ! seguido del código de un sitio para buscar directamente en él, por ejemplo !w para Wikipedia o !yt para YouTube. Escribe solo ! para verlos. Se sincroniza con tus otros ajustes.","settings.general.customBangs.label":"Tus bangs","settings.general.customBangs.hint":"Se sincroniza con tus otros ajustes; gana el dispositivo que guarda en último lugar.","settings.general.customBangs.code":"Código","settings.general.customBangs.name":"Nombre","settings.general.customBangs.address":"Dirección con %s","settings.general.customBangs.add":"Añadir","settings.general.customBangs.empty":"Todavía no tienes bangs propios.","settings.general.customBangs.replaces":"Sustituye al !{code} integrado ({site})","settings.general.customBangs.duplicate":"Ya tienes !{code}.","settings.general.customBangsError":"Ese bang no es válido; revisa el código y la dirección.","settings.general.customBangs.remove":"Quitar !{code}"},"fr":{"settings.general.bangs.label":"Bangs","settings.general.bangs.hint":"Tapez ! suivi du code d’un site pour y chercher directement, par exemple !w pour Wikipédia ou !yt pour YouTube. Tapez ! seul pour les voir. Synchronisé avec vos autres réglages.","settings.general.customBangs.label":"Vos bangs","settings.general.customBangs.hint":"Synchronisé avec vos autres réglages ; l’appareil qui enregistre en dernier l’emporte.","settings.general.customBangs.code":"Code","settings.general.customBangs.name":"Nom","settings.general.customBangs.address":"Adresse avec %s","settings.general.customBangs.add":"Ajouter","settings.general.customBangs.empty":"Aucun bang à vous pour l’instant.","settings.general.customBangs.replaces":"Remplace le !{code} intégré ({site})","settings.general.customBangs.duplicate":"Vous avez déjà !{code}.","settings.general.customBangsError":"Ce bang n’est pas valide — vérifiez le code et l’adresse.","settings.general.customBangs.remove":"Retirer !{code}"},"it":{"settings.general.bangs.label":"Bang","settings.general.bangs.hint":"Digita ! seguito dal codice di un sito per cercare direttamente lì, per esempio !w per Wikipedia o !yt per YouTube. Digita solo ! per vederli. Si sincronizza con le altre impostazioni.","settings.general.customBangs.label":"I tuoi bang","settings.general.customBangs.hint":"Si sincronizza con le altre impostazioni; vince il dispositivo che salva per ultimo.","settings.general.customBangs.code":"Codice","settings.general.customBangs.name":"Nome","settings.general.customBangs.address":"Indirizzo con %s","settings.general.customBangs.add":"Aggiungi","settings.general.customBangs.empty":"Ancora nessun bang tuo.","settings.general.customBangs.replaces":"Sostituisce il !{code} integrato ({site})","settings.general.customBangs.duplicate":"Hai già !{code}.","settings.general.customBangsError":"Questo bang non è valido: controlla codice e indirizzo.","settings.general.customBangs.remove":"Rimuovi !{code}"},"pt-BR":{"settings.general.bangs.label":"Bangs","settings.general.bangs.hint":"Digite ! seguido do código de um site para pesquisar diretamente nele, por exemplo !w para a Wikipédia ou !yt para o YouTube. Digite só ! para vê-los. Sincroniza com as suas outras configurações.","settings.general.customBangs.label":"Seus bangs","settings.general.customBangs.hint":"Sincroniza com as suas outras configurações; o dispositivo que salva por último vence.","settings.general.customBangs.code":"Código","settings.general.customBangs.name":"Nome","settings.general.customBangs.address":"Endereço com %s","settings.general.customBangs.add":"Adicionar","settings.general.customBangs.empty":"Nenhum bang seu ainda.","settings.general.customBangs.replaces":"Substitui o !{code} integrado ({site})","settings.general.customBangs.duplicate":"Você já tem !{code}.","settings.general.customBangsError":"Esse bang não é válido — confira o código e o endereço.","settings.general.customBangs.remove":"Remover !{code}"}};
if (typeof module !== 'undefined') module.exports = { bangCopy };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
  // The launch's interface language when strings.js resolved one (F44).
  const requested = (window.blancStrings?.locale || navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  const locale = Object.keys(bangCopy).find(key => key.toLowerCase() === requested)
    || Object.keys(bangCopy).find(key => key.toLowerCase().split('-')[0] === requested.split('-')[0]) || 'en';
  const t = (key, params = {}) => (bangCopy[locale][key] || bangCopy.en[key] || key)
    .replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  for (const element of document.querySelectorAll('[data-bang-i18n]'))
    element.textContent = t(element.dataset.bangI18n);
  for (const element of document.querySelectorAll('[data-bang-i18n-label]')) {
    const text = t(element.dataset.bangI18nLabel);
    element.setAttribute('aria-label', text);
    if (element.placeholder && element.dataset.bangI18nPlaceholder !== 'ignore') element.placeholder = text;
  }
  const bridge = window.blancSearchSettings;
  if (!bridge || typeof bridge.get !== 'function' || typeof bridge.set !== 'function') return;
  const bangsEnabled = document.getElementById('bangsEnabled');
  const bangCode = document.getElementById('customBangCode');
  const bangName = document.getElementById('customBangName');
  const bangTemplate = document.getElementById('customBangTemplate');
  const bangAdd = document.getElementById('customBangAdd');
  const bangList = document.getElementById('customBangList');
  const bangError = document.getElementById('customBangError');
  const bangReplaces = document.getElementById('customBangReplaces');
  const bangHost = (template) => {
    try { return new URL(template.replace('%s', 'x')).host; } catch { return ''; }
  };
  const showBangNotice = (error, replaces) => {
    bangError.hidden = !error;
    if (error) bangError.textContent = error;
    bangReplaces.hidden = !replaces;
    if (replaces) bangReplaces.textContent = replaces;
  };
  let removals = Promise.resolve();

  function renderCustomBangs(list) {
    bangList.replaceChildren();
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'site-list-empty';
      empty.textContent = t('settings.general.customBangs.empty');
      bangList.append(empty);
      return;
    }
    list.forEach((bang, index) => {
      const row = document.createElement('div');
      row.className = 'site-row';
      const code = document.createElement('span');
      code.className = 'custom-bang-code';
      code.textContent = `!${bang.code}`;
      const name = document.createElement('span');
      name.className = 'site-row-name';
      name.textContent = bang.name;
      const host = document.createElement('span');
      host.className = 'custom-bang-host';
      host.textContent = bangHost(bang.template);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'site-row-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', t('settings.general.customBangs.remove', { code: bang.code }));
      remove.addEventListener('click', async () => {
        const hadFocus = document.activeElement === remove;
        removals = removals.then(async () => {
          const saved = await bridge.get();
          const next = await bridge.set({
            customBangs: (saved.customBangs ?? []).filter((b) => b.code !== bang.code),
          });
          renderCustomBangs(next.customBangs ?? []);
          showBangNotice('', '');
        }).catch((error) => console.error(error));
        await removals;
        if (!hadFocus) return;
        const buttons = bangList.querySelectorAll('.site-row-remove');
        (buttons[Math.min(index, buttons.length - 1)] ?? bangCode).focus();
      });
      row.append(code, name, host, remove);
      bangList.append(row);
    });
  }

  // The native handler is the sole validator: send the row, then look for it
  // in what was stored. A duplicate code is refused here first, because the
  // stored list would keep the earlier row and make the add look accepted.
  async function addCustomBang() {
    const code = bangCode.value.trim().replace(/^!/, '').toLowerCase();
    const name = bangName.value.trim();
    const template = bangTemplate.value.trim();
    if (!code && !name && !template) return;
    const current = await bridge.get();
    const existing = current.customBangs ?? [];
    if (existing.some((b) => b.code === code)) {
      showBangNotice(t('settings.general.customBangs.duplicate', { code }), '');
      return;
    }
    const intended = { code, name, template };
    const next = await bridge.set({ customBangs: [...existing, intended] });
    const stored = (next.customBangs ?? []).find((b) =>
      b.code === intended.code && b.name === intended.name && b.template === intended.template);
    if (!stored) {
      showBangNotice(t('settings.general.customBangsError'), '');
      return; // leaves the draft in the fields to correct
    }
    renderCustomBangs(next.customBangs ?? []);
    bangCode.value = '';
    bangName.value = '';
    bangTemplate.value = '';
    const builtIn = window.Bangs?.findBang(code, window.BangsCatalog ?? [], []);
    showBangNotice('', builtIn ? t('settings.general.customBangs.replaces', { code, site: builtIn.name }) : '');
    bangCode.focus();
  }

  const settings = await bridge.get();
  bangsEnabled.checked = settings.bangsEnabled !== false;
  bangsEnabled.addEventListener('change', () => bridge.set({ bangsEnabled: bangsEnabled.checked }));
  bangAdd.addEventListener('click', addCustomBang);
  for (const field of [bangCode, bangName, bangTemplate]) {
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustomBang();
    });
  }
  renderCustomBangs(settings.customBangs ?? []);
  document.documentElement.dataset.bangsReady = 'true';
});
