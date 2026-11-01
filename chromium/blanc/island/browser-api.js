// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Binds the typed Island interface (F0.6) for the contract groups that have
// moved off the untyped chrome.send dispatcher. host.js calls them through
// BlancBrowserApi.invoke, which keeps every value contract-shaped.
import {BrowserApiFactory, NavigationRemote, SearchClientCallbackRouter, SearchRemote} from './browser_api.mojom-webui.js';

const factory = BrowserApiFactory.getRemote();
const navigation = new NavigationRemote();
factory.bindNavigation(navigation.$.bindNewPipeAndPassReceiver());
// The search group's client events reach host.js, which hands them to the
// overlay as shipping's bangs:changed push does.
const searchClient = new SearchClientCallbackRouter();
const codec = () => window.BlancBrowserApiCodec;
searchClient.onBangsChanged.addListener(payload => window.dispatchEvent(new CustomEvent('blanc-browser-api', {
  detail: {event: 'onBangsChanged', payload: codec().decode(codec().table.events.onBangsChanged.payload, payload)},
})));
const search = new SearchRemote();
factory.bindSearch(search.$.bindNewPipeAndPassReceiver(), searchClient.$.bindNewPipeAndPassRemote());
const remotes = {navigation, search};

window.BlancBrowserApi = Object.freeze({
  invoke: (name, args) => window.BlancBrowserApiCodec.invoke(remotes, name, args),
});
