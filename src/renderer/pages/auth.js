(() => {
  const params = new URL(location.href).searchParams;
  const id = params.get('id');
  const host = params.get('host') || 'this site';
  const realm = params.get('realm');

  document.getElementById('authHost').textContent = realm
    ? `${host} says: “${realm}”`
    : `${host} requires a username and password.`;

  document.getElementById('authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    window.bowserAuth.submit(
      id,
      document.getElementById('authUser').value,
      document.getElementById('authPass').value
    );
  });
  document.getElementById('authCancel').addEventListener('click', () => window.bowserAuth.cancel(id));
})();
