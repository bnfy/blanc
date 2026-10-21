// Fixture-only isolated-world diagnostic. Not part of the prototype provider.
(() => {
 const node = document.querySelector('#fixture-ready');
 if (!node || !node.textContent.startsWith('authored fixture ')) return;
 // randomUUID is secure-context-only; data and opaque-created blob realms
 // still expose getRandomValues. This identifier is diagnostic, not authority.
 const instance = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
 chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'blanc-fallback-deliver' || message.instance !== instance || typeof message.code !== 'string') return;
  let error = null;
  try {
   const script = document.createElement('script');
   script.textContent = message.code;
   (document.head || document.documentElement).append(script);
   script.remove();
  } catch (e) { error = String(e); }
  reply({ instance, href: location.href, origin: self.origin, error });
 });
 chrome.runtime.sendMessage({ type: 'blanc-fallback-hello', instance, href: location.href, origin: self.origin, frameName: node.textContent }, () => { void chrome.runtime.lastError; });
})();
