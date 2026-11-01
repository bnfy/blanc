// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Binds the typed Island interface (F0.6) for the contract groups that have
// moved off the untyped chrome.send dispatcher. host.js calls them through
// BlancBrowserApi.invoke, which keeps every value contract-shaped.
import {BrowserApiFactory, NavigationRemote, SearchClientCallbackRouter, SearchRemote} from './browser_api.mojom-webui.js';

const factory = BrowserApiFactory.getRemote();
const navigation = new NavigationRemote();
factory.bindNavigation(navigation.$.bindNewPipeAndPassReceiver());
// The search group's client events (bangs) are not ported yet; the router
// keeps that pipe open.
const searchClient = new SearchClientCallbackRouter();
const search = new SearchRemote();
factory.bindSearch(search.$.bindNewPipeAndPassReceiver(), searchClient.$.bindNewPipeAndPassRemote());
const remotes = {navigation, search};

window.BlancBrowserApi = Object.freeze({
  invoke: (name, args) => window.BlancBrowserApiCodec.invoke(remotes, name, args),
});
