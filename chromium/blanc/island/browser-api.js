// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Binds the typed Island interface (F0.6) for the contract groups that have
// moved off the untyped chrome.send dispatcher. host.js calls them through
// BlancBrowserApi.invoke, which keeps every value contract-shaped.
import {AppearanceClientCallbackRouter, AppearanceRemote, BrowserApiFactory, NavigationRemote, SearchClientCallbackRouter,
  SearchRemote} from './browser_api.mojom-webui.js';

const factory = BrowserApiFactory.getRemote();
const navigation = new NavigationRemote();
factory.bindNavigation(navigation.$.bindNewPipeAndPassReceiver());
// The search group's client events reach host.js, which hands them to the
// overlay as shipping's bangs:changed push does.
const searchClient = new SearchClientCallbackRouter();
const codec = () => window.BlancBrowserApiCodec;
for (const event of ['onBangsChanged', 'onBangIconsChanged'])
  searchClient[event].addListener(payload => window.dispatchEvent(new CustomEvent('blanc-browser-api', {
    detail: {event, payload: codec().decode(codec().table.events[event].payload, payload)},
  })));
const search = new SearchRemote();
factory.bindSearch(search.$.bindNewPipeAndPassReceiver(), searchClient.$.bindNewPipeAndPassRemote());
// The appearance group's effective light or dark, for the Island renderers.
const appearanceClient = new AppearanceClientCallbackRouter();
for (const event of ['onThemeAppearance', 'onPageTint'])
  appearanceClient[event].addListener(payload => window.dispatchEvent(new CustomEvent('blanc-browser-api', {
    detail: {event, payload: codec().decode(codec().table.events[event].payload, payload)},
  })));
const appearance = new AppearanceRemote();
factory.bindAppearance(appearance.$.bindNewPipeAndPassReceiver(), appearanceClient.$.bindNewPipeAndPassRemote());
const remotes = {navigation, search, appearance};

window.BlancBrowserApi = Object.freeze({
  invoke: (name, args) => window.BlancBrowserApiCodec.invoke(remotes, name, args),
});
