'use strict';
// Settings → Search and Appearance, ported from shipping v1.45.1 (src/renderer/pages/settings.js
// and settings.html). The engine choice lives in Chromium's search engine
// store: the native handler maps it to the five shipping engines and one
// Blanc-owned custom address, and is the only validator, as shipping's main
// process is. tools/search-settings.test.mjs checks the copy and engine list.
const searchCopy = {"en":{"settings.general.title":"General","settings.general.cards.search":"Search","settings.general.searchEngine.label":"Search engine","settings.general.searchEngine.hint":"Used when the address bar input isn't a URL","settings.general.searchEngine.custom":"Custom…","settings.general.searchEngineTemplate.label":"Custom search address","settings.general.searchEngineTemplate.hint":"Paste the search address with %s where your search words go, for example https://searx.example.org/search?q=%s. It syncs with your other settings.","settings.general.searchEngineTemplateError":"That address isn't valid — your previous search engine is still in use.","settings.general.searchSuggestions.label":"Search suggestions","settings.general.searchSuggestions.hint":"Send eligible typed prefixes to your selected search provider, including Google if selected. Private tabs and recognized sensitive-looking input are excluded. Submitting a search sends the completed query even when suggestions are off.","settings.general.cards.appearance":"Appearance","settings.general.theme.label":"Theme","settings.general.theme.hint":"System follows your macOS/Windows theme","settings.general.theme.system":"System","settings.general.theme.light":"Light","settings.general.theme.dark":"Dark","settings.general.cards.island":"Island","settings.general.islandHoverOpen.label":"Open the Island on hover","settings.general.islandHoverOpen.hint":"Rest the pointer on the Island’s address to open it without clicking.","settings.general.islandAutoHide.label":"Auto-hide the Island","settings.general.islandAutoHide.hint":"Let pages fill the window. Move the pointer to the top edge, or open search and commands, to bring the Island back.","settings.general.islandAutoHideStyle.label":"When the Island comes back","settings.general.islandAutoHideStyle.hint":"Float it over the page, or move the page down to make room.","settings.general.islandAutoHideStyle.float":"Float over the page","settings.general.islandAutoHideStyle.push":"Push the page down"},"de":{"settings.general.title":"Allgemein","settings.general.cards.search":"Suche","settings.general.searchEngine.label":"Suchmaschine","settings.general.searchEngine.hint":"Wird verwendet, wenn die Eingabe in der Adressleiste keine URL ist","settings.general.searchEngine.custom":"Eigene Suchmaschine…","settings.general.searchEngineTemplate.label":"Adresse der eigenen Suchmaschine","settings.general.searchEngineTemplate.hint":"Füge die Suchadresse ein, mit %s an der Stelle deiner Suchbegriffe, z. B. https://searx.example.org/search?q=%s. Sie wird mit deinen anderen Einstellungen synchronisiert.","settings.general.searchEngineTemplateError":"Diese Adresse ist ungültig – deine bisherige Suchmaschine wird weiter verwendet.","settings.general.searchSuggestions.label":"Suchvorschläge","settings.general.searchSuggestions.hint":"Sendet geeignete eingetippte Anfänge an deinen gewählten Suchanbieter, auch an Google, wenn ausgewählt. Private Tabs und erkennbar sensibel wirkende Eingaben sind ausgenommen. Eine abgeschickte Suche sendet die vollständige Anfrage, auch wenn Vorschläge aus sind.","settings.general.cards.appearance":"Erscheinungsbild","settings.general.theme.label":"Design","settings.general.theme.hint":"System folgt dem Design von macOS/Windows","settings.general.theme.system":"System","settings.general.theme.light":"Hell","settings.general.theme.dark":"Dunkel","settings.general.cards.island":"Island","settings.general.islandHoverOpen.label":"Island beim Darüberfahren öffnen","settings.general.islandHoverOpen.hint":"Lass den Zeiger auf der Adresse in der Island ruhen, um sie ohne Klick zu öffnen.","settings.general.islandAutoHide.label":"Island automatisch ausblenden","settings.general.islandAutoHide.hint":"Seiten füllen das Fenster. Bewege den Zeiger an den oberen Rand oder öffne Suche und Befehle, um die Island zurückzuholen.","settings.general.islandAutoHideStyle.label":"Wenn die Island zurückkommt","settings.general.islandAutoHideStyle.hint":"Lass sie über der Seite schweben oder schiebe die Seite nach unten, um Platz zu machen.","settings.general.islandAutoHideStyle.float":"Über der Seite schweben","settings.general.islandAutoHideStyle.push":"Seite nach unten schieben"},"es":{"settings.general.title":"General","settings.general.cards.search":"Búsqueda","settings.general.searchEngine.label":"Motor de búsqueda","settings.general.searchEngine.hint":"Se usa cuando lo escrito en la barra de direcciones no es una URL","settings.general.searchEngine.custom":"Personalizado…","settings.general.searchEngineTemplate.label":"Dirección de búsqueda personalizada","settings.general.searchEngineTemplate.hint":"Pega la dirección de búsqueda con %s donde van tus palabras, p. ej., https://searx.example.org/search?q=%s. Se sincroniza con el resto de tus ajustes.","settings.general.searchEngineTemplateError":"Esa dirección no es válida; se sigue usando el motor de búsqueda anterior.","settings.general.searchSuggestions.label":"Sugerencias de búsqueda","settings.general.searchSuggestions.hint":"Envía los comienzos aptos de lo que escribes al buscador elegido, incluido Google si lo eliges. Se excluyen las pestañas privadas y lo que parece información sensible. Al enviar una búsqueda se manda la consulta completa aunque las sugerencias estén desactivadas.","settings.general.cards.appearance":"Apariencia","settings.general.theme.label":"Tema","settings.general.theme.hint":"Sistema sigue el tema de macOS o Windows","settings.general.theme.system":"Sistema","settings.general.theme.light":"Claro","settings.general.theme.dark":"Oscuro","settings.general.cards.island":"Island","settings.general.islandHoverOpen.label":"Abrir la Island al pasar el cursor","settings.general.islandHoverOpen.hint":"Deja el puntero sobre la dirección de la Island para abrirla sin hacer clic.","settings.general.islandAutoHide.label":"Ocultar la Island automáticamente","settings.general.islandAutoHide.hint":"Las páginas ocupan toda la ventana. Lleva el puntero al borde superior o abre la búsqueda y los comandos para que vuelva la Island.","settings.general.islandAutoHideStyle.label":"Cuando vuelve la Island","settings.general.islandAutoHideStyle.hint":"Haz que flote sobre la página o mueve la página hacia abajo para dejarle sitio.","settings.general.islandAutoHideStyle.float":"Flotar sobre la página","settings.general.islandAutoHideStyle.push":"Bajar la página"},"fr":{"settings.general.title":"Général","settings.general.cards.search":"Recherche","settings.general.searchEngine.label":"Moteur de recherche","settings.general.searchEngine.hint":"Utilisé quand la saisie dans la barre d’adresse n’est pas une URL","settings.general.searchEngine.custom":"Personnalisé…","settings.general.searchEngineTemplate.label":"Adresse de recherche personnalisée","settings.general.searchEngineTemplate.hint":"Collez l’adresse de recherche en mettant %s à la place de vos mots-clés, p. ex. https://searx.example.org/search?q=%s. Elle est synchronisée avec vos autres réglages.","settings.general.searchEngineTemplateError":"Cette adresse n’est pas valide — le moteur de recherche précédent reste utilisé.","settings.general.searchSuggestions.label":"Suggestions de recherche","settings.general.searchSuggestions.hint":"Envoie les débuts de saisie éligibles au moteur de recherche choisi, y compris Google si vous l’avez choisi. Les onglets privés et les saisies qui semblent sensibles sont exclus. Lancer une recherche envoie la requête complète même si les suggestions sont désactivées.","settings.general.cards.appearance":"Apparence","settings.general.theme.label":"Thème","settings.general.theme.hint":"Système suit le thème de macOS ou Windows","settings.general.theme.system":"Système","settings.general.theme.light":"Clair","settings.general.theme.dark":"Sombre","settings.general.cards.island":"Island","settings.general.islandHoverOpen.label":"Ouvrir l’Island au survol","settings.general.islandHoverOpen.hint":"Laissez le pointeur sur l’adresse de l’Island pour l’ouvrir sans cliquer.","settings.general.islandAutoHide.label":"Masquer automatiquement l’Island","settings.general.islandAutoHide.hint":"Les pages occupent toute la fenêtre. Amenez le pointeur au bord supérieur ou ouvrez la recherche et les commandes pour faire revenir l’Island.","settings.general.islandAutoHideStyle.label":"Quand l’Island revient","settings.general.islandAutoHideStyle.hint":"Faites-la flotter au-dessus de la page, ou décalez la page vers le bas pour lui faire de la place.","settings.general.islandAutoHideStyle.float":"Flotter au-dessus de la page","settings.general.islandAutoHideStyle.push":"Décaler la page vers le bas"},"it":{"settings.general.title":"Generali","settings.general.cards.search":"Ricerca","settings.general.searchEngine.label":"Motore di ricerca","settings.general.searchEngine.hint":"Usato quando il testo nella barra degli indirizzi non è un URL","settings.general.searchEngine.custom":"Personalizzato…","settings.general.searchEngineTemplate.label":"Indirizzo di ricerca personalizzato","settings.general.searchEngineTemplate.hint":"Incolla l’indirizzo di ricerca con %s al posto delle parole che cerchi, ad esempio https://searx.example.org/search?q=%s. Viene sincronizzato con le altre impostazioni.","settings.general.searchEngineTemplateError":"Questo indirizzo non è valido: resta in uso il motore di ricerca precedente.","settings.general.searchSuggestions.label":"Suggerimenti di ricerca","settings.general.searchSuggestions.hint":"Invia i prefissi idonei che digiti al motore di ricerca selezionato, incluso Google se lo hai scelto. Le schede private e il testo riconosciuto come potenzialmente sensibile sono esclusi. Avviare una ricerca invia la query completa anche quando i suggerimenti sono disattivati.","settings.general.cards.appearance":"Aspetto","settings.general.theme.label":"Tema","settings.general.theme.hint":"Sistema segue il tema di macOS o Windows","settings.general.theme.system":"Sistema","settings.general.theme.light":"Chiaro","settings.general.theme.dark":"Scuro","settings.general.cards.island":"Island","settings.general.islandHoverOpen.label":"Apri l’Island al passaggio del puntatore","settings.general.islandHoverOpen.hint":"Lascia il puntatore sull’indirizzo dell’Island per aprirla senza fare clic.","settings.general.islandAutoHide.label":"Nascondi automaticamente l’Island","settings.general.islandAutoHide.hint":"Le pagine riempiono la finestra. Porta il puntatore al bordo superiore o apri ricerca e comandi per far tornare l’Island.","settings.general.islandAutoHideStyle.label":"Quando l’Island torna","settings.general.islandAutoHideStyle.hint":"Falla fluttuare sopra la pagina o sposta la pagina in basso per farle spazio.","settings.general.islandAutoHideStyle.float":"Fluttua sopra la pagina","settings.general.islandAutoHideStyle.push":"Sposta la pagina in basso"},"pt-BR":{"settings.general.title":"Geral","settings.general.cards.search":"Pesquisa","settings.general.searchEngine.label":"Mecanismo de pesquisa","settings.general.searchEngine.hint":"Usado quando o que você digita na barra de endereço não é uma URL","settings.general.searchEngine.custom":"Personalizado…","settings.general.searchEngineTemplate.label":"Endereço de pesquisa personalizado","settings.general.searchEngineTemplate.hint":"Cole o endereço de pesquisa com %s no lugar das suas palavras, por exemplo https://searx.example.org/search?q=%s. Ele é sincronizado com suas outras configurações.","settings.general.searchEngineTemplateError":"Esse endereço não é válido — o mecanismo de pesquisa anterior continua em uso.","settings.general.searchSuggestions.label":"Sugestões de pesquisa","settings.general.searchSuggestions.hint":"Envia os começos elegíveis do que você digita ao provedor de pesquisa escolhido, inclusive o Google, se escolhido. Abas privadas e textos que parecem sensíveis ficam de fora. Fazer uma pesquisa envia a consulta completa mesmo com as sugestões desativadas.","settings.general.cards.appearance":"Aparência","settings.general.theme.label":"Tema","settings.general.theme.hint":"Sistema segue o tema do macOS ou do Windows","settings.general.theme.system":"Sistema","settings.general.theme.light":"Claro","settings.general.theme.dark":"Escuro","settings.general.cards.island":"Island","settings.general.islandHoverOpen.label":"Abrir a Island ao passar o cursor","settings.general.islandHoverOpen.hint":"Deixe o ponteiro sobre o endereço da Island para abri-la sem clicar.","settings.general.islandAutoHide.label":"Ocultar a Island automaticamente","settings.general.islandAutoHide.hint":"As páginas ocupam a janela inteira. Leve o ponteiro à borda superior ou abra a busca e os comandos para trazer a Island de volta.","settings.general.islandAutoHideStyle.label":"Quando a Island volta","settings.general.islandAutoHideStyle.hint":"Faça-a flutuar sobre a página ou mova a página para baixo para abrir espaço.","settings.general.islandAutoHideStyle.float":"Flutuar sobre a página","settings.general.islandAutoHideStyle.push":"Empurrar a página para baixo"}};
const SEARCH_ENGINES = { duckduckgo: 'DuckDuckGo', google: 'Google', bing: 'Bing', brave: 'Brave Search', kagi: 'Kagi', custom: null };
if (typeof module !== 'undefined') module.exports = { searchCopy, SEARCH_ENGINES };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
  // The launch's interface language when strings.js resolved one (F44).
  const requested = (window.blancStrings?.locale || navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  const locale = Object.keys(searchCopy).find(key => key.toLowerCase() === requested)
    || Object.keys(searchCopy).find(key => key.toLowerCase().split('-')[0] === requested.split('-')[0]) || 'en';
  const t = key => searchCopy[locale][key] || searchCopy.en[key] || key;
  for (const element of document.querySelectorAll('[data-search-i18n]'))
    element.textContent = t(element.dataset.searchI18n);
  const bridge = window.blancSearchSettings;
  const searchEngine = document.getElementById('searchEngine');
  const searchSuggestions = document.getElementById('searchSuggestions');
  const searchCustomRow = document.getElementById('searchEngineCustomRow');
  const searchTemplate = document.getElementById('searchEngineTemplate');
  const searchTemplateError = document.getElementById('searchEngineTemplateError');
  for (const [key, label] of Object.entries(SEARCH_ENGINES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'custom' ? t('settings.general.searchEngine.custom') : label;
    searchEngine.append(opt);
  }
  if (!bridge || typeof bridge.get !== 'function' || typeof bridge.set !== 'function') return;
  // The error joins the field's description only while it shows: Chromium
  // reads a hidden element named by aria-describedby, which would call a
  // good address invalid.
  const setSearchError = shown => {
    searchTemplateError.hidden = !shown;
    searchTemplate.setAttribute('aria-invalid', String(shown));
    searchTemplate.setAttribute('aria-describedby', shown ? 'searchEngineTemplateHint searchEngineTemplateError' : 'searchEngineTemplateHint');
  };
  // Reflect an ACCEPTED stored snapshot into the controls (clears any error).
  const showAcceptedSearch = s => {
    searchEngine.value = s.searchEngine;
    searchTemplate.value = s.searchEngineTemplate ?? '';
    searchCustomRow.hidden = searchEngine.value !== 'custom';
    searchSuggestions.checked = s.searchSuggestions;
    searchEngine.disabled = searchTemplate.disabled = !s.editable;
    setSearchError(false);
  };
  // The native handler is the sole validator: send the change, then render
  // from what was actually stored. A Custom write was refused when Custom
  // isn't selected afterwards, or when the stored address isn't the one just
  // sent. Keep the draft visible with the error rather than snapping back.
  const commitSearch = async partial => {
    const next = await bridge.set(partial);
    const refused = partial.searchEngine === 'custom' &&
      (next.searchEngine !== 'custom' || next.searchEngineTemplate !== partial.searchEngineTemplate);
    if (refused) {
      searchEngine.value = 'custom';
      searchCustomRow.hidden = false;
      setSearchError(true);
      return;
    }
    showAcceptedSearch(next);
  };
  showAcceptedSearch(await bridge.get());
  searchEngine.addEventListener('change', () => {
    if (searchEngine.value === 'custom') {
      searchCustomRow.hidden = false;
      setSearchError(false); // no error before anything is typed
      const template = searchTemplate.value.trim();
      if (template) commitSearch({ searchEngine: 'custom', searchEngineTemplate: template });
      // else: the address field's own change event commits and validates
    } else {
      commitSearch({ searchEngine: searchEngine.value });
    }
  });
  searchTemplate.addEventListener('change', () =>
    commitSearch({ searchEngine: 'custom', searchEngineTemplate: searchTemplate.value.trim() }));
  searchSuggestions.addEventListener('change', () =>
    bridge.set({ searchSuggestions: searchSuggestions.checked }));
  // Appearance: Chromium's browser color scheme, stored natively; the page
  // shows what was stored.
  const theme = document.getElementById('theme');
  theme.value = (await bridge.get()).theme;
  theme.addEventListener('change', async () => { theme.value = (await bridge.set({ theme: theme.value })).theme; });
  // Island: open on hover (F1), stored natively; the Island hears the change.
  const hoverOpen = document.getElementById('islandHoverOpen');
  hoverOpen.setAttribute('aria-label', t('settings.general.islandHoverOpen.label'));
  hoverOpen.checked = (await bridge.get()).islandHoverOpen;
  hoverOpen.addEventListener('change', async () => {
    hoverOpen.checked = (await bridge.set({ islandHoverOpen: hoverOpen.checked })).islandHoverOpen;
  });
  // Island: auto-hide (F1), stored natively; each window's Island hears it.
  const autoHide = document.getElementById('islandAutoHide');
  autoHide.setAttribute('aria-label', t('settings.general.islandAutoHide.label'));
  autoHide.checked = (await bridge.get()).islandAutoHide;
  autoHide.addEventListener('change', async () => {
    autoHide.checked = (await bridge.set({ islandAutoHide: autoHide.checked })).islandAutoHide;
    autoHideStyleRow.hidden = !autoHide.checked;
  });
  // How a hidden Island comes back, shown while auto-hide is on as shipping's
  // Settings does.
  const autoHideStyleRow = document.getElementById('islandAutoHideStyleSetting');
  const autoHideStyle = document.getElementById('islandAutoHideStyle');
  autoHideStyle.setAttribute('aria-label', t('settings.general.islandAutoHideStyle.label'));
  autoHideStyle.value = (await bridge.get()).islandAutoHideStyle;
  autoHideStyleRow.hidden = !autoHide.checked;
  autoHideStyle.addEventListener('change', async () => {
    autoHideStyle.value = (await bridge.set({ islandAutoHideStyle: autoHideStyle.value })).islandAutoHideStyle;
  });
});
