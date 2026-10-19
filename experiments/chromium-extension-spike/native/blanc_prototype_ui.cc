// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "chrome/browser/ui/blanc_prototype_ui.h"
#include "chrome/browser/ui/blanc_webstore_promotion.h"
#include "chrome/common/chrome_isolated_world_ids.h"

#include <algorithm>
#include <memory>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/i18n/case_conversion.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/json/string_escape.h"
#include "base/memory/ref_counted_memory.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/supports_user_data.h"
#include "base/task/cancelable_task_tracker.h"
#include "base/task/thread_pool.h"
#include "base/task/bind_post_task.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "base/scoped_observation.h"
#include "base/strings/stringprintf.h"
#include "base/values.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/sessions/tab_restore_service_factory.h"
#include "chrome/browser/ui/browser_live_tab_context.h"
#include "components/sessions/core/tab_restore_service.h"
#include "chrome/browser/bookmarks/bookmark_model_factory.h"
#include "chrome/browser/history/history_service_factory.h"
#include "chrome/browser/history/top_sites_factory.h"
#include "chrome/browser/ui/browser_window/public/global_browser_collection.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/browser/url_and_title.h"
#include "components/bookmarks/common/bookmark_metrics.h"
#include "components/history/core/browser/history_service.h"
#include "components/history/core/browser/history_types.h"
#include "components/history/core/browser/top_sites.h"
#include "components/history/core/browser/top_sites_observer.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/input/native_web_keyboard_event.h"
#include "content/public/browser/favicon_status.h"
#include "content/public/browser/navigation_entry.h"
#include "content/public/browser/web_contents_delegate.h"
#include "third_party/blink/public/mojom/frame/find_in_page.mojom.h"
#include "ui/views/controls/webview/unhandled_keyboard_event_handler.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/exclusive_access/exclusive_access_manager.h"
#include "chrome/browser/ui/exclusive_access/fullscreen_controller.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "components/tabs/public/tab_group.h"
#include "chrome/browser/ui/tabs/tab_group_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "components/tab_groups/tab_group_color.h"
#include "components/tab_groups/tab_group_id.h"
#include "components/tab_groups/tab_group_visual_data.h"
#include "chrome/browser/ui/toolbar/toolbar_actions_model.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/toolbar/toolbar_view.h"
#include "chrome/browser/ui/views/extensions/extensions_toolbar_desktop.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/view_targeter.h"
#include "ui/views/view_targeter_delegate.h"
#include "ui/gfx/range/range.h"
#include "components/sessions/content/session_tab_helper.h"
#include "components/viz/common/frame_sinks/copy_output_result.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/render_widget_host.h"
#include "content/public/browser/render_widget_host_observer.h"
#include "third_party/blink/public/common/input/web_input_event.h"
#include "ui/views/widget/widget.h"
#include "third_party/skia/include/core/SkColorSpace.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/web_ui_message_handler.h"
#include "services/network/public/mojom/content_security_policy.mojom.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/webui/web_ui_util.h"
#include "ui/gfx/image/image.h"
#include "ui/gfx/image/image_skia.h"
#include "ui/gfx/image/image_skia_rep.h"
#include "chrome/browser/ui/toolbar/toolbar_action_view_model.h"
#include "ui/views/controls/webview/webview.h"
#include "url/gurl.h"

