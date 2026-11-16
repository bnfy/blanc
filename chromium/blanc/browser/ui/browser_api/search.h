// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_SEARCH_H_
#define BLANC_BROWSER_UI_BROWSER_API_SEARCH_H_

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/time/time.h"
#include "base/scoped_observation.h"
#include "blanc/browser/ui/browser_api/bang_icons.h"
#include "blanc/browser/ui/modules/custom_template.h"
#include "blanc/buildflags.h"
#include "blanc/common/browser_api/browser_api.mojom.h"
#include "components/prefs/pref_change_registrar.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

class BrowserWindowInterface;
class PrefService;
class TemplateURLService;
namespace network { class SimpleURLLoader; }

namespace blanc::browser_api {

// The shipping view of Chromium's search engine choice: a stock engine,
// "custom" for Blanc's own entry, or "" for an engine shipping has no name for
// (set by policy, an extension or chrome://settings).
blanc::custom_search::Settings SelectedSearch(TemplateURLService* service);

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
// Under --blanc-test a fixture stands in for the provider, as shipping's
// setTestSearchSuggestionFixture does; every request that would have been
// sent is recorded with its credentials mode.
struct TestSuggestionRequest {
  std::string engine;
  std::string query;
  std::string url;
  std::string credentials;
};
std::optional<std::vector<std::string>>& TestSuggestionFixture();
std::vector<TestSuggestionRequest>& TestSuggestionRequests();
#endif

// The contract's "search" group: address-bar suggestions from the selected
// engine under shipping v1.45.1's rules (src/main/main.js
// chrome:search-suggestions, src/main/search-suggestions.js). Typed text
// leaves the device only for a stock engine, with suggestions on, from a
// normal tab, for eligible text without a bang; requests carry no cookies,
// refuse redirects and are bounded in time and size. Bang state comes from
// the profile's preferences (bangs.h) and is pushed on every change.
class Search : public mojom::Search, public bang_icons::Service::Observer {
 public:
  using BrowserGetter = base::RepeatingCallback<BrowserWindowInterface*()>;
  Search(BrowserGetter browser, mojo::PendingReceiver<mojom::Search> receiver,
         mojo::PendingRemote<mojom::SearchClient> client);
  Search(const Search&) = delete;
  Search& operator=(const Search&) = delete;
  ~Search() override;

  // mojom::Search:
  void SearchSuggestions(const std::string& query, SearchSuggestionsCallback callback) override;
  void Bangs(BangsCallback callback) override;
  void BangIcons(const std::vector<std::string>& hosts, BangIconsCallback callback) override;

  // bang_icons::Service::Observer:
  void OnBangIconChanged(const std::string& host, const std::optional<std::string>& icon) override;

 private:
  struct Engine {
    std::string id;
    std::string label;
  };
  struct Cached {
    std::vector<std::string> suggestions;
    base::TimeTicks expires;
  };
  std::optional<Engine> CurrentEngine();
  bool SuggestionsOn();
  void Finish(const Engine& engine, std::vector<std::string> suggestions);
  void OnResponse(Engine engine, std::string key, std::optional<std::string> body);
  PrefService* Prefs();
  void OnBangPrefsChanged();

  BrowserGetter browser_;
  mojo::Receiver<mojom::Search> receiver_;
  mojo::Remote<mojom::SearchClient> client_;
  // One request in flight, as shipping aborts the previous one per window.
  std::unique_ptr<network::SimpleURLLoader> loader_;
  SearchSuggestionsCallback pending_;
  std::map<std::string, Cached> cache_;
  std::vector<std::string> cache_order_;
  PrefChangeRegistrar bang_prefs_;
  base::ScopedObservation<bang_icons::Service, bang_icons::Service::Observer> bang_icon_observation_{this};
  base::WeakPtrFactory<Search> weak_factory_{this};
};

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_SEARCH_H_
