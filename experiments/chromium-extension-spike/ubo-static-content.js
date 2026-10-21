// GPL-3.0-or-later with the generated pinned uBO payload. Isolated-world receiver.
// No page listener, fixture context, caller-supplied code or guessed frame id.
(() => {
    if ( !/^(about:|data:|blob:)/.test(location.href) ) { return; }
    chrome.runtime.sendMessage({ type: 'blanc-static-script' }, response => {
        if ( chrome.runtime.lastError || !response || typeof response.code !== 'string' || !response.code || typeof response.token !== 'string' ) { return; }
        // This extension-world insertion can be exempt from page CSP/Trusted
        // Types. Keep that privilege explicit; callback completion alone does
        // not prove execution. Acceptance checks actual main-world effects.
        try {
        const script = document.createElement('script');
        script.textContent = response.code;
        (document.head || document.documentElement)?.appendChild(script);
        script.remove();
        } finally {
            // Insertion/execution is synchronous. A lost receiver leaves reload
            // held; no timeout silently releases its permission to execute.
            chrome.runtime.sendMessage({type: 'blanc-static-done', token: response.token},
                () => { void chrome.runtime.lastError; });
        }
    });
})();
