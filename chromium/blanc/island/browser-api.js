// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Binds the typed Island interface (F0.6) for the contract groups that have
// moved off the untyped chrome.send dispatcher. host.js calls them through
// BlancBrowserApi.invoke, which keeps every value contract-shaped.
import {BrowserApiFactory, NavigationRemote} from './browser_api.mojom-webui.js';

const factory = BrowserApiFactory.getRemote();
const navigation = new NavigationRemote();
factory.bindNavigation(navigation.$.bindNewPipeAndPassReceiver());
const remotes = {navigation};

window.BlancBrowserApi = Object.freeze({
  invoke: (name, args) => window.BlancBrowserApiCodec.invoke(remotes, name, args),
});
