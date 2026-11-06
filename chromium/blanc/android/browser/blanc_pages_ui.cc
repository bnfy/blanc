// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/android/browser/blanc_pages_ui.h"
#include "blanc/android/browser/sync_start_data.h"

#include <algorithm>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/memory/ref_counted_memory.h"
#include "base/memory/weak_ptr.h"
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
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/common/bookmark_metrics.h"
#include "components/prefs/pref_service.h"
#include "components/history/core/browser/history_service.h"
#include "components/history/core/browser/history_types.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/version_info/version_info.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "services/network/public/mojom/content_security_policy.mojom.h"
#include "ui/base/models/tree_node_iterator.h"
#include "url/gurl.h"

// blocker_proxy.h needs the blocker's mojom, which this target (inside webui:configs) can't depend on.
namespace blanc {
const char* BlockerHealth();
}

namespace blanc::android {
namespace {

// The pages Android 1.0 opens (tools/android-pages.mjs PAGES).
constexpr std::string_view kPages[] = {"newtab", "bookmarks", "history", "shortcuts", "error", "mahjong"};

// What each page may ask in A1. bridges.json grants more; the rest reject
// with "not-yet" until the milestone that adds them (STATUS.md).
constexpr std::pair<std::string_view, std::string_view> kAnswered[] = {
    {"newtab", "appVersion"},          {"newtab", "start.data"},
    {"newtab", "start.topSites"},      {"newtab", "start.focusGroup"},
    {"newtab", "start.layoutUsed"},    {"newtab", "start.openIsland"},
    {"newtab", "bookmarks.list"},      {"newtab", "bookmarks.clearFavicon"},
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
  ~PagesHandler() override = default;

  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "blancPages", base::BindRepeating(&PagesHandler::OnCall, base::Unretained(this)));
  }

  void OnJavascriptDisallowed() override {
    weak_factory_.InvalidateWeakPtrs();
    tracker_.TryCancelAll();
  }

 private:
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
    if (method == "appVersion") return Reply(id, true, base::Value(version_info::GetVersionNumber()));
    if (method == "start.data") return Reply(id, true, base::Value(StartData()));
    if (method == "start.topSites" || method == "shortcuts.list") return Reply(id, true, base::Value(base::ListValue()));
    if (method == "bookmarks.list") return Reply(id, true, base::Value(Favorites(Bookmarks())));
    if (method == "bookmarks.capabilities")
      return Reply(id, true, base::Value(base::DictValue().Set("editable", true).Set("import", false).Set("pins", false)));
    if (method == "bookmarks.remove") return RemoveFavorite(id, args);
    if (method == "history.list") return ListHistory(id, args);
    if (method == "history.remove") return RemoveHistory(id, args);
    if (method == "history.clear") return ClearHistory(id);
    // start.focusGroup, start.layoutUsed, start.openIsland, bookmarks.clearFavicon
    // and mahjong.played have nothing to do on Android yet.
    Done(id);
  }

  bookmarks::BookmarkModel* Bookmarks() { return BookmarkModelFactory::GetForBrowserContext(profile()); }
  history::HistoryService* History() {
    return HistoryServiceFactory::GetForProfile(profile(), ServiceAccessType::EXPLICIT_ACCESS);
  }

  // The iPhone's startData: Billboard, no groups or counters, the Favorites.
  base::DictValue StartData() {
    return base::DictValue()
        .Set("groups", base::ListValue())
        .Set("blockedThisWeek", 0)
        .Set("layout", "billboard")
        .Set("topSites", base::ListValue())
        .Set("wallpaperVisible", true)
        .Set("dynamicWallpaperEnabled", false)
        // The iPhone's Start Page script shows this state in place of a count.
        .Set("mobileAdblockEnabled",
             profile()->GetOriginalProfile()->GetPrefs()->GetBoolean("blanc.blocking.enabled") &&
                 std::string_view(::blanc::BlockerHealth()) != "unavailable")
        // A private Start Page gets neither, as on desktop.
        .Set("remoteDevices", profile()->IsOffTheRecord() ? base::ListValue() : ::blanc::SyncRemoteDevices())
        .Set("sentItems", profile()->IsOffTheRecord() ? base::ListValue() : ::blanc::SyncSentItems())
        .Set("bookmarks", Favorites(Bookmarks()))
        .Set("appearance", base::DictValue()
                               .Set("settings", base::DictValue())
                               .Set("hasImage", false)
                               .Set("image", base::Value()));
  }

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
        scoped_refptr<base::RefCountedMemory> bytes = pages_resources::Find(file);
        if (!bytes || !file.ends_with(".html") || PageOf(GURL("chrome://blanc/" + file)).empty())
          return std::move(callback).Run(std::move(bytes));
        // Every page loads the iPhone's Start Page rules and the adapter first.
        std::string html(base::as_string_view(*bytes));
        const size_t head = html.find("<head>");
        if (head == std::string::npos) return std::move(callback).Run(nullptr);
        html.insert(head + 6, "<script src=\"ios-start-rules.js\"></script>"
                              "<script src=\"android-pages-adapter.js\"></script>");
        std::move(callback).Run(base::MakeRefCounted<base::RefCountedString>(std::move(html)));
      }));
  web_ui->AddMessageHandler(std::make_unique<PagesHandler>());
}

PagesUI::~PagesUI() = default;

WEB_UI_CONTROLLER_TYPE_IMPL(PagesUI)

}  // namespace blanc::android
