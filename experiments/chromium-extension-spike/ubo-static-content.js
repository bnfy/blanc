// GPL-3.0-or-later with the generated pinned uBO payload. Isolated-world receiver.
// No page listener, fixture context, caller-supplied code or guessed frame id.
(() => {
    if ( !/^(about:|data:|blob:)/.test(location.href) ) { return; }
    chrome.runtime.sendMessage({ type: 'blanc-static-script' }, response => {
        if ( chrome.runtime.lastError || !response || typeof response.code !== 'string' || !response.code ) { return; }
        // This retains the document's CSP. Callback completion alone does not
        // prove execution; runtime acceptance checks actual main-world effects.
        const script = document.createElement('script');
        script.textContent = response.code;
        (document.head || document.documentElement)?.appendChild(script);
        script.remove();
    });
})();