namespace blanc_prototype {
namespace {
constexpr char kOwnerKey[] = "blanc-prototype-owner";
constexpr int kIslandViewId = 0x424c;
// Electron's Quick Switcher asks for 300 entries; the bridge never returns more.
constexpr int kHistoryLimit = 300;
constexpr size_t kFavoritesLimit = 1000;
// Electron's validFolder(): trimmed, 1–100 UTF-16 units.
constexpr size_t kFolderMaxLength = 100;
// Favicons are small by construction; anything larger is not a favicon.
constexpr int kFaviconMaxSide = 64;

// Favorites and history are web pages only, as in Electron.
bool IsFavoritable(const GURL& url) {
  return url.SchemeIsHTTPOrHTTPS();
}

// The regular profile's bookmarks, once loaded. Private windows get none:
// Electron never populates Favorites from private tabs, and Chromium shares
// the regular model with incognito, so the guard lives here, not in the model.
bookmarks::BookmarkModel* LoadedBookmarkModel(Profile* profile) {
  if (!profile || profile->IsOffTheRecord()) return nullptr;
  auto* model = BookmarkModelFactory::GetForBrowserContext(profile);
  return model && model->loaded() ? model : nullptr;
}

// A bounded PNG data URL for a cached favicon, or "" when there is none.
// No network fetch happens here: the image is whatever Chromium already has.
std::string FaviconDataUrl(const gfx::Image& image) {
  if (image.IsEmpty()) return std::string();
  const SkBitmap bitmap = image.AsBitmap();
  if (bitmap.drawsNothing() || bitmap.width() > kFaviconMaxSide ||
      bitmap.height() > kFaviconMaxSide) {
    return std::string();
  }
  return webui::GetBitmapDataUrl(bitmap);
}

base::Value NullableString(const std::string& value) {
  return value.empty() ? base::Value() : base::Value(value);
}

// One FavoriteItem (browser-api/contract.json). `folder` is the immediate
// user folder's title; nodes directly under a permanent node are ungrouped.
// GetFavicon() returns the cached image and schedules a load when there is
// none yet; BookmarkNodeFaviconChanged then refreshes open start pages.
base::DictValue FavoriteRecord(bookmarks::BookmarkModel* model,
                               const bookmarks::BookmarkNode* node) {
  const auto* parent = node->parent();
  const bool in_folder = parent && !parent->is_permanent_node();
  const std::u16string title = node->GetTitle();
  return base::DictValue()
      .Set("id", base::NumberToString(node->id()))
      .Set("url", node->url().spec())
      .Set("title", title.empty() ? node->url().spec() : base::UTF16ToUTF8(title))
      .Set("favicon", NullableString(FaviconDataUrl(model->GetFavicon(node))))
      .Set("addedAt", node->date_added().InMillisecondsFSinceUnixEpoch())
      .Set("folder", in_folder ? base::Value(base::UTF16ToUTF8(parent->GetTitle()))
                               : base::Value());
}

void CollectFavorites(bookmarks::BookmarkModel* model,
                      const bookmarks::BookmarkNode* node,
                      base::ListValue& items) {
  for (const auto& child : node->children()) {
    if (items.size() >= kFavoritesLimit) return;
    if (child->is_folder()) {
      CollectFavorites(model, child.get(), items);
    } else if (child->is_url() && IsFavoritable(child->url())) {
      items.Append(FavoriteRecord(model, child.get()));
    }
  }
}

// Every bookmark in the profile, in Chromium's own order (bar, other, mobile;
// folders flattened in place), capped. An unloaded model lists nothing.
base::ListValue ListFavorites(bookmarks::BookmarkModel* model) {
  base::ListValue items;
  if (model) CollectFavorites(model, model->root_node(), items);
  return items;
}

// Electron's folderKey(): trimmed, case-insensitive. Returns nullopt for a
// name Electron's validFolder() would reject, so the caller writes nothing.
std::optional<std::u16string> ValidFolderName(const std::string& folder) {
  std::u16string trimmed;
  base::TrimWhitespace(base::UTF8ToUTF16(folder), base::TRIM_ALL, &trimmed);
  if (trimmed.empty() || trimmed.size() > kFolderMaxLength) return std::nullopt;
  return trimmed;
}

// `/save <folder>` targets a folder directly under Other bookmarks, matched
// like Electron (Work and work are one folder), created at the end if absent.
const bookmarks::BookmarkNode* FindOrCreateFolder(bookmarks::BookmarkModel* model,
                                                  const std::u16string& name) {
  const auto* parent = model->other_node();
  const std::u16string key = base::i18n::ToLower(name);
  for (const auto& child : parent->children()) {
    if (child->is_folder() && base::i18n::ToLower(child->GetTitle()) == key)
      return child.get();
  }
  return model->AddFolder(parent, parent->children().size(), name);
}

// Toggle semantics, defined before any removal: a page is a Favorite while
// any user bookmark carries its exact URL. Turning it off removes every such
// node across folders (Chromium's own star bubble Remove does the same, and
// Electron's store holds one entry per URL), and never removes a folder, even
// one it empties. Managed or otherwise non-user-editable nodes are left alone.
bool ToggleFavorite(bookmarks::BookmarkModel* model, const GURL& url,
                    const std::u16string& title) {
  if (model->IsBookmarked(url)) {
    for (int guard = 0; guard < 64; ++guard) {
      const auto* node = model->GetMostRecentlyAddedUserNodeForURL(url);
      if (!node) break;
      model->Remove(node, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
    }
    return model->IsBookmarked(url);
  }
  const auto* parent = model->other_node();
  model->AddNewURL(parent, parent->children().size(),
                   title.empty() ? base::UTF8ToUTF16(url.spec()) : title, url);
  return true;
}

// `/save [folder]`, mirroring Electron's applySaveFavorite(): add-only; an
// already saved page is a no-op for a bare save and moves for a named folder;
// an invalid folder name writes nothing.
bool SaveFavorite(bookmarks::BookmarkModel* model, const GURL& url,
                  const std::u16string& title, const std::string& folder) {
  const bool wants_folder = !folder.empty();
  std::optional<std::u16string> name;
  if (wants_folder) {
    name = ValidFolderName(folder);
    if (!name) return model->IsBookmarked(url);
  }
  if (model->IsBookmarked(url)) {
    const auto* node = model->GetMostRecentlyAddedUserNodeForURL(url);
    if (node && name) {
      const auto* target = FindOrCreateFolder(model, *name);
      if (node->parent() != target)
        model->Move(node, target, target->children().size());
    }
    return true;
  }
  const auto* parent = name ? FindOrCreateFolder(model, *name) : model->other_node();
  model->AddNewURL(parent, parent->children().size(),
                   title.empty() ? base::UTF8ToUTF16(url.spec()) : title, url);
  return true;
}

// Blanc groups have names, not colours (lowercase labels, at most 40 UTF-16
// units, like Electron's groupTabByName). Chromium's TabGroupId::ToString()
// is the opaque GroupId the Island sees; colour is fixed and never shown.
constexpr size_t kGroupNameMaxLength = 40;
constexpr tab_groups::TabGroupColorId kGroupColor = tab_groups::TabGroupColorId::kGrey;

// Stable mapping from Blanc's eight presets to Chromium's persisted palette.
const char* GroupColor(tab_groups::TabGroupColorId color) {
  switch (color) {
    case tab_groups::TabGroupColorId::kGreen: return "#426c4c";
    case tab_groups::TabGroupColorId::kBlue: return "#376694";
    case tab_groups::TabGroupColorId::kPurple: return "#6757a3";
    case tab_groups::TabGroupColorId::kPink: return "#9b4761";
    case tab_groups::TabGroupColorId::kOrange: return "#974f2a";
    case tab_groups::TabGroupColorId::kYellow: return "#815c02";
    case tab_groups::TabGroupColorId::kCyan: return "#576471";
    case tab_groups::TabGroupColorId::kRed: return "#3a3a3a";
    default: return "";
  }
}

std::u16string GroupName(const std::string& raw) {
  std::u16string trimmed;
  base::TrimWhitespace(base::UTF8ToUTF16(raw), base::TRIM_ALL, &trimmed);
  return trimmed.substr(0, kGroupNameMaxLength);
}

// Groups in cluster order (first tab index), the order Blanc's panel uses.
std::vector<tab_groups::TabGroupId> GroupsInOrder(TabStripModel* model) {
  std::vector<tab_groups::TabGroupId> groups;
  if (!model->SupportsTabGroups()) return groups;
  for (int i = 0; i < model->count(); ++i) {
    const auto group = model->GetTabGroupForTab(i);
    if (group && std::find(groups.begin(), groups.end(), *group) == groups.end())
      groups.push_back(*group);
  }
  return groups;
}

std::optional<tab_groups::TabGroupId> FindGroup(TabStripModel* model,
                                                const std::string& id) {
  for (const auto& group : GroupsInOrder(model)) {
    if (group.ToString() == id) return group;
  }
  return std::nullopt;
}

const tab_groups::TabGroupVisualData* GroupVisuals(TabStripModel* model,
                                                   const tab_groups::TabGroupId& group) {
  auto* record = model->group_model()->GetTabGroup(group);
  return record ? record->visual_data() : nullptr;
}

// Session-only, exact-host policy owned by each regular or private profile.
class SiteMutePolicy : public base::SupportsUserData::Data {
 public:
  std::set<std::string> hosts;
};
SiteMutePolicy* SitePolicy(Profile* profile) {
  static constexpr char key[] = "blanc-site-mutes";
  if (!profile->GetUserData(key)) profile->SetUserData(key, std::make_unique<SiteMutePolicy>());
  return static_cast<SiteMutePolicy*>(profile->GetUserData(key));
}
std::string AudioHost(content::WebContents* contents) {
  const GURL& url = contents->GetLastCommittedURL();
  return url.SchemeIsHTTPOrHTTPS() ? std::string(url.host()) : std::string();
}
class SiteMuteTab : public base::SupportsUserData::Data,
                    public content::WebContentsObserver {
 public:
  explicit SiteMuteTab(content::WebContents* contents)
      : content::WebContentsObserver(contents), manual_(contents->IsAudioMuted()) { Apply(); }
  static SiteMuteTab* Get(content::WebContents* contents) {
    static constexpr char key[] = "blanc-site-mute-tab";
    if (!contents->GetUserData(key)) contents->SetUserData(key, std::make_unique<SiteMuteTab>(contents));
    return static_cast<SiteMuteTab*>(contents->GetUserData(key));
  }
  bool SiteMuted() const {
    return SitePolicy(Profile::FromBrowserContext(web_contents()->GetBrowserContext()))->hosts.contains(AudioHost(web_contents()));
  }
  void Apply(bool reset = false) {
    const auto host = AudioHost(web_contents());
    if (reset || host != host_) exempt_ = false;
    host_ = host;
    web_contents()->SetAudioMuted(manual_ || (SiteMuted() && !exempt_));
  }
  void ToggleTab() {
    if (web_contents()->IsAudioMuted()) { manual_ = false; exempt_ = SiteMuted(); }
    else manual_ = true;
    Apply();
  }
  void PrimaryPageChanged(content::Page&) override { Apply(); }
 private:
  bool manual_ = false;
  bool exempt_ = false;
  std::string host_;
};

// Like Electron's faux header, use the mode of the rendered top two rows.
// Only the active, visible page is sampled. Pixels never leave this process.
class Owner : public base::SupportsUserData::Data,
              public content::WebContentsObserver,
              public content::RenderWidgetHost::InputEventObserver,
              public content::RenderWidgetHostObserver,
              public TabStripModelObserver {
 public:
  explicit Owner(BrowserWindowInterface* value) : browser(value) {
    browser->GetTabStripModel()->AddObserver(this);
  }
  raw_ptr<BrowserWindowInterface> browser;
  raw_ptr<views::WebView> view = nullptr;
  int height = 68;
  bool vertical = false;
  int rail_width = 248;
  gfx::Rect extension_bounds;
  gfx::Rect interactive_bounds;
  std::string page_tint;

  // The tab's committed favicon as a data URL, encoded once per distinct
  // image rather than on every 300ms snapshot. Private windows report none,
  // as Electron does for private tabs.
  std::string TabFavicon(int tab_id, content::WebContents* contents) {
    if (browser->GetProfile()->IsOffTheRecord()) return std::string();
    // NavigationEntry::GetFavicon() is non-const; the status is read only.
    auto* entry = contents->GetController().GetLastCommittedEntry();
    const content::FaviconStatus* status =
        entry && entry->GetFavicon().valid ? &entry->GetFavicon() : nullptr;
    if (!status || status->image.IsEmpty()) {
      favicon_cache_.erase(tab_id);
      return std::string();
    }
    const std::string key = base::StringPrintf(
        "%s#%u", status->url.spec().c_str(),
        status->image.AsBitmap().getGenerationID());
    auto& cached = favicon_cache_[tab_id];
    if (cached.first != key) cached = {key, FaviconDataUrl(status->image)};
    return cached.second;
  }
  void PruneFaviconCache(const std::set<int>& live_tab_ids) {
    std::erase_if(favicon_cache_, [&](const auto& entry) {
      return !live_tab_ids.contains(entry.first);
    });
  }

  // Search belongs only to this window's active WebContents. The request ID
  // is installed synchronously before Find can reply (including empty pages).
  void FindText(const std::string& query, bool forward, bool new_session) {
    SyncActive();
    if (!web_contents()) return;
    auto options = blink::mojom::FindOptions::New();
    options->forward = forward;
    options->match_case = false;
    options->new_session = new_session || find_request_ < 0 || find_query_ != query;
    if (options->new_session) { find_matches_ = 0; find_ordinal_ = 0; }
    find_query_ = query;
    web_contents()->Find(base::UTF8ToUTF16(query), std::move(options),
        /*skip_delay=*/false, [this](int id) { find_request_ = id; });
  }
  void StopFind(bool reset_ui = false) {
    const bool had_find = find_request_ >= 0;
    find_request_ = -1;
    find_query_.clear();
    find_matches_ = find_ordinal_ = 0;
    if (had_find && web_contents())
      web_contents()->StopFinding(content::STOP_FIND_ACTION_CLEAR_SELECTION);
    if (reset_ui) FindEvent(u"window.BlancPrototypeHost?.findReset()");
  }

  void SyncActive() {
    if (closing_) return;
    auto* active = browser->GetTabStripModel()->GetActiveWebContents();
    if (active != web_contents()) {
      StopFind(true);
      Observe(active);
      ResetTint();
      SuppressStorePromotion();
    }
    ObserveInput();
    if (!timer_.IsRunning() && !in_flight_ && CanSample()) RequestSample();
  }

 private:
  void FindEvent(const std::u16string& script) {
    auto* host = view ? view->GetWebContents() : nullptr;
    if (host && host->GetLastCommittedURL() == GURL("chrome://blanc-prototype/host.html") &&
        host->GetPrimaryMainFrame()->IsRenderFrameLive())
      host->GetPrimaryMainFrame()->ExecuteJavaScript(script, base::NullCallback());
  }
  void DidReceiveFindReply(int request_id, int matches, const gfx::Rect&,
                           int ordinal, bool final_update) override {
    if (find_request_ < 0 || request_id != find_request_ || !web_contents() ||
        browser->GetTabStripModel()->GetActiveWebContents() != web_contents()) return;
    if (matches >= 0) find_matches_ = matches;
    if (ordinal >= 0) find_ordinal_ = ordinal;
    FindEvent(base::UTF8ToUTF16(base::StringPrintf(
        "window.BlancPrototypeHost?.findResult(%d,%d,%d,%s)",
        sessions::SessionTabHelper::IdForTab(web_contents()).id(),
        find_ordinal_, find_matches_, final_update ? "true" : "false")));
  }
  int find_request_ = -1;
  int find_matches_ = 0;
  int find_ordinal_ = 0;
  std::string find_query_;
  bool CanTint() const {
    if (closing_ || !web_contents() || browser->GetProfile()->IsOffTheRecord()) return false;
    const auto& url = web_contents()->GetPrimaryMainFrame()->GetLastCommittedURL();
    return url.SchemeIsHTTPOrHTTPS() || url.SchemeIs("chrome-extension") ||
        url == GURL("chrome://blanc-prototype/pages/newtab.html");
  }
  bool CanSample() const {
    return CanTint() &&
        browser->GetTabStripModel()->GetActiveWebContents() == web_contents() &&
        !web_contents()->IsLoading() &&
        web_contents()->GetVisibility() == content::Visibility::VISIBLE &&
        view && view->GetVisible() && view->GetWidget() &&
        view->GetWidget()->IsVisible() && !view->GetWidget()->IsMinimized();
  }
  void Publish(const std::string& color) {
    if (page_tint == color) return;
    page_tint = color;
    auto* host = view ? view->GetWebContents() : nullptr;
    if (!host || !web_contents() || host->GetLastCommittedURL() !=
        GURL("chrome://blanc-prototype/host.html") ||
        !host->GetPrimaryMainFrame()->IsRenderFrameLive()) return;
    host->GetPrimaryMainFrame()->ExecuteJavaScript(
        base::UTF8ToUTF16(base::StringPrintf(
            "window.BlancPrototypeHost?.pageTint(%d, %s)",
            sessions::SessionTabHelper::IdForTab(web_contents()).id(),
            base::GetQuotedJSONString(color).c_str())), base::NullCallback());
  }
  void ResetTint() {
    ++generation_;
    timer_.Stop();
    // theme-color is provisional; rendered pixels are authoritative.
    const auto theme = CanTint() ? web_contents()->GetThemeColor() : std::nullopt;
    Publish(theme ? Hex(*theme) : "");
    RequestSample();
  }
  static std::string Hex(SkColor color) {
    return base::StringPrintf("#%02x%02x%02x", SkColorGetR(color),
                              SkColorGetG(color), SkColorGetB(color));
  }
  void RequestSample() {
    burst_until_ = base::TimeTicks::Now() + base::Milliseconds(2400);
    Arm(base::Milliseconds(80));
  }
  void Arm(base::TimeDelta interval) {
    if (in_flight_ || !CanSample()) return;
    const auto delay = std::max(base::TimeDelta(),
        last_sample_ + interval - base::TimeTicks::Now());
    timer_.Start(FROM_HERE, delay, this, &Owner::Sample);
  }
  void Sample() {
    if (in_flight_ || !CanSample()) return;
    last_sample_ = base::TimeTicks::Now();
    auto* surface = web_contents()->GetRenderWidgetHostView();
    if (!surface || !surface->IsSurfaceAvailableForCopy() ||
        surface->GetViewBounds().IsEmpty()) {
      Arm(base::Seconds(1));
      return;
    }
    in_flight_ = true;
    surface->CopyFromSurface(
        gfx::Rect(0, 0, surface->GetViewBounds().width(), 2), gfx::Size(),
        base::Seconds(1), base::BindPostTaskToCurrentDefault(base::BindOnce(
            &Owner::SampleReady, weak_factory_.GetWeakPtr(), generation_)));
  }
  void SampleReady(int generation, const content::CopyFromSurfaceResult& result) {
    in_flight_ = false;
    // A navigation, hidden/closed tab or tab switch invalidates pending pixels.
    if (generation == generation_ && CanSample() && result.has_value()) {
      // Capture pixels carry the display color space. CSS hex is sRGB;
      // reading raw components would tint the header differently on P3 Macs.
      SkBitmap bitmap;
      if (result->bitmap.drawsNothing() ||
          !bitmap.tryAllocPixels(SkImageInfo::MakeN32Premul(
              result->bitmap.width(), result->bitmap.height(),
              SkColorSpace::MakeSRGB())) ||
          !result->bitmap.readPixels(bitmap.pixmap())) {
        Arm(base::Seconds(1));
        return;
      }
      std::map<SkColor, int> counts;
      for (int y = 0; y < bitmap.height(); ++y)
        for (int x = 0; x < bitmap.width(); x += 4)
          ++counts[bitmap.getColor(x, y)];
      int best_count = 0;
      SkColor best = SK_ColorTRANSPARENT;
      for (int y = 0; y < bitmap.height(); ++y) {
        for (int x = 0; x < bitmap.width(); x += 4) {
          const SkColor color = bitmap.getColor(x, y);
          if (counts[color] > best_count) {
            best = color;
            best_count = counts[color];
          }
        }
      }
      if (best_count && SkColorGetA(best) == SK_AlphaOPAQUE &&
          Hex(best) != page_tint) {
        Publish(Hex(best));
        burst_until_ = std::max(burst_until_,
            base::TimeTicks::Now() + base::Milliseconds(1200));
      }
    }
    Arm(base::TimeTicks::Now() < burst_until_ ? base::Milliseconds(80)
                                           : base::Milliseconds(250));
  }
  void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange&,
                              const TabStripSelectionChange& selection) override {
    for (int i = 0; i < browser->GetTabStripModel()->count(); ++i)
      SiteMuteTab::Get(browser->GetTabStripModel()->GetWebContentsAt(i));
    if (!selection.active_tab_changed()) return;
    SyncActive();
    auto* host = view ? view->GetWebContents() : nullptr;
    if (host && host->GetLastCommittedURL() ==
        GURL("chrome://blanc-prototype/host.html") &&
        host->GetPrimaryMainFrame()->IsRenderFrameLive()) {
      // Native keyboard/tab changes must not wait for the 300ms snapshot poll.
      host->GetPrimaryMainFrame()->ExecuteJavaScript(
          u"window.BlancPrototypeHost?.refresh()", base::NullCallback());
    }
  }
  void OnTabStripModelDestroyed(TabStripModel*) override {
    closing_ = true;
    timer_.Stop();
    weak_factory_.InvalidateWeakPtrs();
    input_observation_.Reset();
    widget_observation_.Reset();
    Observe(nullptr);
  }
  void ObserveInput() {
    auto* surface = web_contents() ? web_contents()->GetRenderWidgetHostView() : nullptr;
    auto* widget = surface ? surface->GetRenderWidgetHost() : nullptr;
    if (widget == input_observation_.GetSource()) return;
    input_observation_.Reset();
    widget_observation_.Reset();
    if (widget) {
      widget_observation_.Observe(widget);
      input_observation_.Observe(widget);
    }
  }
  void OnInputEvent(const content::RenderWidgetHost&,
                    const blink::WebInputEvent& event,
                    InputEventSource) override {
    // Wheel/gesture updates include inertial scrolling, unlike the
    // WebContents interaction callback which only reports scroll start.
    if (event.GetType() != blink::WebInputEvent::Type::kMouseMove)
      RequestSample();
  }
  void RenderWidgetHostDidUpdateVisualProperties(content::RenderWidgetHost*) override {
    RequestSample();
  }
  void RenderWidgetHostDestroyed(content::RenderWidgetHost*) override {
    input_observation_.Reset();
    widget_observation_.Reset();
    ++generation_;
    timer_.Stop();
  }
  void PrimaryPageChanged(content::Page&) override {
    StopFind(true);
    ObserveInput();
    ResetTint();
  }
  void SuppressStorePromotion() {
    if (!web_contents()) return;
    auto* frame = web_contents()->GetPrimaryMainFrame();
    const GURL& url = frame->GetLastCommittedURL();
    if (!frame->IsRenderFrameLive() || url.scheme() != "https" ||
        url.host() != "chromewebstore.google.com" || url.EffectiveIntPort() != 443) return;
    frame->ExecuteJavaScriptInIsolatedWorld(kBlancWebStorePromotion,
        base::NullCallback(), ISOLATED_WORLD_ID_CHROME_INTERNAL);
  }
  void DidStopLoading() override { RequestSample(); SuppressStorePromotion(); }
  void DidFirstVisuallyNonEmptyPaint() override { RequestSample(); SuppressStorePromotion(); }
  void DidGetUserInteraction(const blink::WebInputEvent&) override { RequestSample(); }
  void OnBackgroundColorChanged() override { RequestSample(); }
  void DidChangeThemeColor() override { RequestSample(); }
  void OnVisibilityChanged(content::Visibility visibility) override {
    ++generation_;
    timer_.Stop();
    if (visibility == content::Visibility::VISIBLE) RequestSample();
  }
  void WebContentsDestroyed() override {
    find_request_ = -1;
    FindEvent(u"window.BlancPrototypeHost?.findReset()");
    ++generation_;
    timer_.Stop();
    page_tint.clear();
    input_observation_.Reset();
    widget_observation_.Reset();
    Observe(nullptr);
  }
  int generation_ = 0;
  bool in_flight_ = false;
  bool closing_ = false;
  std::map<int, std::pair<std::string, std::string>> favicon_cache_;
  base::TimeTicks last_sample_;
  base::TimeTicks burst_until_;
  // A small idle check catches CSS/DOM animation starts without injecting
  // scripts into pages; changes and input promote sampling to 80ms bursts.
  base::OneShotTimer timer_;
  base::ScopedObservation<content::RenderWidgetHost,
      content::RenderWidgetHost::InputEventObserver> input_observation_{this};
  base::ScopedObservation<content::RenderWidgetHost,
      content::RenderWidgetHostObserver> widget_observation_{this};
  base::WeakPtrFactory<Owner> weak_factory_{this};
};

bool IsPageFullscreen(BrowserWindowInterface* browser) {
  auto* manager = ExclusiveAccessManager::From(browser);
  return manager && manager->fullscreen_controller()->IsWindowFullscreenForTabOrPending();
}

Owner* GetOwner(content::WebContents* contents) {
  return static_cast<Owner*>(contents->GetUserData(kOwnerKey));
}

// The transparent area beside the rail must remain owned by the web page.
class IslandView : public views::WebView, public views::ViewTargeterDelegate {
 public:
  explicit IslandView(Profile* profile) : views::WebView(profile) {
    SetEventTargeter(std::make_unique<views::ViewTargeter>(this));
  }
  bool DoesIntersectRect(const views::View*, const gfx::Rect& rect) const override {
    auto* owner = GetOwner(const_cast<IslandView*>(this)->GetWebContents());
    if (!owner || !owner->vertical) return GetLocalBounds().Intersects(rect);
    return gfx::Rect(0, 0, width(), 68).Intersects(rect) ||
        gfx::Rect(0, 68, owner->rail_width, std::max(0, height() - 68)).Intersects(rect) ||
        (owner->height > 68 && owner->interactive_bounds.Intersects(rect));
  }
};

// Key equivalents the Island's own renderer leaves unhandled (⌘D, ⌘L, ⌘R, …)
// must reach the window's accelerators and the macOS menu, as they do from a
// tab: BrowserView and Chromium's side-panel WebUI views redispatch through
// UnhandledKeyboardEventHandler; a views::WebView-created WebContents on its
// own drops them, so shortcuts died while the Island had focus. Reserved
// commands (⌘T, ⌘W) are dispatched before the first responder and were never
// affected. Stateless, so one process-wide instance serves every window.
class IslandDelegate : public content::WebContentsDelegate {
 public:
  bool HandleKeyboardEvent(content::WebContents* source,
                           const input::NativeWebKeyboardEvent& event) override {
    auto* owner = GetOwner(source);
    if (!owner || !owner->view) return false;
    return handler_.HandleKeyboardEvent(event, owner->view->GetFocusManager());
  }

