// What 1Password's background does when its in-page Unlock button is
// pressed: open the action popup, here reporting how the call settled.
self.openPopup = () => chrome.action.openPopup().then(
  () => 'resolved', error => 'rejected: ' + error.message);
