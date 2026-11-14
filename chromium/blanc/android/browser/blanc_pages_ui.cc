// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/android/browser/blanc_pages_ui.h"
#include "blanc/android/browser/sync_start_data.h"

#include <algorithm>
#include <initializer_list>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/ref_counted_memory.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/scoped_observation.h"
#include "base/strings/string_util.h"
#include "base/strings/string_view_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/cancelable_task_tracker.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "base/values.h"
#include "blanc/android/pages_resources/pages_resources.h"
#include "chrome/browser/bookmarks/bookmark_model_factory.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/history/history_service_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/common/bookmark_metrics.h"
#include "components/prefs/pref_change_registrar.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "components/history/core/browser/history_service.h"
#include "components/history/core/browser/history_types.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/version_info/version_info.h"
#include "content/public/browser/page_navigator.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "services/network/public/mojom/content_security_policy.mojom.h"
#include "ui/base/models/tree_node_iterator.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"

// blocker_proxy.h needs the blocker's mojom, which this target (inside webui:configs) can't depend on.
namespace content {
class BrowserContext;
}
namespace blanc {
const char* BlockerHealth();
base::DictValue BlockedThisWeek(content::BrowserContext* context);
}

namespace blanc::android {
namespace {

// The pages Android 1.0 opens (tools/android-pages.mjs PAGES).
constexpr std::string_view kPages[] = {"newtab", "bookmarks", "history", "shortcuts", "error", "mahjong"};

// What each page may ask over window.bowserPages. bridges.json grants more; the rest reject with
// "not-yet" until the milestone that adds them (STATUS.md). The Start Page is the desktop fork's
// and asks over its own channel instead (OnStartCall).
constexpr std::pair<std::string_view, std::string_view> kAnswered[] = {
    {"bookmarks", "bookmarks.list"},   {"bookmarks", "bookmarks.capabilities"},
    {"bookmarks", "bookmarks.remove"}, {"bookmarks", "bookmarks.clearFavicon"},
    {"history", "history.list"},       {"history", "history.remove"},
    {"history", "history.clear"},      {"shortcuts", "shortcuts.list"},
    {"mahjong", "mahjong.played"},
};

// Shipping's languages; anything else reads English, as on desktop.
constexpr std::string_view kLocales[] = {"de", "es", "fr", "it", "pt-BR"};

// "history" for chrome://blanc/history.html; empty for anything else.
std::string PageOf(const GURL& url) {
  if (!url.SchemeIs("chrome") || url.host() != kPagesHost) return {};
  std::string_view path = url.path();
  if (!path.starts_with('/') || !path.ends_with(".html")) return {};
  path = path.substr(1, path.size() - 6);
  return std::ranges::find(kPages, path) == std::end(kPages) ? std::string() : std::string(path);
}

std::string StringsFile() {
  const std::string locale = g_browser_process->GetApplicationLocale();
  for (std::string_view candidate : kLocales) {
    if (base::EqualsCaseInsensitiveASCII(locale, candidate) ||
        (candidate.size() == 2 && locale.starts_with(std::string(candidate) + "-")))
      return "strings." + std::string(candidate) + ".js";
  }
  return "strings.en.js";
}

// The language the fork's Start Page catalog (start/strings.js) shows, as its ui-language.js pin:
// the one the other pages' strings.<code>.js is in.
std::string UiLanguage() {
  const std::string file = StringsFile();
  return file.substr(8, file.size() - 11);
}

int64_t Millis(base::Time time) { return time.InMillisecondsSinceUnixEpoch(); }

base::ListValue Favorites(bookmarks::BookmarkModel* model) {
  base::ListValue list;
  if (!model || !model->loaded()) return list;
  ui::TreeNodeIterator<const bookmarks::BookmarkNode> it(model->root_node());
  while (it.has_next()) {
    const bookmarks::BookmarkNode* node = it.Next();
    if (!node->is_url()) continue;
    const bookmarks::BookmarkNode* parent = node->parent();
    const double added = Millis(node->date_added());
    list.Append(base::DictValue()
                    .Set("id", node->uuid().AsLowercaseString())
                    .Set("url", node->url().spec())
                    .Set("title", base::UTF16ToUTF8(node->GetTitle()))
                    .Set("favicon", base::Value())
                    .Set("folder", parent && !parent->is_permanent_node()
                                       ? base::Value(base::UTF16ToUTF8(parent->GetTitle()))
                                       : base::Value())
                    .Set("addedAt", added)
                    .Set("updatedAt", added));
  }
  return list;
}

// window.bowserPages' calls, as the iPhone's PagesBridge answers them.
class PagesHandler : public content::WebUIMessageHandler {
 public:
  PagesHandler() = default;
  PagesHandler(const PagesHandler&) = delete;
  PagesHandler& operator=(const PagesHandler&) = delete;
  ~PagesHandler() override { Open().erase(this); }

  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "blancPages", base::BindRepeating(&PagesHandler::OnCall, base::Unretained(this)));
    // The Start Page is the desktop fork's, and its own adapter asks over the fork's channel.
    web_ui()->RegisterMessageCallback(
        "blancNewTab", base::BindRepeating(&PagesHandler::OnStartCall, base::Unretained(this)));
    Open().insert(this);
  }