 private:
  views::UnhandledKeyboardEventHandler handler_;
};

IslandDelegate* GetIslandDelegate() {
  static base::NoDestructor<IslandDelegate> delegate;
  return delegate.get();
}

bool IsAsset(const std::string& path) {
  static constexpr const char* kAssets[] = {
      "pages/newtab.html", "pages/newtab.js", "pages/close.svg", "pages/newtab-wallpaper.js", "pages/start-site-name.js", "pages/pages.css", "pages/type-to-open.js", "pages/bangs.js", "pages/bangs-catalog.js", "pages/i18n.js", "pages/sunrise-mark.png", "pages/icon-sunrise.png", "pages/icon-sunrise-dark.png", "pages/onboarding-island-dark.png", "pages/onboarding-island-light.png", "pages/start-page-sunrise.png", "pages/start-page-day.png", "pages/start-page-dusk.png", "pages/start-page-night.png", "pages/caveat-latin.woff2", "pages/select-caret.svg", "pages/select-caret-dark.svg", "pages/strings.js", "pages/newtab-adapter.js", "pages/start-page-paint.js", "pages/space-identity.js", "pages/newtab-prototype.css",
      "host.html", "host.js", "host.css", "extensions.js", "extensions.css",
      "icons/search.svg", "icons/settings.svg", "icons/external-link.svg", "icons/chevron-left.svg", "adapter.js", "prototype.css",
      "index.html", "overlay.html", "styles.css", "renderer.js", "overlay.js",
      "strings.js", "i18n.js", "tab-drag.js", "tab-sections.js", "vertical-tabs.js",
      "space-identity.js", "space-picker.js", "workspace-ui.js", "panel-left.svg",
      "sunrise-hero-mark.png", "pages/type-to-open.js", "pages/bangs.js", "pages/bangs-catalog.js",
      "pages/sunrise-favicon-mark.png", "pages/inter-latin.woff2",
      "pages/instrument-sans-latin-wdth-normal.woff2",
      "pages/jetbrains-mono-latin.woff2"};
  return std::ranges::any_of(kAssets,
                            [&](const char* item) { return path == item; });
}

scoped_refptr<base::RefCountedMemory> ReadAsset(base::FilePath root,
                                               std::string path) {
  std::string bytes;
  if (!IsAsset(path) ||
      !base::ReadFileToStringWithMaxSize(root.AppendASCII(path), &bytes,
                                        4 * 1024 * 1024)) {
    return nullptr;
  }
  return base::MakeRefCounted<base::RefCountedString>(std::move(bytes));
}

sessions::TabRestoreService* ClosedService(Profile* profile) {
  if (profile->IsOffTheRecord()) return nullptr;
  auto* service = TabRestoreServiceFactory::GetForProfile(profile);
  if (service) service->LoadTabsFromLastSession();
  return service;
}

base::ListValue ClosedEntries(Profile* profile) {
  base::ListValue result;
  auto* service = ClosedService(profile);
  if (!service) return result;
  // The renderer expects oldest first; Chromium stores newest first.
  for (auto it = service->entries().rbegin(); it != service->entries().rend(); ++it) {
    const auto& entry = **it;
    std::string title;
    std::string url;
    int count = 1;
    using namespace sessions::tab_restore;
    if (entry.type == TAB) {
      const auto& tab = static_cast<const sessions::tab_restore::Tab&>(entry);
      if (tab.navigations.empty()) continue;
      const auto& nav = tab.navigations[tab.normalized_navigation_index()];
      title = base::UTF16ToUTF8(nav.title());
      url = nav.virtual_url().spec();
      if (title.empty()) title = url;
    } else if (entry.type == GROUP) {
      const auto& group = static_cast<const Group&>(entry);
      title = base::UTF16ToUTF8(group.visual_data.title());
      count = group.tabs.size();
      if (title.empty()) title = "Tab group";
    } else if (entry.type == WINDOW) {
      count = static_cast<const Window&>(entry).tabs.size();
      title = "Window";
    } else {
      count = static_cast<const Split&>(entry).tabs.size();
      title = "Split view";
    }
    result.Append(base::DictValue().Set("id", base::NumberToString(entry.id.id()))
        .Set("title", title).Set("url", url).Set("tabCount", count));
  }
  return result;
}

base::DictValue Snapshot(BrowserWindowInterface* browser, Owner* owner) {
  owner->SyncActive();
  auto* model = browser->GetTabStripModel();
  auto* favorites = LoadedBookmarkModel(browser->GetProfile());
  std::set<int> live_tab_ids;
  base::ListValue tabs;
  for (int index = 0; index < model->count(); ++index) {
    auto* contents = model->GetWebContentsAt(index);
    auto* audio = SiteMuteTab::Get(contents);
    auto& controller = contents->GetController();
    const int tab_id = sessions::SessionTabHelper::IdForTab(contents).id();
    live_tab_ids.insert(tab_id);
    // Favorite state follows the committed document, never the virtual or
    // pending URL, so a typed address is not reported as saved before it lands.
    const GURL& committed = contents->GetPrimaryMainFrame()->GetLastCommittedURL();
    const auto group = model->SupportsTabGroups() ? model->GetTabGroupForTab(index)
                                                  : std::nullopt;
    tabs.Append(base::DictValue()
                    .Set("id", tab_id)
                    .Set("url", contents->GetVisibleURL() == GURL("chrome://newtab/") ||
                                  contents->GetLastCommittedURL() == GURL("chrome://blanc-prototype/pages/newtab.html")
                              ? "blanc://newtab/" : contents->GetVisibleURL().spec())
                    .Set("title", base::UTF16ToUTF8(contents->GetTitle()))
                    .Set("favicon", NullableString(owner->TabFavicon(tab_id, contents)))
                    .Set("bookmarked", favorites && IsFavoritable(committed) &&
                                           favorites->IsBookmarked(committed))
                    .Set("pageBg", contents == model->GetActiveWebContents()
                        ? owner->page_tint : "")
                    .Set("isLoading", contents->IsLoading())
                    .Set("canGoBack", controller.CanGoBack())
                    .Set("canGoForward", controller.CanGoForward())
                    .Set("pinned", model->IsTabPinned(index))
                    // Electron reads the same two signals from its WebContents.
                    .Set("muted", contents->IsAudioMuted())
                    .Set("siteMuted", AudioHost(contents).empty() ? base::Value() : base::Value(audio->SiteMuted()))
                    .Set("audible", contents->IsCurrentlyAudible())
                    .Set("private", browser->GetProfile()->IsOffTheRecord())
                    .Set("groupId", group ? base::Value(group->ToString()) : base::Value())
                    .Set("blockedCount", 0));
  }
  owner->PruneFaviconCache(live_tab_ids);
  // Blanc's TabGroup records: {id, name, collapsed}, in cluster order.
  base::ListValue groups;
  for (const auto& group : GroupsInOrder(model)) {
    const auto* visuals = GroupVisuals(model, group);
    groups.Append(base::DictValue()
                      .Set("id", group.ToString())
                      .Set("name", visuals ? base::UTF16ToUTF8(visuals->title()) : "")
                      .Set("color", visuals ? GroupColor(visuals->color()) : "")
                      .Set("collapsed", visuals ? visuals->is_collapsed() : false));
  }
  auto* active = model->GetActiveWebContents();
  base::Value active_id =
      active ? base::Value(sessions::SessionTabHelper::IdForTab(active).id())
             : base::Value();
  auto* browser_view = BrowserView::GetBrowserViewForBrowser(browser);
  // Chromium 157 exposes the concrete Views container only through this
  // accessor. The prototype reparents that view; the new generic interface
  // does not expose view ownership or the toolbar model.
  auto* extensions = browser_view && browser_view->toolbar()
      ? browser_view->toolbar()->extensions_container_for_testing() : nullptr;
  const int extension_width = extensions ? 26 : 0;
  return base::DictValue()
      .Set("extensionsWidth", extension_width)
      .Set("tabs", std::move(tabs))
      .Set("activeTabId", std::move(active_id))
      .Set("groups", std::move(groups))
      .Set("closed", ClosedEntries(browser->GetProfile()))
      .Set("glanceTabId", base::Value())
      .Set("tabLayout", owner->vertical ? "vertical" : "island")
      .Set("verticalTabsWidth", owner->rail_width)
      .Set("verticalTabsPreferredWidth", owner->rail_width)
      .Set("verticalTabsMinWidth", 200).Set("verticalTabsMaxWidth", 360)
      .Set("verticalTabsDefaultWidth", 248)
      .Set("adblockEnabled", false)
      .Set("displayShares", base::ListValue());
}

// Only the bundled top-level start page gets this read-only profile bridge.
// It also watches the bookmark model so a page left open re-lists Favorites
// after the Island, Chromium's manager or a late favicon load changes them,
// and TopSites so recent sites follow history (including /clear) the same way.
class NewTabHandler : public content::WebUIMessageHandler,
                      public bookmarks::BaseBookmarkModelObserver,
                      public history::TopSitesObserver {
 public:
  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback("blancNewTab",
        base::BindRepeating(&NewTabHandler::Handle, base::Unretained(this)));
  }
  void OnJavascriptDisallowed() override {
    weak_factory_.InvalidateWeakPtrs();
    bookmark_observation_.Reset();
    top_sites_observation_.Reset();
    top_sites_.reset();
  }

