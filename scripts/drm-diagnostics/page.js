'use strict';
const result = document.getElementById('result');
for (const operation of ['inspect', 'prepare']) {
  document.getElementById(operation).addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    result.textContent = 'Checking…';
    try { result.textContent = JSON.stringify(await window.drmDiagnostics[operation](), null, 2); }
    catch { result.textContent = 'Diagnostic request failed.'; }
    finally { button.disabled = false; }
  });
}
document.getElementById('probe').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  result.textContent = 'Checking encrypted-media support…';
  let timer;
  try {
    if (!navigator.requestMediaKeySystemAccess) {
      result.textContent = 'Encrypted-media API unavailable in this document.';
      return;
    }
    const checks = ['audio/mp4; codecs="mp4a.40.2"', 'audio/webm; codecs="opus"'].map(async contentType => {
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
          initDataTypes: [contentType.startsWith('audio/webm') ? 'webm' : 'cenc'], audioCapabilities: [{ contentType }],
          distinctiveIdentifier: 'not-allowed', persistentState: 'not-allowed', sessionTypes: ['temporary'],
        }]);
        return { contentType, keySystemAccess: true };
      } catch { return { contentType, keySystemAccess: false }; }
    });
    const report = await Promise.race([Promise.all(checks), new Promise(resolve => {
      timer = setTimeout(() => resolve({ error: 'key-system-check-timed-out' }), 10_000);
    })]);
    result.textContent = JSON.stringify(report, null, 2);
  } finally {
    clearTimeout(timer);
    button.disabled = false;
  }
});