  // Every open Start Page hears when other devices' lists change. Private ones never do.
  static void StartListsChanged() {
    for (PagesHandler* handler : Open()) handler->PushStartLists();
  }

  void OnJavascriptDisallowed() override {
    weak_factory_.InvalidateWeakPtrs();
    tracker_.TryCancelAll();
  }

 private:
  static std::set<PagesHandler*>& Open() {
    static base::NoDestructor<std::set<PagesHandler*>> open;
    return *open;
  }
  void PushStartLists() {
    if (!IsJavascriptAllowed() || profile()->IsOffTheRecord()) return;
    if (IsStartPage()) {
      StartEvent("remoteTabs");
      StartEvent("sentItems");
      return;
    }
    CallJavascriptFunction("__blancEmit", base::Value("start.onRemoteTabs"), base::Value(::blanc::SyncRemoteDevices()));
    CallJavascriptFunction("__blancEmit", base::Value("start.onSentItems"), base::Value(::blanc::SyncSentItems()));
  }
  Profile* profile() { return Profile::FromWebUI(web_ui()); }

  void Reply(int id, bool ok, base::Value payload) {
    if (IsJavascriptAllowed())
      CallJavascriptFunction("__blancResolve", base::Value(id), base::Value(ok), payload);
  }
  void Done(int id) { Reply(id, true, base::Value()); }

  // [id, group or null, method, args]
  void OnCall(const base::ListValue& message) {
    AllowJavascript();
    if (message.size() != 4 || !message[0].is_int() || !message[2].is_string() || !message[3].is_list())
      return;
    const int id = message[0].GetInt();
    const std::string method = message[1].is_string()
        ? message[1].GetString() + "." + message[2].GetString() : message[2].GetString();
    const std::string page = PageOf(web_ui()->GetWebContents()->GetLastCommittedURL());
    if (page.empty() || std::ranges::find(kAnswered, std::pair<std::string_view, std::string_view>(page, method)) ==
                            std::end(kAnswered)) {
      Reply(id, false, base::Value("not-yet"));
      return;
    }
    const base::ListValue& args = message[3].GetList();
    if (method == "shortcuts.list") return Reply(id, true, base::Value(base::ListValue()));
    if (method == "bookmarks.list") return Reply(id, true, base::Value(Favorites(Bookmarks())));
    if (method == "bookmarks.capabilities")
      return Reply(id, true, base::Value(base::DictValue().Set("editable", true).Set("import", false).Set("pins", false)));
    if (method == "bookmarks.remove") return RemoveFavorite(id, args);
    if (method == "history.list") return ListHistory(id, args);
    if (method == "history.remove") return RemoveHistory(id, args);
    if (method == "history.clear") return ClearHistory(id);
    // bookmarks.clearFavicon and mahjong.played have nothing to do on Android yet.
    Done(id);
  }

  bookmarks::BookmarkModel* Bookmarks() { return BookmarkModelFactory::GetForBrowserContext(profile()); }
  history::HistoryService* History() {
    return HistoryServiceFactory::GetForProfile(profile(), ServiceAccessType::EXPLICIT_ACCESS);
  }

  // ---- The Start Page (A5b): the desktop fork's page, answered over its blancNewTab protocol ----

