window.bowserPages?.appVersion().then((version) => {
  document.getElementById('version').textContent = `v${version}`;
});
