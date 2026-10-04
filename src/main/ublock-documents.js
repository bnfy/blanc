'use strict';

function captureDocuments(tab, wc, frames, generationFor) {
  return { tab, wc, generation: tab.navEpoch, frames: frames.map(frame => ({ frame, url: frame.url, generation: generationFor(frame) })) };
}
function currentDocuments(snapshot, { liveContents, isHeld, registered, generationFor }) {
  const { tab, wc, generation, frames } = snapshot;
  if (wc.isDestroyed() || wc !== liveContents(tab) || tab.navEpoch !== generation
    || isHeld(wc) || !registered(wc)) return false;
  return frames.every(({ frame, url, generation }) => !frame.isDestroyed() && !frame.detached && frame.url === url
    && wc.mainFrame.framesInSubtree.includes(frame) && generationFor(frame) === generation);
}
function guardScript(code, tokens) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.length > 1024
    || tokens.some(token => typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token))) throw new Error('ubo-document-token-invalid');
  return `if (${JSON.stringify(tokens)}.includes(self.__blancUboDocumentV1)) {\n${code}\n}`;
}
module.exports = { captureDocuments, currentDocuments, guardScript };