 private:
  bool IsStartPage() {
    // WebContents returns the virtual chrome://newtab/ URL after rewriting.
    // Authorize against the actual committed top-level document instead.
    return web_ui()->GetWebContents()->GetPrimaryMainFrame()->GetLastCommittedURL() ==
        GURL("chrome://blanc-prototype/pages/newtab.html");
  }
  void Reply(const std::string& id, bool success, base::Value value) {
    if (!IsStartPage() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancNewTabReply", base::Value(id),
                                          base::Value(success), value);
  }
  // BaseBookmarkModelObserver: every structural change funnels here. The page
  // coalesces bursts; this only tells it that Favorites may have changed.
  void BookmarkModelChanged() override { Notify("bookmarks"); }
  void BookmarkNodeFaviconChanged(const bookmarks::BookmarkNode*) override {
    Notify("bookmarks");
  }
  void BookmarkModelBeingDeleted() override { bookmark_observation_.Reset(); }
  // TopSitesObserver: TopSites re-queries after history deletions, so this is
  // how an open start page learns that /clear (or Chromium's own history
  // manager) emptied its recent sites.
  void TopSitesLoaded(history::TopSites*) override {}
  void TopSitesChanged(history::TopSites*, ChangeReason) override { Notify("topSites"); }
  void Notify(const char* kind) {
    if (!IsStartPage() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancNewTabEvent", base::Value(kind));
  }
  void Handle(const base::ListValue& message) {
    if (!IsStartPage() || message.size() != 3 || !message[0].is_string() ||
        !message[1].is_string() || !message[2].is_list()) return;
    AllowJavascript();
    const std::string id = message[0].GetString();
    const std::string method = message[1].GetString();
    const auto& args = message[2].GetList();
    auto* contents = web_ui()->GetWebContents();
    auto* profile = Profile::FromWebUI(web_ui());
    if (profile->IsOffTheRecord()) return;
    if (method == "bookmarks" && args.empty()) {
      auto* model = BookmarkModelFactory::GetForBrowserContext(profile);
      if (model && !bookmark_observation_.IsObserving())
        bookmark_observation_.Observe(model);
      // null tells the page the model is still loading; it retries.
      if (!model || !model->loaded()) { Reply(id, true, base::Value()); return; }
      Reply(id, true, base::Value(ListFavorites(model)));
      return;
    }
    if (method == "topSites" && args.empty()) {
      auto sites = TopSitesFactory::GetForProfile(profile);
      if (!sites) { Reply(id, true, base::Value(base::ListValue())); return; }
      if (!top_sites_observation_.IsObserving()) {
        top_sites_ = sites;  // TopSites is ref-counted; hold it while observing.
        top_sites_observation_.Observe(sites.get());
      }
      sites->GetMostVisitedURLs(base::BindOnce(&NewTabHandler::TopSitesReady,
                                              weak_factory_.GetWeakPtr(), id));
      return;
    }
    if (method == "openIsland" && args.size() == 1 && args[0].is_string() &&
        !args[0].GetString().empty() && args[0].GetString().size() <= 8) {
      auto* browser = GlobalBrowserCollection::GetInstance()->FindBrowserWithTab(contents);
      const bool opened = browser &&
          browser->GetTabStripModel()->GetActiveWebContents() == contents &&
          OpenIsland(browser, true, args[0].GetString());
      Reply(id, opened, base::Value(opened ? "" : "Start page is not active"));
      return;
    }
    Reply(id, false, base::Value("Unsupported start-page request"));
  }
  void TopSitesReady(std::string id, const history::MostVisitedURLList& sites) {
    base::ListValue items;
    for (const auto& site : sites) {
      if (!site.url.SchemeIsHTTPOrHTTPS()) continue;
      items.Append(base::DictValue().Set("url", site.url.spec())
          .Set("key", site.url.host()).Set("title", base::UTF16ToUTF8(site.title)));
    }
    Reply(id, true, base::Value(std::move(items)));
  }
  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver>
      bookmark_observation_{this};
  scoped_refptr<history::TopSites> top_sites_;
  base::ScopedObservation<history::TopSites, history::TopSitesObserver>
      top_sites_observation_{this};
  base::WeakPtrFactory<NewTabHandler> weak_factory_{this};
};

class Handler : public content::WebUIMessageHandler {
 public:
  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback(
        "blancPrototype",
        base::BindRepeating(&Handler::Handle, base::Unretained(this)));
  }
  void OnJavascriptDisallowed() override {
    // A navigated or torn-down host must not receive a late history reply.
    weak_factory_.InvalidateWeakPtrs();
    tracker_.TryCancelAll();
  }

