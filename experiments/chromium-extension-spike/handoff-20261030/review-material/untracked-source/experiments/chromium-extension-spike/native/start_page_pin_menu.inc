// Tab-menu view of the same per-profile pin list used by the Start Page.
base::DictValue StartPinMenuState(Profile* profile, content::WebContents* tab) {
  bool pinned = false, full = false, enabled = false;
  const GURL url = tab->GetLastCommittedURL();
  auto* prefs = profile->GetPrefs();
  const bool available = !profile->IsOffTheRecord() && prefs &&
      prefs->FindPreference(kStartPagePinsPref);
  if (available) {
    auto pins = SanitizeStartPins(prefs->GetList(kStartPagePinsPref));
    full = pins.size() >= kStartPageMaxPins;
    for (const auto& item : pins)
      if (*item.GetDict().FindString("url") == url.spec()) pinned = true;
    enabled = !tab->IsLoading() && !tab->GetController().GetPendingEntry() &&
              tab->GetVisibleURL() == url &&
              url.is_valid() && url.SchemeIsHTTPOrHTTPS() && (pinned || !full);
  }
  base::DictValue state;
  state.Set("pinned", pinned);
  state.Set("full", full);
  state.Set("enabled", enabled);
  state.Set("url", url.spec());
  return state;
}
bool ToggleStartPinFromTab(Profile* profile, content::WebContents* tab,
                           const std::string& expected_url) {
  if (profile->IsOffTheRecord() || tab->IsLoading() ||
      tab->GetController().GetPendingEntry() ||
      tab->GetVisibleURL() != tab->GetLastCommittedURL() ||
      tab->GetLastCommittedURL().spec() != expected_url)
    return false;
  auto* prefs = profile->GetPrefs();
  if (!prefs || !prefs->FindPreference(kStartPagePinsPref)) return false;
  base::DictValue candidate;
  candidate.Set("url", expected_url);
  candidate.Set("title", base::UTF16ToUTF8(tab->GetTitle()));
  auto target = SanitizeStartPin(base::Value(std::move(candidate)));
  if (!target) return false;
  const auto* target_url = target->FindString("url");
  auto pins = SanitizeStartPins(prefs->GetList(kStartPagePinsPref));
  base::ListValue rest;
  bool found = false;
  for (const auto& item : pins) {
    if (*item.GetDict().FindString("url") == *target_url) found = true;
    else rest.Append(item.Clone());
  }
  if (!found && pins.size() >= kStartPageMaxPins) return false;
  base::ListValue next;
  if (!found) next.Append(std::move(*target));
  for (const auto& item : rest) next.Append(item.Clone());
  prefs->SetList(kStartPagePinsPref, std::move(next));
  prefs->CommitPendingWrite();
  return true;
}