  bool IsStartPage() { return PageOf(web_ui()->GetWebContents()->GetLastCommittedURL()) == "newtab"; }
  // A private Start Page shares the regular profile's widgets and clock, as the fork's does.
  PrefService* StartPrefs() { return profile()->GetOriginalProfile()->GetPrefs(); }

  void StartReply(const std::string& id, bool ok, base::Value value) {
    if (IsJavascriptAllowed())
      CallJavascriptFunction("blancNewTabReply", base::Value(id), base::Value(ok), value);
  }
  // Tells this Start Page to read one kind of its data again (the fork adapter's refreshers).
  void StartEvent(const char* kind) {
    if (IsJavascriptAllowed() && IsStartPage()) CallJavascriptFunction("blancNewTabEvent", base::Value(kind));
  }

  // Every open Start Page follows a change to the widgets, the clock or Favorites at once.
  void WatchStart() {
    if (start_prefs_.prefs()) return;
    start_prefs_.Init(StartPrefs());
    start_prefs_.Add(kStartWidgets, base::BindRepeating(&PagesHandler::StartEvent, base::Unretained(this), "widgets"));
    start_prefs_.Add(kStartClock, base::BindRepeating(&PagesHandler::StartEvent, base::Unretained(this), "clock"));
    bookmarks::BookmarkModel* model = Bookmarks();
    if (model && !bookmark_observation_.IsObserving()) bookmark_observation_.Observe(model);
  }

  // [id, method, args], as the fork's newtab-adapter.js sends them.
  void OnStartCall(const base::ListValue& message) {
    AllowJavascript();
    if (message.size() != 3 || !message[0].is_string() || !message[1].is_string() || !message[2].is_list()) return;
    const std::string& id = message[0].GetString();
    if (!IsStartPage()) return StartReply(id, false, base::Value("Not the Start Page"));
    WatchStart();
    const std::string& method = message[1].GetString();
    const base::ListValue& args = message[2].GetList();
    const bool off_the_record = profile()->IsOffTheRecord();

    if (method == "clockRead" && args.empty()) return StartReply(id, true, base::Value(StartClock()));
    if (method == "clockWrite" && args.size() == 1 && args[0].is_dict()) {
      base::DictValue update = SanitizeClockUpdate(args[0].GetDict());
      if (!update.empty()) {
        ScopedDictPrefUpdate saved(StartPrefs(), kStartClock);
        for (auto [key, value] : update) saved->Set(key, value.Clone());
        StartPrefs()->CommitPendingWrite();
      }
      return StartReply(id, true, base::Value(StartClock()));
    }
    // Billboard is the one layout (V24).
    if ((method == "layoutRead" && args.empty()) ||
        ((method == "layoutWrite" || method == "layoutInitialize") && args.size() == 1 && args[0].is_string()))
      return StartReply(id, true, base::Value("billboard"));
    if (method.starts_with("widgets")) return StartWidgets(id, method, args);

    if (method == "bookmarks" && args.empty()) {
      bookmarks::BookmarkModel* model = Bookmarks();
      // null tells the page the model is still loading; it asks again.
      return StartReply(id, true, model && model->loaded() ? base::Value(Favorites(model)) : base::Value());
    }
    // Android has no ranked sites, pinned shortcuts or tab groups on the Start Page yet.
    if (method == "topSites" || method == "groupsRead") return StartReply(id, true, base::Value(base::ListValue()));
    if (method == "pinsList")
      return StartReply(id, true, base::Value(base::DictValue().Set("max", 8).Set("pins", base::ListValue())));
    if (method == "pinsPin")
      return StartReply(id, true, base::Value(base::DictValue().Set("ok", false).Set("reason", "unavailable")));
    if (method == "pinsUnpin" || method == "focusGroup" || method == "openIsland")
      return StartReply(id, true, base::Value(false));
    // A private Start Page gets nothing from other devices, as on desktop.
    if (method == "remoteDevices")
      return StartReply(id, true, base::Value(off_the_record ? base::ListValue() : ::blanc::SyncRemoteDevices()));
    if (method == "sentItems")
      return StartReply(id, true, base::Value(off_the_record ? base::ListValue() : ::blanc::SyncSentItems()));
    if ((method == "openSent" || method == "dismissSent") && args.size() == 1 && args[0].is_string()) {
      if (!off_the_record) ::blanc::SyncSentAction(args[0].GetString(), method == "openSent");
      return StartReply(id, true, base::Value(!off_the_record));
    }
    // The line under the clock: the week's blocks, which the blocker records for the regular profile.
    if (method == "blockedWeek")
      return StartReply(id, true, off_the_record ? base::Value() : base::Value(::blanc::BlockedThisWeek(profile())));
    if (method == "openMahjong") {
      const bool background = args.size() == 1 && args[0].is_bool() && args[0].GetBool();
      // A private Start Page's game stays private, as its link says (blanc://mahjong/?private=1).
      OpenPage(off_the_record ? "mahjong.html?private=1" : "mahjong.html",
               background ? WindowOpenDisposition::NEW_BACKGROUND_TAB : WindowOpenDisposition::NEW_FOREGROUND_TAB);
      return StartReply(id, true, base::Value(true));
    }
    // The Favorites heading opens Android's Favorites page, in this tab.
    if (method == "openSheet" && args.size() == 1 && args[0].is_string() && args[0].GetString() == "bookmarks") {
      OpenPage("bookmarks.html", WindowOpenDisposition::CURRENT_TAB);
      return StartReply(id, true, base::Value(true));
    }
    // Desktop's installed browser themes, the Island's band, Patron, the moving-in checklist and
    // What's New have no Android counterpart: the page shows none of them.
    if (method == "installedTheme" && args.size() == 1 && args[0].is_string())
      return StartReply(id, true, args[0].GetString().empty() ? base::Value() : base::Value(base::DictValue()));
    if (method == "islandBackdrop")
      return StartReply(id, true, base::Value(base::DictValue().Set("band", 0).Set("rail", 0)));
    if (method == "firstRun" || method == "patronCallout" || method == "checklist" || method == "whatsNew" ||
        method == "patronCalloutDismiss" || method == "checklistDismiss" || method == "whatsNewDismiss" ||
        method == "layoutUsed")
      return StartReply(id, true, base::Value());
    if (method == "launchSunrise") return StartReply(id, true, base::Value(false));
    // Onboarding, the default browser, Settings from the page and imports come later (A5c).
    StartReply(id, false, base::Value("not-yet"));
  }

