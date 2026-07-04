window.bowserPages?.appVersion().then((version) => {
  document.getElementById('version').textContent = `v${version}`;
});

if (navigator.platform.startsWith('Mac')) {
  document.getElementById('newTabKey').textContent = '⌘T';
}

// Opened as a private tab (bowser://newtab/?private=1): private theme + copy.
if (new URLSearchParams(location.search).has('private')) {
  document.documentElement.dataset.theme = 'private';
  document.getElementById('newTabCopy').hidden = true;
  document.getElementById('privateCopy').hidden = false;
}