 private:
  bool IsIslandHost() {
    auto* contents = web_ui()->GetWebContents();
    return GetOwner(contents) && contents->GetLastCommittedURL() ==
        GURL("chrome://blanc-prototype/host.html");
  }
  // Every reply, synchronous or not, re-checks the host before touching it.
  void Reply(const std::string& id, bool success, base::Value result) {
    if (!IsIslandHost() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancPrototypeReply", base::Value(id),
                                           base::Value(success), result);
  }
  void HistoryCleared(std::string id) { Reply(id, true, base::Value()); }
  void HistoryReady(std::string id, history::QueryResults results) {
    base::ListValue items;
    for (const history::URLResult& result : results) {
      if (!IsFavoritable(result.url())) continue;
      const std::u16string& title = result.title();
      // favicon is null, not fetched: the Island draws its letter fallback.
      items.Append(base::DictValue()
          .Set("url", result.url().spec())
          .Set("title", title.empty() ? result.url().spec() : base::UTF16ToUTF8(title))
          .Set("visitedAt", result.visit_time().InMillisecondsFSinceUnixEpoch())
          .Set("favicon", base::Value()));
    }
    Reply(id, true, base::Value(std::move(items)));
  }
  void Handle(const base::ListValue& message) {
    if (message.size() != 3 || !message[0].is_string() ||
        !message[1].is_string() || !message[2].is_list()) {
      return;
    }
    AllowJavascript();
    const std::string id = message[0].GetString();
    auto reply = [&](bool success, base::Value result) {
      Reply(id, success, std::move(result));
    };
    auto* contents = web_ui()->GetWebContents();
    auto* owner = GetOwner(contents);
    if (!IsIslandHost()) {
      web_ui()->CallJavascriptFunctionUnsafe("blancPrototypeReply", message[0],
          base::Value(false), base::Value("This bridge belongs to the native Island only."));
      return;
    }
    auto* browser = owner->browser.get();
    auto* model = browser->GetTabStripModel();
    auto* profile = browser->GetProfile();
    const std::string& method = message[1].GetString();
    const base::ListValue& args = message[2].GetList();
    if (method == "snapshot") {
      reply(true, base::Value(Snapshot(browser, owner)));
      return;
    }
    if (method == "reopenClosedTab" || method == "reopenClosedEntry" ||
        method == "forgetClosedEntry" || method == "clearClosedEntries") {
      auto* service = ClosedService(profile);
      if (!service) { reply(true, base::Value(false)); return; }
      if (method == "clearClosedEntries" && args.empty()) {
        service->ClearEntries(); reply(true, base::Value(true)); return;
      }
      auto* context = BrowserLiveTabContext::From(browser);
      if (method == "reopenClosedTab" && args.empty()) {
        reply(true, base::Value(!service->RestoreMostRecentEntry(context).empty()));
        return;
      }
      int entry_id = 0;
      if (args.size() != 1 || !args[0].is_string() ||
          !base::StringToInt(args[0].GetString(), &entry_id) || entry_id <= 0) {
        reply(false, base::Value("Expected a closed entry ID.")); return;
      }
      // Only top-level entries from this profile can be addressed.
      for (const auto& entry : service->entries()) {
        if (entry->id.id() != entry_id) continue;
        const auto id_to_restore = entry->id;
        if (method == "forgetClosedEntry") {
          service->RemoveEntryById(id_to_restore);
          reply(true, base::Value(true));
        } else {
          reply(true, base::Value(service->RestoreEntryById(context, id_to_restore,
              WindowOpenDisposition::NEW_FOREGROUND_TAB).has_value()));
        }
        return;
      }
      reply(true, base::Value(false)); return;
    }
    if (method == "listFavorites" && args.empty()) {
      // A private window or a model still loading lists nothing.
      reply(true, base::Value(ListFavorites(LoadedBookmarkModel(profile))));
      return;
    }
    if (method == "listHistory" && args.size() == 1 && args[0].is_int()) {
      // Never resolve the service through an off-the-record profile: the
      // factory would hand back the regular profile's history.
      auto* service = profile->IsOffTheRecord() ? nullptr
          : HistoryServiceFactory::GetForProfile(profile, ServiceAccessType::EXPLICIT_ACCESS);
      if (!service) { reply(true, base::Value(base::ListValue())); return; }
      history::QueryOptions options;
      options.max_count = std::clamp(args[0].GetInt(), 1, kHistoryLimit);
      options.duplicate_policy = history::QueryOptions::REMOVE_ALL_DUPLICATES;
      service->QueryHistory(std::u16string(), options,
          base::BindOnce(&Handler::HistoryReady, weak_factory_.GetWeakPtr(), id),
          &tracker_);
      return;
    }
    if (method == "clearHistory" && args.empty()) {
      // Electron's /clear empties the history list and nothing else, so this
      // expires every local visit through HistoryService rather than running
      // Chromium's wider Clear browsing data. A private window never clears
      // the regular profile's history, and the service is never resolved
      // through an off-the-record profile. Destructive: test only on a
      // disposable --user-data-dir, never the permanent prototype profile.
      auto* service = profile->IsOffTheRecord() ? nullptr
          : HistoryServiceFactory::GetForProfile(profile, ServiceAccessType::EXPLICIT_ACCESS);
      if (!service) {
        reply(false, base::Value("Clear history from a regular window."));
        return;
      }
      service->ExpireHistoryBetween(
          /*restrict_urls=*/{}, /*restrict_app_id=*/std::nullopt, base::Time(),
          base::Time::Max(), /*user_initiated=*/true,
          base::BindOnce(&Handler::HistoryCleared, weak_factory_.GetWeakPtr(), id),
          &tracker_);
      return;
    }
    if (method == "extensions" && args.empty()) {
      auto* container = BrowserView::GetBrowserViewForBrowser(browser)
                            ->toolbar()->extensions_container_for_testing();
      base::ListValue items;
      auto* active = model->GetActiveWebContents();
      if (container && active) {
        auto* actions = container->GetToolbarViewModel();
        for (const auto& action_id : actions->GetAllActionIds()) {
          auto* action = actions->GetActionModelForId(action_id);
          if (!action) continue;
          const auto icon = action->GetIcon(active, gfx::Size(16, 16));
          items.Append(base::DictValue().Set("id", action_id)
              .Set("name", base::UTF16ToUTF8(action->GetActionName()))
              .Set("title", base::UTF16ToUTF8(action->GetTooltip(active)))
              .Set("enabled", action->IsEnabled(active))
              .Set("icon", icon.IsImage() && !icon.GetImage().IsEmpty()
                  ? webui::GetBitmapDataUrl(icon.GetImage().AsImageSkia().GetRepresentation(2.0f).GetBitmap()) : ""));
        }
      }
      reply(true, base::Value(base::DictValue().Set("items", std::move(items))
          .Set("tabId", active ? sessions::SessionTabHelper::IdForTab(active).id() : -1)));
      return;
    }
    if (method == "extensionAction" && args.size() == 2 &&
        args[0].is_string() && args[1].is_int()) {
      auto* active = model->GetActiveWebContents();
      if (!active || sessions::SessionTabHelper::IdForTab(active).id() != args[1].GetInt() ||
          !contents->GetPrimaryMainFrame()->ConsumeTransientUserActivation()) {
        reply(false, base::Value("Select the extension again on the active tab."));
        return;
      }
      auto* container = BrowserView::GetBrowserViewForBrowser(browser)
                            ->toolbar()->extensions_container_for_testing();
      auto* action = container ? container->GetToolbarViewModel()
          ->GetActionModelForId(args[0].GetString()) : nullptr;
      if (!action || !action->IsEnabled(active)) {
        reply(false, base::Value("This extension is unavailable on the current page."));
        return;
      }
      reply(true, base::Value());
      // Use Chromium's user-action path: activeTab grants, onClicked, popup,
      // side-panel behavior and permissions remain owned by Chromium.
      action->ExecuteUserAction(ToolbarActionViewModel::InvocationSource::kMenuEntry);
      return;
    }
    if (method == "geometry" && args.size() == 8 &&
        std::ranges::all_of(args, [](const auto& v) { return v.is_int(); })) {
      owner->extension_bounds = gfx::Rect(args[0].GetInt(), args[1].GetInt(),
          std::max(0, args[2].GetInt()), std::max(0, args[3].GetInt()));
      owner->interactive_bounds = gfx::Rect(args[4].GetInt(), args[5].GetInt(),
          std::max(0, args[6].GetInt()), std::max(0, args[7].GetInt()));
      if (owner->view->parent()) owner->view->parent()->InvalidateLayout();
      reply(true, base::Value());
      return;
    }
    if (method == "focusPage" && args.empty()) {
      // Escape and outside clicks hand focus back to the page, as Electron's
      // hideOverlay does, instead of parking it in the hidden overlay.
      if (auto* active = model->GetActiveWebContents()) active->Focus();
      reply(true, base::Value());
      return;
    }
    if (method == "rail" && args.size() == 2 && args[0].is_bool() && args[1].is_int()) {
      owner->vertical = args[0].GetBool();
      owner->rail_width = std::clamp(args[1].GetInt(), 200, 360);
      if (owner->view->parent()) owner->view->parent()->InvalidateLayout();
      reply(true, base::Value(owner->rail_width)); return;
    }
    if (method == "height" && args.size() == 1 && args[0].is_int()) {
      // LayoutIsland bounds this requested height to the real window. The
      // summoned palette needs its scrim to reach below the 640px panel.
      owner->height = std::clamp(args[0].GetInt(), 68, 10000);
      if (owner->view->parent()) owner->view->parent()->InvalidateLayout();
      if (owner->height > 68) {
        owner->view->RequestFocus();
        contents->Focus();
      }
      reply(true, base::Value());
      return;
    }
    if (method == "createTab" && args.size() == 1 && args[0].is_string()) {
      const GURL url(args[0].GetString());
      if (!url.SchemeIsHTTPOrHTTPS() && url != GURL("chrome://newtab/") &&
          url != GURL("chrome://extensions/") &&
          url != GURL("chrome://downloads/") &&
          url != GURL("chrome://bookmarks/") &&
          url != GURL("chrome://history/")) {
        reply(false, base::Value("Unsupported prototype destination."));
        return;
      }
      chrome::AddTabAt(browser, url, -1, true);
      reply(true, base::Value());
      return;
    }
    // Group-level commands name a group, not a tab. Group ids are
    // TabGroupId::ToString() values from the snapshot; a stale or foreign id
    // finds nothing and is a no-op, like Electron's per-window group lookup.
    if ((method == "focusGroup" || method == "toggleGroupCollapsed" ||
         method == "closeGroup" || method == "reorderGroup" ||
         method == "renameGroup" || method == "setGroupColor" ||
         method == "newTabInGroup" || method == "ungroupGroup" ||
         method == "moveGroupToNewWindow") &&
        !args.empty() && args[0].is_string()) {
      const auto group = FindGroup(model, args[0].GetString());
      if (!group) {
        reply(true, base::Value(false));
        return;
      }
      const auto* visuals = GroupVisuals(model, *group);
      const gfx::Range range = model->group_model()->GetTabGroup(*group)->ListTabs();
      if (method == "renameGroup" && args.size() == 2 && args[1].is_string() && visuals) {
        const auto name = GroupName(args[1].GetString());
        bool duplicate = false;
        for (const auto& other : GroupsInOrder(model)) {
          const auto* data = GroupVisuals(model, other);
          if (other != *group && data && base::i18n::ToLower(data->title()) == base::i18n::ToLower(name)) duplicate = true;
        }
        if (name.empty() || duplicate) {
          reply(true, base::Value(base::DictValue().Set("ok", false).Set("error", duplicate ? "duplicate" : "empty")));
          return;
        }
        model->ChangeTabGroupVisuals(*group, tab_groups::TabGroupVisualData(name, visuals->color(), visuals->is_collapsed()));
        reply(true, base::Value(base::DictValue().Set("ok", true)));
        return;
      }
      if (method == "setGroupColor" && args.size() == 2 && visuals && (args[1].is_string() || args[1].is_none())) {
        auto color = kGroupColor;
        const std::string requested = args[1].is_string() ? args[1].GetString() : "";
        bool found = requested.empty();
        for (int i = 0; i <= 8; ++i) {
          const auto candidate = static_cast<tab_groups::TabGroupColorId>(i);
          if (requested == GroupColor(candidate)) { color = candidate; found = true; }
        }
        if (!found) { reply(false, base::Value("Unknown group color.")); return; }
        model->ChangeTabGroupVisuals(*group, tab_groups::TabGroupVisualData(visuals->title(), color, visuals->is_collapsed()));
        reply(true, base::Value(true));
        return;
      }
      if (method == "newTabInGroup" && args.size() == 1) {
        chrome::AddTabAt(browser, GURL("chrome://newtab/"), static_cast<int>(range.end()), true);
        model->AddToExistingGroup({model->active_index()}, *group);
        reply(true, base::Value(true));
        return;
      }
      if (method == "ungroupGroup" && args.size() == 1) {
        std::vector<int> indices;
        for (unsigned i = range.start(); i < range.end(); ++i) indices.push_back(static_cast<int>(i));
        model->RemoveFromGroup(indices);
        reply(true, base::Value(true));
        return;
      }
      if (method == "moveGroupToNewWindow" && args.size() == 1) {
        if (static_cast<int>(range.length()) == model->count()) { reply(true, base::Value(false)); return; }
        chrome::MoveGroupToNewWindow(browser, *group);
        reply(true, base::Value(true));
        return;
      }
      if (method == "focusGroup" && args.size() == 1) {
        // Electron's focusGroup: unfold, then activate the group's first tab.
        if (visuals && visuals->is_collapsed()) {
          model->ChangeTabGroupVisuals(*group, tab_groups::TabGroupVisualData(
              visuals->title(), visuals->color(), /*is_collapsed=*/false));
        }
        model->ActivateTabAt(static_cast<int>(range.start()));
        reply(true, base::Value(true));
        return;
      }
      if (method == "toggleGroupCollapsed" && args.size() == 1 && visuals) {
        // Folding is panel state, as in Electron: the model flag only, never
        // Chromium's tab-strip collapse handler (which would move activation).
        model->ChangeTabGroupVisuals(*group, tab_groups::TabGroupVisualData(
            visuals->title(), visuals->color(), !visuals->is_collapsed()));
        reply(true, base::Value(true));
        return;
      }
      if (method == "closeGroup" && args.size() == 1) {
        // Closing every tab of the window would close the window; keep it,
        // like closeTab and Electron's closeGroup, with a fresh new tab.
        if (static_cast<int>(range.length()) == model->count())
          chrome::AddTabAt(browser, GURL("chrome://newtab/"), -1, true);
        model->CloseAllTabsInGroup(*group);
        reply(true, base::Value(true));
        return;
      }
      if (method == "reorderGroup" && args.size() == 2 &&
          (args[1].is_string() || args[1].is_none())) {
        // Electron's resolveGroupReorder: land before another group, or at
        // the end with null. Groups are contiguous runs of unpinned tabs.
        const int size = static_cast<int>(range.length());
        int to = model->count() - size;
        if (args[1].is_string()) {
          const auto before = FindGroup(model, args[1].GetString());
          if (!before) {
            reply(true, base::Value(false));
            return;
          }
          if (*before == *group) {
            reply(true, base::Value(true));
            return;
          }
          const int b = static_cast<int>(
              model->group_model()->GetTabGroup(*before)->ListTabs().start());
          to = b > static_cast<int>(range.start()) ? b - size : b;
        }
        if (to != static_cast<int>(range.start())) model->MoveGroupTo(*group, to);
        reply(true, base::Value(true));
        return;
      }
      reply(false, base::Value("Unexpected group request."));
      return;
    }
    if (args.empty() || !args[0].is_int()) {
      reply(false, base::Value("Expected a real tab ID."));
      return;
    }
    int index = -1;
    for (int i = 0; i < model->count(); ++i) {
      if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id() ==
          args[0].GetInt()) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      reply(false, base::Value("Tab no longer exists in this window."));
      return;
    }
    auto* tab = model->GetWebContentsAt(index);
    if (method == "find" || method == "stopFind") {
      if (index != model->active_index()) {
        reply(false, base::Value("Find requires the active tab in this window.")); return;
      }
      if (method == "stopFind" && args.size() == 1) {
        owner->StopFind(); reply(true, base::Value()); return;
      }
      if (method == "find" && args.size() == 4 && args[1].is_string() &&
          args[2].is_bool() && args[3].is_bool() &&
          !args[1].GetString().empty() && args[1].GetString().size() <= 4096) {
        owner->FindText(args[1].GetString(), args[2].GetBool(), args[3].GetBool());
        reply(true, base::Value()); return;
      }
      reply(false, base::Value("Invalid find request.")); return;
    }
    if (method == "newTabBelow" && args.size() == 1) {
      const auto group = model->GetTabGroupForTab(index);
      chrome::AddTabAt(browser, GURL("chrome://newtab/"), index + 1, true);
      if (group) model->AddToExistingGroup({model->active_index()}, *group);
      reply(true, base::Value(true));
      return;
    }
    if ((method == "closeAbove" || method == "closeBelow") && args.size() == 1) {
      // Preserve the named tab and pinned tabs, matching Electron's menu policy.
      for (int i = model->count() - 1; i >= 0; --i) {
        if (!model->IsTabPinned(i) && (method == "closeAbove" ? i < index : i > index))
          model->CloseWebContentsAt(i, TabCloseTypes::CLOSE_CREATE_HISTORICAL_TAB);
      }
      reply(true, base::Value(true));
      return;
    }
    if (method == "toggleBookmark" || method == "saveFavorite") {
      // The Island's heart and /save act on the tab it names; main re-reads
      // the committed page here rather than trusting a renderer-supplied URL.
      auto* favorites = LoadedBookmarkModel(profile);
      const GURL& url = tab->GetPrimaryMainFrame()->GetLastCommittedURL();
      if (!favorites || !IsFavoritable(url)) {
        reply(false, base::Value(profile->IsOffTheRecord()
            ? "Favorites are unavailable in private windows."
            : "Only web pages can be Favorites."));
        return;
      }
      const std::u16string title = tab->GetTitle();
      if (method == "toggleBookmark" && args.size() == 1) {
        reply(true, base::Value(ToggleFavorite(favorites, url, title)));
        return;
      }
      if (method == "saveFavorite" && args.size() == 2 && args[1].is_string()) {
        reply(true, base::Value(SaveFavorite(favorites, url, title, args[1].GetString())));
        return;
      }
      reply(false, base::Value("Expected a tab ID and a folder name."));
      return;
    }
    if (method == "togglePinned" && args.size() == 1) {
      // TabStripModel moves the tab to the pinned boundary itself, so re-read
      // its state at the new index.
      model->SetTabPinned(index, !model->IsTabPinned(index));
      reply(true, base::Value(model->IsTabPinned(model->GetIndexOfWebContents(tab))));
      return;
    }
    if (method == "toggleSiteMute" && args.size() == 1) {
      const auto host = AudioHost(tab);
      if (host.empty()) { reply(true, base::Value(false)); return; }
      auto* policy = SitePolicy(profile);
      const bool muted = !policy->hosts.contains(host);
      if (muted) policy->hosts.insert(host); else policy->hosts.erase(host);
      GlobalBrowserCollection::GetInstance()->ForEach([&](BrowserWindowInterface* other) {
        if (other->GetProfile() != profile) return true;
        auto* other_model = other->GetTabStripModel();
        for (int i = 0; i < other_model->count(); ++i) {
          auto* other_tab = other_model->GetWebContentsAt(i);
          if (AudioHost(other_tab) == host) SiteMuteTab::Get(other_tab)->Apply(true);
        }
        return true;
      });
      reply(true, base::Value(muted)); return;
    }
    if (method == "toggleMuted" && args.size() == 1) {
      // Per-tab mute on the WebContents, as Electron's toggleTabMuted does.
      SiteMuteTab::Get(tab)->ToggleTab();
      reply(true, base::Value(tab->IsAudioMuted()));
      return;
    }
    if ((method == "groupTabByName" && args.size() == 2 && args[1].is_string()) ||
        (method == "setTabGroup" && args.size() == 2 &&
         (args[1].is_string() || args[1].is_none()))) {
      if (!model->SupportsTabGroups()) {
        reply(true, base::Value(false));
        return;
      }
      std::optional<tab_groups::TabGroupId> target;
      if (method == "groupTabByName") {
        // Electron's groupTabByName: find-or-create by lowercase name.
        const std::u16string name = GroupName(args[1].GetString());
        if (name.empty()) {
          reply(true, base::Value(false));
          return;
        }
        for (const auto& group : GroupsInOrder(model)) {
          const auto* visuals = GroupVisuals(model, group);
          if (visuals && base::i18n::ToLower(visuals->title()) == base::i18n::ToLower(name)) target = group;
        }
        if (!target) {
          // Chromium cannot group a pinned tab; AddToNewGroup unpins it.
          target = model->AddToNewGroup({index});
          model->ChangeTabGroupVisuals(*target,
              tab_groups::TabGroupVisualData(name, kGroupColor, /*is_collapsed=*/false));
          reply(true, base::Value(true));
          return;
        }
      } else if (args[1].is_string()) {
        // A requested group that no longer exists is a no-op; it must not
        // ungroup the tab instead (Electron's setTabGroup rule).
        target = FindGroup(model, args[1].GetString());
        if (!target) {
          reply(true, base::Value(false));
          return;
        }
      }
      if (model->GetTabGroupForTab(index) != target) {
        if (target) model->AddToExistingGroup({index}, *target);
        else model->RemoveFromGroup({index});
      }
      reply(true, base::Value(true));
      return;
    }
    if (method == "moveTab" && args.size() == 3 &&
        (args[1].is_string() || args[1].is_none()) &&
        (args[2].is_int() || args[2].is_none())) {
      // Electron's resolveTabMove: the pinned state never changes, a tab
      // lands only inside the target bucket (pinned, a named group, or the
      // loose run). A loose insertion may name the first tab of a group
      // as its boundary, never an interior group tab. Unknown groups and
      // another window's tabs are rejected rather than coerced.
      // Chromium has no grouped pins, so a pinned tab moves only among pins.
      const bool pinned = model->IsTabPinned(index);
      std::optional<tab_groups::TabGroupId> target;
      if (args[1].is_string()) {
        target = model->SupportsTabGroups() ? FindGroup(model, args[1].GetString())
                                            : std::nullopt;
        if (!target || pinned) {
          reply(true, base::Value(false));
          return;
        }
      }
      content::WebContents* before = nullptr;
      if (args[2].is_int()) {
        for (int i = 0; i < model->count(); ++i) {
          if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id() ==
              args[2].GetInt()) {
            before = model->GetWebContentsAt(i);
            break;
          }
        }
        const int b = before ? model->GetIndexOfWebContents(before) : -1;
        const auto before_group = b >= 0 && model->SupportsTabGroups()
                                      ? model->GetTabGroupForTab(b) : std::nullopt;
        const bool loose_group_boundary = !pinned && !target && before_group &&
            model->group_model()->GetTabGroup(*before_group)->ListTabs().start() ==
                static_cast<size_t>(b);
        if (!before || before == tab || model->IsTabPinned(b) != pinned ||
            (before_group != target && !loose_group_boundary)) {
          reply(true, base::Value(before == tab));
          return;
        }
      }
      const auto group_of = [&](int i) {
        return model->SupportsTabGroups() ? model->GetTabGroupForTab(i) : std::nullopt;
      };
      // Membership first (Chromium keeps groups contiguous and moves the tab
      // to the group's edge), then the position within the bucket.
      if (!pinned && group_of(index) != target) {
        if (target) model->AddToExistingGroup({index}, *target);
        else model->RemoveFromGroup({index});
      }
      index = model->GetIndexOfWebContents(tab);
      int to;
      if (before) {
        const int b = model->GetIndexOfWebContents(before);
        to = b > index ? b - 1 : b;
      } else if (pinned) {
        to = model->IndexOfFirstNonPinnedTab() - 1;
      } else if (target) {
        to = static_cast<int>(model->group_model()->GetTabGroup(*target)->ListTabs().end()) - 1;
      } else {
        // A null before-id means the end of the entire strip. Loose runs may
        // follow groups; searching backward for an existing loose tab would
        // leave a sole loose tab stranded before the trailing group.
        to = model->count() - 1;
      }
      if (to != index) model->MoveWebContentsAt(index, to, false);
      // Chromium may adjust membership when a tab crosses a group edge;
      // re-assert the requested bucket and report what actually happened.
      index = model->GetIndexOfWebContents(tab);
      if (!pinned && group_of(index) != target) {
        if (target) model->AddToExistingGroup({index}, *target);
        else model->RemoveFromGroup({index});
        index = model->GetIndexOfWebContents(tab);
      }
      reply(true, base::Value(model->IsTabPinned(index) == pinned &&
                              (pinned || group_of(index) == target)));
      return;
    }
    if (method == "switchTab") {
      model->ActivateTabAt(index);
    } else if (method == "closeTab") {
      if (model->count() == 1) {
        chrome::AddTabAt(browser, GURL("chrome://newtab/"), -1, true);
      }
      model->CloseWebContentsAt(index, TabCloseTypes::CLOSE_CREATE_HISTORICAL_TAB);
    } else if (method == "navigate" && args.size() == 2 && args[1].is_string()) {
      const GURL url(args[1].GetString());
      if (!url.SchemeIsHTTPOrHTTPS()) {
        reply(false, base::Value("Navigation requires an HTTP or HTTPS URL."));
        return;
      }
      tab->GetController().LoadURL(url, content::Referrer(),
                                   ui::PAGE_TRANSITION_TYPED, std::string());
    } else if (method == "goBack" && tab->GetController().CanGoBack()) {
      tab->GetController().GoBack();
    } else if (method == "goForward" && tab->GetController().CanGoForward()) {
      tab->GetController().GoForward();
    } else if (method == "reload") {
      tab->GetController().Reload(content::ReloadType::NORMAL, false);
    } else if (method == "stop") {
      tab->Stop();
    } else {
      reply(false, base::Value("Unavailable in this prototype: " + method));
      return;
    }
    reply(true, base::Value());
  }
  base::CancelableTaskTracker tracker_;
  base::WeakPtrFactory<Handler> weak_factory_{this};
};
}  // namespace

