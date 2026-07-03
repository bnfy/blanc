window.bowserPages?.appVersion().then((version) => {
  document.getElementById('version').textContent = `v${version}`;
});

if (navigator.platform.startsWith('Mac')) {
  document.getElementById('newTabKey').textContent = '⌘T';
}