  // `page` is a file the WebUI serves, with any query.
  void OpenPage(const char* page, WindowOpenDisposition disposition) {
    const GURL url(std::string("chrome://") + kPagesHost + "/" + page);
    web_ui()->GetWebContents()->OpenURL(
        content::OpenURLParams(url, content::Referrer(), disposition, ui::PAGE_TRANSITION_AUTO_BOOKMARK, false),
        /*navigation_handle_callback=*/{});
  }

  // The clock Android draws: what was saved, over the iPhone's first-run clock (StartAppearanceStore
  // defaults, #1331: Roboto Flex at its tallest, weight 450), which is never saved, so a later
  // default reaches everyone who never changed it. Always solid (#1504).
  base::DictValue StartClock() {
    base::DictValue clock = base::DictValue()
                                .Set("newtabClockFont", "flex")
                                .Set("newtabClockHeight", 300)
                                .Set("newtabClockWeight", 450);
    for (auto [key, value] : StartPrefs()->GetDict(kStartClock)) clock.Set(key, value.Clone());
    clock.Set("newtabClockStyle", "solid");
    return clock;
  }

  // The fork's SanitizeClockUpdate (billboard_clock_settings.inc) without the style: Android never
  // writes one, so a Glass chosen elsewhere stays for the devices that draw it.
  static base::DictValue SanitizeClockUpdate(const base::DictValue& input) {
    base::DictValue out;
    const auto pick = [&](const char* key, std::initializer_list<std::string_view> allowed) {
      const std::string* value = input.FindString(key);
      if (value && std::ranges::find(allowed, *value) != allowed.end()) out.Set(key, *value);
    };
    pick("newtabClockFont", {"instrument", "condensed", "inter", "flex"});
    pick("newtabClockColor", {"auto", "sage", "sky", "iris", "rose", "clay", "sand", "slate", "graphite"});
    const auto integer = [&](const char* key, int min, int max) {
      const std::optional<int> value = input.FindInt(key);
      if (value && *value >= min && *value <= max) out.Set(key, *value);
    };
    integer("newtabClockWeight", 100, 1000);
    integer("newtabClockTone", 0, 100);
    integer("newtabClockHeight", 100, 300);
    return out;
  }

