// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
//
// The protected-video notice (replacement spec D3/X2; design by the owner,
// 2026-11-16). Blanc Beta has no Widevine, so a page that asks for protected
// playback gets a notice under the Island with one action: open this page in
// the released (Electron) Blanc app, or get that app where it is absent.
//
// The signal is Blink's own use counter for requestMediaKeySystemAccess
// (WebFeature::kEncryptedMediaSecureOrigin), read through a page-load
// observer, so no renderer code changes. It does not name the key system: a
// page asking only for Clear Key, which the beta can play, is noticed too.
//
// Included by blanc_prototype_ui.cc inside its unnamed namespace.

constexpr char kProtectedMediaKey = 0;
struct ProtectedMediaData : public base::SupportsUserData::Data {
  std::string host;
};

// Sites the person said Not now to, or handed off, until Blanc quits.
std::set<std::string>& ProtectedMediaDismissed() {
  static base::NoDestructor<std::set<std::string>> hosts;
  return *hosts;
}
// Test launches never start another app: what would have been handed off is
// recorded, and the Electron app's presence can be set.
std::optional<bool>& TestElectronBlancInstalled() {
  static std::optional<bool> installed;
  return installed;
}
base::ListValue& TestProtectedHandoffs() {
  static base::NoDestructor<base::ListValue> handoffs;
  return *handoffs;
}

bool ElectronBlancAvailable() {
  if (blanc::BlancTestLaunch()) return TestElectronBlancInstalled().value_or(false);
#if BUILDFLAG(IS_MAC)
  return blanc::ElectronBlancInstalled();
#else
  return false;
#endif
}

void RefreshOwnersOf(content::WebContents* contents) {
  for (auto* owner : Owner::Live()) {
    if (owner->browser && owner->browser->GetTabStripModel()->GetIndexOfWebContents(contents) != TabStripModel::kNoTab) {
      RefreshHostSoon(owner);
    }
  }
}

void NoteProtectedMedia(content::WebContents* contents) {
  if (!contents) return;
  const GURL url = contents->GetLastCommittedURL();
  if (!url.SchemeIsHTTPOrHTTPS()) return;
  auto data = std::make_unique<ProtectedMediaData>();
  data->host = std::string(url.host());
  contents->SetUserData(&kProtectedMediaKey, std::move(data));
  RefreshOwnersOf(contents);
}

// The window's current tab, when it asked for protected playback on the site
// it is still showing and the person has not put the notice away: null
// otherwise.
base::Value ProtectedMediaFor(BrowserWindowInterface* browser) {
  auto* active = browser ? browser->GetTabStripModel()->GetActiveWebContents() : nullptr;
  auto* data = active ? static_cast<ProtectedMediaData*>(active->GetUserData(&kProtectedMediaKey)) : nullptr;
  if (!data) return base::Value();
  const GURL url = active->GetLastCommittedURL();
  if (!url.SchemeIsHTTPOrHTTPS() || url.host() != data->host || ProtectedMediaDismissed().contains(data->host)) {
    return base::Value();
  }
  return base::Value(base::DictValue().Set("host", data->host).Set("blancInstalled", ElectronBlancAvailable()));
}

void DismissProtectedMedia(BrowserWindowInterface* browser) {
  auto* active = browser->GetTabStripModel()->GetActiveWebContents();
  auto* data = active ? static_cast<ProtectedMediaData*>(active->GetUserData(&kProtectedMediaKey)) : nullptr;
  if (data) ProtectedMediaDismissed().insert(data->host);
}

// Open in Blanc: the current page's address goes to the Electron app, which
// opens it as any link from another app. A private tab's address goes too
// (owner, 2026-11-16): the click is the person's own choice. Where that app is absent, its
// download page opens in a new tab instead. Returns whether it was handed off.
bool OpenProtectedMediaInBlanc(BrowserWindowInterface* browser) {
  auto* active = browser->GetTabStripModel()->GetActiveWebContents();
  if (!active || !ProtectedMediaFor(browser).is_dict()) return false;
  const GURL url = active->GetLastCommittedURL();
  const bool installed = ElectronBlancAvailable();
  DismissProtectedMedia(browser);
  if (blanc::BlancTestLaunch()) {
    TestProtectedHandoffs().Append(base::DictValue().Set("url", url.spec()).Set("handedOff", installed));
  }
  if (!installed) {
    chrome::AddAndReturnTabAt(browser, GURL("https://blanc.day/download"), -1, true);
    return false;
  }
#if BUILDFLAG(IS_MAC)
  if (!blanc::BlancTestLaunch()) blanc::OpenInElectronBlanc(url);
#endif
  return true;
}

class ProtectedMediaObserver : public page_load_metrics::PageLoadMetricsObserver {
 public:
  ProtectedMediaObserver() = default;
  ~ProtectedMediaObserver() override = default;
  ObservePolicy OnFencedFramesStart(content::NavigationHandle* navigation_handle,
                                    const GURL& currently_committed_url) override;
  ObservePolicy OnPrerenderStart(content::NavigationHandle* navigation_handle,
                                 const GURL& currently_committed_url) override;
  ObservePolicy OnCommit(content::NavigationHandle* navigation_handle) override;
  void OnFeaturesUsageObserved(content::RenderFrameHost* rfh,
                               const std::vector<blink::UseCounterFeature>& features) override;
};

// A new page starts without the notice: it belongs to the page that asked,
// not to everything the tab shows on that site afterwards.
page_load_metrics::PageLoadMetricsObserver::ObservePolicy ProtectedMediaObserver::OnCommit(
    content::NavigationHandle* navigation_handle) {
  auto* contents = GetDelegate().GetWebContents();
  if (contents && contents->GetUserData(&kProtectedMediaKey)) {
    contents->RemoveUserData(&kProtectedMediaKey);
    RefreshOwnersOf(contents);
  }
  return CONTINUE_OBSERVING;
}

page_load_metrics::PageLoadMetricsObserver::ObservePolicy ProtectedMediaObserver::OnFencedFramesStart(
    content::NavigationHandle* navigation_handle, const GURL& currently_committed_url) {
  return STOP_OBSERVING;
}

page_load_metrics::PageLoadMetricsObserver::ObservePolicy ProtectedMediaObserver::OnPrerenderStart(
    content::NavigationHandle* navigation_handle, const GURL& currently_committed_url) {
  return STOP_OBSERVING;
}

void ProtectedMediaObserver::OnFeaturesUsageObserved(content::RenderFrameHost* rfh,
                                                     const std::vector<blink::UseCounterFeature>& features) {
  for (const auto& feature : features) {
    if (feature.type() == blink::mojom::UseCounterFeatureType::kWebFeature &&
        feature.value() == static_cast<blink::UseCounterFeature::EnumValue>(
                               blink::mojom::WebFeature::kEncryptedMediaSecureOrigin)) {
      NoteProtectedMedia(GetDelegate().GetWebContents());
      return;
    }
  }
}