Config::Config() : DefaultWebUIConfig("chrome", kHost) {}

bool Config::IsWebUIEnabled(content::BrowserContext*) {
  return IsEnabled();
}

bool IsEnabled() {
  return base::CommandLine::ForCurrentProcess()->HasSwitch(kAssetsSwitch);
}

UI::UI(content::WebUI* web_ui) : content::WebUIController(web_ui) {
  const base::FilePath root =
      base::CommandLine::ForCurrentProcess()->GetSwitchValuePath(kAssetsSwitch);
  auto* source =
      content::WebUIDataSource::CreateAndAdd(Profile::FromWebUI(web_ui), kHost);
  source->DisableDenyXFrameOptions();
  source->DisableTrustedTypesCSP();
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::FrameSrc, "frame-src 'self';");
  source->SetRequestFilter(
      base::BindRepeating([](const std::string&) { return true; }),
      base::BindRepeating(
          [](base::FilePath root, const std::string& path,
             content::WebUIDataSource::GotDataCallback callback) {
            base::ThreadPool::PostTaskAndReplyWithResult(
                FROM_HERE, {base::MayBlock()},
                base::BindOnce(&ReadAsset, root, path), std::move(callback));
          },
          root));
  web_ui->AddMessageHandler(std::make_unique<Handler>());
  web_ui->AddMessageHandler(std::make_unique<NewTabHandler>());
}