  // The Start Page's widgets (V24, V26): blanc_prototype_ui.cc's handler, on Android's profile. A
  // phone that never chose starts with none, as a new desktop profile does.
  void StartWidgets(const std::string& id, const std::string& method, const base::ListValue& args) {
    static constexpr std::string_view kNames[] = {"favorites", "devices", "shortcuts"};
    static constexpr std::string_view kCards[] = {"favorites", "devices", "sent"};
    static constexpr int kSizes[] = {240, 360, 480, 600, 720};
    const auto named = [](std::string_view name) { return std::ranges::find(kNames, name) != std::end(kNames); };
    const auto card = [](std::string_view name) { return std::ranges::find(kCards, name) != std::end(kCards); };
    const auto size = [](int value) { return std::ranges::find(kSizes, value) != std::end(kSizes); };
    const auto sizable = [](std::string_view name) { return name == "favorites" || name == "devices"; };
    PrefService* prefs = StartPrefs();
    if (!prefs->GetDict(kStartWidgets).FindInt("v")) {
      prefs->SetDict(kStartWidgets, base::DictValue().Set("v", 1).Set("favorites", false).Set("devices", false)
                                        .Set("shortcuts", false).Set("from", "android"));
    }
    // Where each card sits: unknown or repeated names dropped, a missing card back on its default side.
    const auto place = [&](const base::ListValue* left, const base::ListValue* right) {
      base::ListValue l, r;
      std::set<std::string> seen;
      const auto take = [&](const base::ListValue* from, base::ListValue& to) {
        if (!from) return;
        for (const base::Value& item : *from) {
          if (item.is_string() && card(item.GetString()) && seen.insert(item.GetString()).second)
            to.Append(item.GetString());
        }
      };
      take(left, l);
      take(right, r);
      for (std::string_view name : kCards) {
        if (!seen.contains(std::string(name))) (sizable(name) ? l : r).Append(name);
      }
      return base::DictValue().Set("left", std::move(l)).Set("right", std::move(r));
    };
    if (method == "widgetsWrite") {
      if (args.size() != 2 || !args[0].is_string() || !args[1].is_bool() || !named(args[0].GetString()))
        return StartReply(id, false, base::Value("Unknown Start Page widget"));
      ScopedDictPrefUpdate next(prefs, kStartWidgets);
      next->Set(args[0].GetString(), args[1].GetBool());
      // The old 6-or-12 switch sets the count it stood for.
      if (args[0].GetString() == "shortcuts") next->Set("shortcutCount", args[1].GetBool() ? 12 : 6);
    } else if (method == "widgetsShortcuts") {
      if (args.size() != 1 || !args[0].is_int() || args[0].GetInt() < 1 || args[0].GetInt() > 12)
        return StartReply(id, false, base::Value("Shortcuts are 1 to 12"));
      ScopedDictPrefUpdate next(prefs, kStartWidgets);
      next->Set("shortcutCount", args[0].GetInt());
      next->Set("shortcuts", args[0].GetInt() == 12);
    } else if (method == "widgetsSize") {
      if (args.size() != 2 || !args[0].is_string() || !args[1].is_int() || !sizable(args[0].GetString()) ||
          (args[1].GetInt() != 0 && !size(args[1].GetInt())))
        return StartReply(id, false, base::Value("Unknown card size"));
      ScopedDictPrefUpdate next(prefs, kStartWidgets);
      base::DictValue* sizes = next->EnsureDict("sizes");
      if (args[1].GetInt()) sizes->Set(args[0].GetString(), args[1].GetInt());
      else sizes->Remove(args[0].GetString());
    } else if (method == "widgetsPlace") {
      if (args.size() != 2 || !args[0].is_list() || !args[1].is_list())
        return StartReply(id, false, base::Value("Unknown card place"));
      ScopedDictPrefUpdate next(prefs, kStartWidgets);
      next->Set("place", place(&args[0].GetList(), &args[1].GetList()));
    } else if (method != "widgetsRead" || !args.empty()) {
      return StartReply(id, false, base::Value("not-yet"));
    }
    // A choice is on disk at once, as in the fork: Android may end the app without warning.
    if (method != "widgetsRead") prefs->CommitPendingWrite();
    const base::DictValue& saved = prefs->GetDict(kStartWidgets);
    base::DictValue out;
    for (std::string_view name : kNames) out.Set(name, saved.FindBool(name).value_or(false));
    // A count saved by the stepper, else what the old switch stood for.
    const std::optional<int> count = saved.FindInt("shortcutCount");
    out.Set("shortcutCount",
            count && *count >= 1 && *count <= 12 ? *count : saved.FindBool("shortcuts").value_or(false) ? 12 : 6);
    const base::DictValue* saved_place = saved.FindDict("place");
    out.Set("place", place(saved_place ? saved_place->FindList("left") : nullptr,
                           saved_place ? saved_place->FindList("right") : nullptr));
    base::DictValue sizes;
    if (const base::DictValue* stored = saved.FindDict("sizes")) {
      for (auto [name, value] : *stored) {
        if (sizable(name) && value.is_int() && size(value.GetInt())) sizes.Set(name, value.GetInt());
      }
    }
    out.Set("sizes", std::move(sizes));
    StartReply(id, true, base::Value(std::move(out)));
  }

