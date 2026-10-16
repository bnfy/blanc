// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "chrome/browser/ui/blanc_prototype_ui.h"

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
#include "chrome/browser/bookmarks/bookmark_model_factory.h"
#include "chrome/browser/history/history_service_factory.h"
#include "chrome/browser/history/top_sites_factory.h"
#include "chrome/browser/ui/browser_window/public/global_browser_collection.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/browser/bookmark_utils.h"
#include "components/bookmarks/browser/url_and_title.h"
#include "components/bookmarks/common/bookmark_metrics.h"
#include "components/history/core/browser/history_service.h"
#include "components/history/core/browser/history_types.h"
#include "components/history/core/browser/top_sites.h"
#include "components/keyed_service/core/service_access_type.h"
#include "content/public/browser/favicon_status.h"
#include "content/public/browser/navigation_entry.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/exclusive_access/exclusive_access_manager.h"
#include "chrome/browser/ui/exclusive_access/fullscreen_controller.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "chrome/browser/ui/toolbar/toolbar_actions_model.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/toolbar/toolbar_view.h"
#include "chrome/browser/ui/views/extensions/extensions_toolbar_desktop.h"
#include "ui/gfx/geometry/rect.h"
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
      const auto* node = bookmarks::GetMostRecentlyAddedUserNodeForURL(model, url);
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
    const auto* node = bookmarks::GetMostRecentlyAddedUserNodeForURL(model, url);
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
  gfx::Rect extension_bounds;
  gfx::Rect interactive_bounds;
  std::string page_tint;

  // The tab's committed favicon as a data URL, encoded once per distinct
  // image rather than on every 300ms snapshot. Private windows report none,
  // as Electron does for private tabs.
  std::string TabFavicon(int tab_id, content::WebContents* contents) {
    if (browser->GetProfile()->IsOffTheRecord()) return std::string();
    const auto* entry = contents->GetController().GetLastCommittedEntry();
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

  void SyncActive() {
    if (closing_) return;
    auto* active = browser->GetTabStripModel()->GetActiveWebContents();
    if (active != web_contents()) {
      Observe(active);
      ResetTint();
    }
    ObserveInput();
    if (!timer_.IsRunning() && !in_flight_ && CanSample()) RequestSample();
  }

 private:
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
    ObserveInput();
    ResetTint();
  }
  void DidStopLoading() override { RequestSample(); }
  void DidFirstVisuallyNonEmptyPaint() override { RequestSample(); }
  void DidGetUserInteraction(const blink::WebInputEvent&) override { RequestSample(); }
  void OnBackgroundColorChanged() override { RequestSample(); }
  void DidChangeThemeColor() override { RequestSample(); }
  void OnVisibilityChanged(content::Visibility visibility) override {
    ++generation_;
    timer_.Stop();
    if (visibility == content::Visibility::VISIBLE) RequestSample();
  }
  void WebContentsDestroyed() override {
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

bool IsAsset(const std::string& path) {
  static constexpr const char* kAssets[] = {
      "pages/newtab.html", "pages/newtab.js", "pages/close.svg", "pages/newtab-wallpaper.js", "pages/start-site-name.js", "pages/pages.css", "pages/type-to-open.js", "pages/i18n.js", "pages/sunrise-mark.png", "pages/icon-sunrise.png", "pages/icon-sunrise-dark.png", "pages/onboarding-island-dark.png", "pages/onboarding-island-light.png", "pages/start-page-sunrise.png", "pages/start-page-day.png", "pages/start-page-dusk.png", "pages/start-page-night.png", "pages/caveat-latin.woff2", "pages/select-caret.svg", "pages/select-caret-dark.svg", "pages/strings.js", "pages/newtab-adapter.js", "pages/newtab-prototype.css",
      "host.html", "host.js", "host.css", "extensions.js", "extensions.css",
      "icons/search.svg", "icons/settings.svg", "icons/external-link.svg", "icons/chevron-left.svg", "adapter.js", "prototype.css",
      "index.html", "overlay.html", "styles.css", "renderer.js", "overlay.js",
      "strings.js", "i18n.js", "tab-drag.js", "vertical-tabs.js",
      "space-identity.js", "space-picker.js", "workspace-ui.js", "panel-left.svg",
      "sunrise-hero-mark.png", "pages/type-to-open.js",
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

base::DictValue Snapshot(BrowserWindowInterface* browser, Owner* owner) {
  owner->SyncActive();
  auto* model = browser->GetTabStripModel();
  auto* favorites = LoadedBookmarkModel(browser->GetProfile());
  std::set<int> live_tab_ids;
  base::ListValue tabs;
  for (int index = 0; index < model->count(); ++index) {
    auto* contents = model->GetWebContentsAt(index);
    auto& controller = contents->GetController();
    const int tab_id = sessions::SessionTabHelper::IdForTab(contents).id();
    live_tab_ids.insert(tab_id);
    // Favorite state follows the committed document, never the virtual or
    // pending URL, so a typed address is not reported as saved before it lands.
    const GURL& committed = contents->GetPrimaryMainFrame()->GetLastCommittedURL();
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
                    .Set("private", browser->GetProfile()->IsOffTheRecord())
                    .Set("groupId", base::Value())
                    .Set("blockedCount", 0));
  }
  owner->PruneFaviconCache(live_tab_ids);
  auto* active = model->GetActiveWebContents();
  base::Value active_id =
      active ? base::Value(sessions::SessionTabHelper::IdForTab(active).id())
             : base::Value();
  auto* browser_view = BrowserView::GetBrowserViewForBrowser(browser);
  auto* extensions = browser_view && browser_view->toolbar()
      ? browser_view->toolbar()->extensions_container() : nullptr;
  const int extension_width = extensions ? 26 : 0;
  return base::DictValue()
      .Set("extensionsWidth", extension_width)
      .Set("tabs", std::move(tabs))
      .Set("activeTabId", std::move(active_id))
      .Set("groups", base::ListValue())
      .Set("closed", base::ListValue())
      .Set("glanceTabId", base::Value())
      .Set("tabLayout", "island")
      .Set("adblockEnabled", false)
      .Set("displayShares", base::ListValue());
}

// Only the bundled top-level start page gets this read-only profile bridge.
// It also watches the bookmark model so a page left open re-lists Favorites
// after the Island, Chromium's manager or a late favicon load changes them.
class NewTabHandler : public content::WebUIMessageHandler,
                      public bookmarks::BaseBookmarkModelObserver {
 public:
  void RegisterMessages() override {
    web_ui()->RegisterMessageCallback("blancNewTab",
        base::BindRepeating(&NewTabHandler::Handle, base::Unretained(this)));
  }
  void OnJavascriptDisallowed() override {
    weak_factory_.InvalidateWeakPtrs();
    bookmark_observation_.Reset();
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
  void BookmarkModelChanged() override { NotifyBookmarksChanged(); }
  void BookmarkNodeFaviconChanged(const bookmarks::BookmarkNode*) override {
    NotifyBookmarksChanged();
  }
  void BookmarkModelBeingDeleted() override { bookmark_observation_.Reset(); }
  void NotifyBookmarksChanged() {
    if (!IsStartPage() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancNewTabEvent",
                                          base::Value("bookmarks"));
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
      options.duplicate_handling = history::QueryOptions::REMOVE_ALL_DUPLICATES;
      service->QueryHistory(std::u16string(), options,
          base::BindOnce(&Handler::HistoryReady, weak_factory_.GetWeakPtr(), id),
          &tracker_);
      return;
    }
    if (method == "extensions" && args.empty()) {
      auto* container = BrowserView::GetBrowserViewForBrowser(browser)
                            ->toolbar()->extensions_container();
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
                            ->toolbar()->extensions_container();
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
    if (method == "height" && args.size() == 1 && args[0].is_int()) {
      owner->height = std::clamp(args[0].GetInt(), 68, 640);
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
  auto view = std::make_unique<views::WebView>(browser->GetProfile());
  view->SetID(kIslandViewId);
  auto owner = std::make_unique<Owner>(browser);
  owner->view = view.get();
  view->GetWebContents(GURL("chrome://blanc-prototype/host.html"))
      ->SetUserData(kOwnerKey, std::move(owner));
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
  auto* extensions = toolbar->extensions_container();
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
                  std::min(owner ? owner->height : 68, available));
  if (!owner) return;
  auto* browser_view = static_cast<BrowserView*>(parent);
  if (!browser_view->toolbar()) return;
  auto* extensions = browser_view->toolbar()->extensions_container();
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