std::unique_ptr<views::WebView> CreateIsland(
    BrowserWindowInterface* browser) {
  auto view = std::make_unique<IslandView>(browser->GetProfile());
  view->SetID(kIslandViewId);
  auto owner = std::make_unique<Owner>(browser);
  owner->view = view.get();
  view->GetWebContents(GURL("chrome://blanc-prototype/host.html"))
      ->SetUserData(kOwnerKey, std::move(owner));
  view->GetWebContents()->SetDelegate(GetIslandDelegate());
  view->GetWebContents()->SetPageBaseBackgroundColor(SK_ColorTRANSPARENT);
  view->LoadInitialURL(GURL("chrome://blanc-prototype/host.html"));
  return view;
}

bool OpenExtensions(BrowserWindowInterface* browser) {
  if (!IsIslandWindow(browser)) return false;
  auto* parent = BrowserView::GetBrowserViewForBrowser(browser);
  auto* view = parent ? static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId)) : nullptr;
  if (!view) return false;
  auto* contents = view->GetWebContents();
  if (contents->GetLastCommittedURL() != GURL("chrome://blanc-prototype/host.html") ||
      !contents->GetPrimaryMainFrame()->IsRenderFrameLive()) return false;
  view->RequestFocus();
  contents->Focus();
  contents->GetPrimaryMainFrame()->ExecuteJavaScript(
      u"window.BlancPrototypeHost?.extensions()", base::NullCallback());
  return true;
}