  // Favorites changed (the Island's heart, the Favorites page, Sync): the Start Page reads them again.
  class FavoritesWatch : public bookmarks::BaseBookmarkModelObserver {
   public:
    explicit FavoritesWatch(PagesHandler* handler) : handler_(handler) {}
    void BookmarkModelChanged() override { handler_->StartEvent("bookmarks"); }

   private:
    raw_ptr<PagesHandler> handler_;
  };

  void RemoveFavorite(int id, const base::ListValue& args) {
    bookmarks::BookmarkModel* model = Bookmarks();
    const base::Uuid uuid = args.size() && args[0].is_string() ? base::Uuid::ParseLowercase(args[0].GetString()) : base::Uuid();
    const bookmarks::BookmarkNode* node = model && model->loaded() && uuid.is_valid()
        ? model->GetNodeByUuid(uuid, bookmarks::BookmarkModel::NodeTypeForUuidLookup::kLocalOrSyncableNodes)
        : nullptr;
    if (node && node->is_url()) model->Remove(node, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
    Done(id);
  }

  // history.list({query, limit}): every visit, newest first, as desktop lists them.
  void ListHistory(int id, const base::ListValue& args) {
    history::HistoryService* history = History();
    if (!history) return Reply(id, true, base::Value(base::ListValue()));
    const base::DictValue* options = args.size() && args[0].is_dict() ? &args[0].GetDict() : nullptr;
    const std::string* query = options ? options->FindString("query") : nullptr;
    const double limit = options ? options->FindDouble("limit").value_or(500) : 500;
    history::QueryOptions query_options;
    query_options.max_count = std::clamp(static_cast<int>(limit), 1, 5000);
    query_options.duplicate_policy = history::QueryOptions::KEEP_ALL_DUPLICATES;
    history->QueryHistory(base::UTF8ToUTF16(query ? *query : std::string()), query_options,
                          base::BindOnce(&PagesHandler::OnHistory, weak_factory_.GetWeakPtr(), id), &tracker_);
  }

  void OnHistory(int id, history::QueryResults results) {
    base::ListValue list;
    for (const history::URLResult& result : results) {
      list.Append(base::DictValue()
                      .Set("url", result.url().spec())
                      .Set("title", base::UTF16ToUTF8(result.title()))
                      .Set("visitedAt", static_cast<double>(Millis(result.visit_time())))
                      .Set("favicon", base::Value()));
    }
    Reply(id, true, base::Value(std::move(list)));
  }

  // history.remove(url, visitedAt): that one visit.
  void RemoveHistory(int id, const base::ListValue& args) {
    history::HistoryService* history = History();
    const GURL url(args.size() > 1 && args[0].is_string() ? args[0].GetString() : std::string());
    if (!history || !url.is_valid() || !(args[1].is_int() || args[1].is_double())) return Done(id);
    history::ExpireHistoryArgs visit;
    visit.urls = {url};
    visit.begin_time = base::Time::FromMillisecondsSinceUnixEpoch(static_cast<int64_t>(args[1].GetDouble()));
    visit.end_time = visit.begin_time + base::Milliseconds(1);
    history->ExpireHistory({visit}, base::BindOnce(&PagesHandler::Done, weak_factory_.GetWeakPtr(), id), &tracker_);
  }

  void ClearHistory(int id) {
    history::HistoryService* history = History();
    if (!history) return Done(id);
    history->ExpireHistoryBetween({}, std::nullopt, base::Time(), base::Time::Max(), /*user_initiated=*/true,
                                  base::BindOnce(&PagesHandler::Done, weak_factory_.GetWeakPtr(), id), &tracker_);
  }

  static constexpr char kStartWidgets[] = "blanc.start.widgets";  // patch 0113
  static constexpr char kStartClock[] = "blanc.start.clock";      // patch 0113
  PrefChangeRegistrar start_prefs_;
  FavoritesWatch favorites_watch_{this};
  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BaseBookmarkModelObserver> bookmark_observation_{
      &favorites_watch_};
  base::CancelableTaskTracker tracker_;
  base::WeakPtrFactory<PagesHandler> weak_factory_{this};
};

}  // namespace