bool ToggleFavoriteFromIsland(BrowserWindowInterface* browser) {
  if (!IsIslandWindow(browser)) return false;
  // Same rules as the Island heart: committed http(s) page, loaded model,
  // never a private window. Anything else is a no-op, as in Electron, rather
  // than Chromium's bubble, which has no toolbar to anchor to here.
  auto* active = browser->GetTabStripModel()->GetActiveWebContents();
  auto* model = LoadedBookmarkModel(browser->GetProfile());
  if (!active || !model) return true;
  const GURL& url = active->GetPrimaryMainFrame()->GetLastCommittedURL();
  if (!IsFavoritable(url)) return true;
  ToggleFavorite(model, url, active->GetTitle());
  // Repaint the heart now instead of on the next 300ms snapshot poll.
  auto* parent = BrowserView::GetBrowserViewForBrowser(browser);
  auto* view = parent ? static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId)) : nullptr;
  auto* contents = view ? view->GetWebContents() : nullptr;
  if (contents && contents->GetLastCommittedURL() == GURL("chrome://blanc-prototype/host.html") &&
      contents->GetPrimaryMainFrame()->IsRenderFrameLive()) {
    contents->GetPrimaryMainFrame()->ExecuteJavaScript(
        u"window.BlancPrototypeHost?.refresh()", base::NullCallback());
  }
  return true;
}

bool OpenFindIsland(BrowserWindowInterface* browser, int direction) {
  auto* parent = BrowserView::GetBrowserViewForBrowser(browser);
  auto* view = parent ? static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId)) : nullptr;
  if (!view) return false;
  auto* host = view->GetWebContents();
  if (host->GetLastCommittedURL() != GURL("chrome://blanc-prototype/host.html") ||
      !host->GetPrimaryMainFrame()->IsRenderFrameLive()) return false;
  host->GetPrimaryMainFrame()->ExecuteJavaScript(
      direction == 0 ? u"window.BlancPrototypeHost?.api.openFindBar()"
      : direction > 0 ? u"window.BlancPrototypeHost?.findStep(true)"
                      : u"window.BlancPrototypeHost?.findStep(false)", base::NullCallback());
  return true;
}

bool OpenIsland(BrowserWindowInterface* browser, bool new_tab,
                const std::string& initial_text) {
  auto* parent = BrowserView::GetBrowserViewForBrowser(browser);
  if (!parent) return false;
  auto* view = static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId));
  if (!view) return false;
  auto* contents = view->GetWebContents();
  if (contents->GetLastCommittedURL() !=
          GURL("chrome://blanc-prototype/host.html") ||
      !contents->GetPrimaryMainFrame()->IsRenderFrameLive()) {
    return false;
  }
  if (IsPageFullscreen(browser)) {
    if (auto* active = browser->GetTabStripModel()->GetActiveWebContents())
      active->ExitFullscreen(true);
    view->SetVisible(true);
  }
  view->RequestFocus();
  contents->Focus();
  contents->GetPrimaryMainFrame()->ExecuteJavaScript(
      !initial_text.empty()
          ? base::UTF8ToUTF16("window.BlancPrototypeHost?.open(true, " +
                             base::GetQuotedJSONString(initial_text) + ")")
          : new_tab ? u"window.BlancPrototypeHost?.open(true)"
                    : u"window.BlancPrototypeHost?.open()",
      base::NullCallback());
  return true;
}

bool IsIslandWindow(const BrowserWindowInterface* browser) {
  return IsEnabled() && browser &&
      browser->GetType() == BrowserWindowInterface::Type::TYPE_NORMAL;
}

bool HasIsland(views::View* parent) {
  if (!parent || !parent->GetViewByID(kIslandViewId)) return false;
  return !IsPageFullscreen(static_cast<BrowserView*>(parent)->browser());
}

int RailWidth(views::View* parent) {
  if (!HasIsland(parent)) return 0;
  auto* view = static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId));
  auto* owner = GetOwner(view->GetWebContents());
  return owner && owner->vertical ? owner->rail_width : 0;
}

bool IsCaption(views::View* parent, int x, int y) {
  auto* view = static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId));
  if (!view || !view->GetVisible() || y < view->y() || y >= view->y() + 68) return false;
  auto* owner = GetOwner(view->GetWebContents());
  return owner && !owner->interactive_bounds.Contains(x, y - view->y());
}

void RestoreExtensions(views::View* parent) {
  auto* view = static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId));
  if (!view) return;
  auto* browser_view = static_cast<BrowserView*>(parent);
  if (!browser_view->toolbar()) return;
  auto* toolbar = browser_view->toolbar();
  auto* extensions = toolbar->extensions_container_for_testing();
  // Restore original ownership before BrowserView tears down its children.
  if (extensions && extensions->parent() == parent)
    toolbar->AddChildView(parent->RemoveChildViewT(extensions));
}

void LayoutIsland(views::View* parent, int top) {
  auto* view = static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId));
  if (!view) return;
  auto* owner = GetOwner(view->GetWebContents());
  const int available = std::max(0, parent->height() - top);
  view->SetBounds(0, top, parent->width(),
                  std::min(owner && owner->vertical ? available : owner ? owner->height : 68, available));
  if (!owner) return;
  auto* browser_view = static_cast<BrowserView*>(parent);
  if (!browser_view->toolbar()) return;
  auto* extensions = browser_view->toolbar()->extensions_container_for_testing();
  const bool page_fullscreen = IsPageFullscreen(browser_view->browser());
  view->SetVisible(!page_fullscreen);
  if (!extensions) return;
  if (page_fullscreen) {
    extensions->SetVisible(false);
    return;
  }
  // Keep Chromium's real action views, menu, active-tab grants and popup
  // anchors. Only their parent and geometry change; no extension state changes.
  if (extensions->parent() != parent) {
    parent->AddChildView(extensions->parent()->RemoveChildViewT(extensions));
  }
  auto bounds = owner->extension_bounds;
  bounds.Offset(0, top);
  bounds.Intersect(parent->GetLocalBounds());
  const bool resized = extensions->width() != bounds.width();
  extensions->SetBoundsRect(bounds);
  if (resized) extensions->OnPinnedActionsChanged();
  extensions->SetVisible(owner->height == 68 && !bounds.IsEmpty());
}
}  // namespace blanc_prototype