PagesUIConfig::PagesUIConfig() : DefaultWebUIConfig("chrome", kPagesHost) {}

PagesUI::PagesUI(content::WebUI* web_ui) : content::WebUIController(web_ui) {
  auto* source = content::WebUIDataSource::CreateAndAdd(Profile::FromWebUI(web_ui), kPagesHost);
  // Shipping's pages carry their own CSPs and, like the iPhone's, use no
  // Trusted Types: the adapter sets a script's src.
  source->OverrideContentSecurityPolicy(network::mojom::CSPDirectiveName::RequireTrustedTypesFor, "");
  source->OverrideContentSecurityPolicy(network::mojom::CSPDirectiveName::TrustedTypes, "");
  source->SetRequestFilter(
      base::BindRepeating([](const std::string&) { return true; }),
      base::BindRepeating([](const std::string& path, content::WebUIDataSource::GotDataCallback callback) {
        // The private Start Page and Mahjong deals carry a query; nothing else does.
        const std::string file = path.substr(0, path.find_first_of("?#"));
        if (file == "strings.js") return std::move(callback).Run(pages_resources::Find(StringsFile()));
        // The fork's Start Page reads its language from this before its all-language catalog
        // (start/strings.js): the one Android's other pages are in.
        if (file == "ui-language.js") {
          return std::move(callback).Run(base::MakeRefCounted<base::RefCountedString>(
              "window.__blancUiLanguage=\"" + UiLanguage() + "\";\n"));
        }
        // The fork's Start Page is served only as the Start Page, at newtab.html.
        if (file.starts_with("start/") && file.ends_with(".html")) return std::move(callback).Run(nullptr);
        const bool start_page = file == "newtab.html";
        scoped_refptr<base::RefCountedMemory> bytes = pages_resources::Find(start_page ? "start/newtab.html" : file);
        if (!bytes || !file.ends_with(".html") || PageOf(GURL("chrome://blanc/" + file)).empty())
          return std::move(callback).Run(std::move(bytes));
        std::string html(base::as_string_view(*bytes));
        const size_t head = html.find("<head>");
        if (head == std::string::npos) return std::move(callback).Run(nullptr);
        // The Start Page's own files load from start/, Android's phone script and stylesheet first.
        // Every other page loads the adapter first.
        html.insert(head + 6, start_page ? "<base href=\"start/\"><script src=\"/android-start.js\"></script>"
                                           "<link rel=\"stylesheet\" href=\"/android-start.css\">"
                                         : "<script src=\"android-pages-adapter.js\"></script>");
        std::move(callback).Run(base::MakeRefCounted<base::RefCountedString>(std::move(html)));
      }));
  web_ui->AddMessageHandler(std::make_unique<PagesHandler>());
}

PagesUI::~PagesUI() = default;

WEB_UI_CONTROLLER_TYPE_IMPL(PagesUI)

void PushStartLists() {
  PagesHandler::StartListsChanged();
}

}  // namespace blanc::android

namespace blanc {
void SyncStartListsChanged() {
  android::PushStartLists();
}
}  // namespace blanc
