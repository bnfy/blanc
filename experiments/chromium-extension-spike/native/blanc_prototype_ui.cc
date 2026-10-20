// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "chrome/browser/themes/theme_service.h"
#include "chrome/browser/themes/theme_service_factory.h"
#include "chrome/browser/themes/theme_properties.h"
#include "chrome/browser/themes/custom_theme_supplier.h"
#include "chrome/grit/theme_resources.h"
#include "ui/base/theme_provider.h"
#include "chrome/browser/sessions/session_restore.h"
#include "chrome/browser/sessions/session_service_factory.h"
#include "chrome/browser/ui/blanc_prototype_ui.h"
#include "chrome/browser/ui/blanc_webstore_promotion.h"
#include "chrome/common/chrome_isolated_world_ids.h"

#include "chrome/browser/ui/tabs/split_tab_metrics.h"
#include "components/split_tabs/split_tab_visual_data.h"
#include "components/tabs/public/split_tab_data.h"
#include "chrome/browser/ui/views/frame/multi_contents_view.h"
#include "ui/views/layout/proposed_layout.h"
#include <array>
#include <cmath>
#include <algorithm>
#include <memory>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include "base/base64.h"
#include "base/strings/escape.h"
#include "content/public/browser/storage_partition.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/task/sequenced_task_runner.h"
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
#include "ui/views/view_observer.h"
#include "base/strings/stringprintf.h"
#include "base/values.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/sessions/tab_restore_service_factory.h"
#include "chrome/browser/ui/browser_live_tab_context.h"
#include "components/sessions/core/tab_restore_service.h"
#include "components/prefs/pref_service.h"
#include "components/sessions/core/live_tab.h"
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
#include "chrome/app/chrome_command_ids.h"
#include "ui/base/models/list_selection_model.h"
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
#include "chrome/browser/ui/views/frame/toolbar_button_provider.h"
#include "chrome/browser/ui/views/toolbar/app_menu_control.h"
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
#include "content/public/browser/render_process_host.h"
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
#include "chrome/grit/branded_strings.h"
#include "chrome/browser/extensions/extension_context_menu_model.h"
#include "extensions/browser/extension_registry.h"
#include "ui/views/controls/menu/menu_model_adapter.h"
#include "ui/views/controls/menu/menu_runner.h"
#include "ui/views/controls/menu/menu_item_view.h"
#include "ui/display/screen.h"
#include "ui/base/resource/resource_bundle.h"
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
// Preserve native controls while giving hidden-menu bubbles a real Island view
// anchor, including before ElementTracker has exposed the startup fallback.
class IslandToolbarProvider final : public ToolbarButtonProvider,
                                    public AppMenuControl,
                                    public views::ViewObserver {
 public:
  IslandToolbarProvider(ToolbarButtonProvider* delegate, views::View* anchor,
                        views::View* toolbar)
      : delegate_(delegate), anchor_(anchor) {
    toolbar_observation_.Observe(toolbar);
  }
  void OnViewIsDeleting(views::View* view) override {
    delegate_ = nullptr;
    toolbar_observation_.Reset();
  }
  ~IslandToolbarProvider() override = default;
  AppMenuControl* GetAppMenuControl() override {
    return delegate_ && delegate_->GetAppMenuControl() ? this : nullptr;
  }
  views::BubbleAnchor GetAnchor() override { return views::BubbleAnchor(anchor_); }
  ExtensionsContainerViews* GetExtensionsContainerViews() override {
    return delegate_->GetExtensionsContainerViews();
  }
  PinnedToolbarActions* GetPinnedToolbarActions() override {
    return delegate_->GetPinnedToolbarActions();
  }
  gfx::Size GetToolbarButtonSize() const override {
    return delegate_->GetToolbarButtonSize();
  }
  views::BubbleAnchor GetDefaultExtensionDialogAnchor() override {
    return delegate_->GetDefaultExtensionDialogAnchor();
  }
  page_actions::PageActionViewInterface* GetPageActionViewInterface(actions::ActionId id) override {
    return delegate_->GetPageActionViewInterface(id);
  }
  gfx::Rect GetFindBarBoundingBox(int bottom) override {
    return delegate_->GetFindBarBoundingBox(bottom);
  }
  void FocusToolbar() override {
    return delegate_->FocusToolbar();
  }
  views::AccessiblePaneView* GetAsAccessiblePaneView() override {
    return delegate_->GetAsAccessiblePaneView();
  }
  views::BubbleAnchor GetBubbleAnchor(std::optional<actions::ActionId> id) override {
    return delegate_->GetBubbleAnchor(id);
  }
  views::BubbleAnchor GetPageActionBubbleAnchor(actions::ActionId id) override {
    return delegate_->GetPageActionBubbleAnchor(id);
  }
  void ZoomChangedForActiveTab(bool show) override {
    return delegate_->ZoomChangedForActiveTab(show);
  }
  AvatarToolbarButtonInterface* GetAvatarToolbarButtonInterface() override {
    return delegate_->GetAvatarToolbarButtonInterface();
  }
  ToolbarButton* GetBackButton() override {
    return delegate_->GetBackButton();
  }
  ReloadControl* GetReloadButton() override {
    return delegate_->GetReloadButton();
  }
  ToolbarButton* GetDownloadButton() override {
    return delegate_->GetDownloadButton();
  }
  WebUIToolbarWebView* GetWebUIToolbarViewForTesting() override {
    return delegate_->GetWebUIToolbarViewForTesting();
  }
  bool IsDrawn() const override {
    return delegate_->GetAppMenuControl()->IsDrawn();
  }
  bool IsMenuShowing() const override {
    return delegate_->GetAppMenuControl()->IsMenuShowing();
  }
  views::DialogDelegate* GetDialogDelegate() override {
    return delegate_->GetAppMenuControl()->GetDialogDelegate();
  }
  void CloseMenu() override {
    return delegate_->GetAppMenuControl()->CloseMenu();
  }
  void ShowMenu() override {
    return delegate_->GetAppMenuControl()->ShowMenu();
  }
  void ShowMenuWithFlags(int flags) override {
    return delegate_->GetAppMenuControl()->ShowMenuWithFlags(flags);
  }
  views::MenuItemView* GetRootMenuItemViewForTesting() override {
    return delegate_->GetAppMenuControl()->GetRootMenuItemViewForTesting();
  }
  void ExecuteCommandForTesting(int id, int flags) override {
    return delegate_->GetAppMenuControl()->ExecuteCommandForTesting(id, flags);
  }
  void SetMenuTimerForTesting(base::ElapsedTimer timer) override {
    return delegate_->GetAppMenuControl()->SetMenuTimerForTesting(std::move(timer));
  }
  void AddObserver(AppMenuButtonObserver* observer) override {
    return delegate_->GetAppMenuControl()->AddObserver(observer);
  }
  void RemoveObserver(AppMenuButtonObserver* observer) override {
    return delegate_->GetAppMenuControl()->RemoveObserver(observer);
  }
  bool HasFocus() const override {
    return delegate_->GetAppMenuControl()->HasFocus();
  }
  void Focus(views::AccessiblePaneView* pane) override {
    return delegate_->GetAppMenuControl()->Focus(pane);
  }
  void SetTypeAndSeverity(AppMenuIconController::TypeAndSeverity value) override {
    return delegate_->GetAppMenuControl()->SetTypeAndSeverity(value);
  }
  void SetIsMaximizedOrFullscreen(bool value) override {
    return delegate_->GetAppMenuControl()->SetIsMaximizedOrFullscreen(value);
  }
  views::View* GetFocusablePaneView() override {
    return delegate_->GetAppMenuControl()->GetFocusablePaneView();
  }
 private:
  base::ScopedObservation<views::View, views::ViewObserver>
      toolbar_observation_{this};
  raw_ptr<ToolbarButtonProvider> delegate_;
  raw_ptr<views::View> anchor_;
};

scoped_refptr<base::SequencedTaskRunner> SpaceRunner();
std::optional<base::DictValue> CaptureNativeSpace(BrowserWindowInterface* browser);
base::DictValue SpaceDisk(base::FilePath path, std::string method,
                         std::string name, base::DictValue capture);


void UpdatePersistentSplitFocus(BrowserWindowInterface* browser);

class Owner : public base::SupportsUserData::Data,
              public content::WebContentsObserver,
              public content::RenderWidgetHost::InputEventObserver,
              public content::RenderWidgetHostObserver,
              public TabStripModelObserver {
 public:
  static std::set<Owner*>& Live() {
    static base::NoDestructor<std::set<Owner*>> owners;
    return *owners;
  }
  ~Owner() override { Live().erase(this); }
  bool identity_registered = false;
  bool initial_window_save_started = false;
  bool initial_window_saved = false;
  bool initial_window_save_failed = false;
  int initial_window_save_failures = 0;
  base::TimeTicks initial_window_retry_at;
  bool recovery_checked = false;
  bool space_busy = false;
  std::string space_name;
  std::vector<int> space_pending_ids;
  std::optional<base::DictValue> space_saved;
  std::optional<base::DictValue> space_candidate;
  base::TimeTicks space_candidate_at;
  std::string space_error;
  std::string space_transaction;
  std::optional<base::DictValue> space_expected;
  std::vector<int> space_destination_ids;
  explicit Owner(BrowserWindowInterface* value) : browser(value) {
    Live().insert(this);
    browser->GetTabStripModel()->AddObserver(this);
  }
  raw_ptr<BrowserWindowInterface> browser;
  raw_ptr<views::WebView> view = nullptr;
  std::unique_ptr<IslandToolbarProvider> toolbar_provider;
  int height = 68;
  int glance_main = -1;
  int glance_reference = -1;
  // Session IDs never outlive their tabs; validate the native split each read.
  int MainIndex() {
    auto* model = browser->GetTabStripModel();
    int main = -1, reference = -1;
    for (int i = 0; i < model->count(); ++i) {
      const int id = sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id();
      if (id == glance_main) main = i;
      if (id == glance_reference) reference = i;
    }
    if (main < 0 || reference < 0 || !model->GetSplitForTab(main) ||
        model->GetSplitForTab(main) != model->GetSplitForTab(reference)) {
      glance_main = glance_reference = -1;
      return model->active_index();
    }
    return model->active_index() == main || model->active_index() == reference
        ? main : model->active_index();
  }
  bool vertical = false;
  int rail_width = 248;
  gfx::Rect extension_bounds;
  gfx::Rect interactive_bounds;
  base::DictValue split_geometry;
  std::vector<gfx::Rect> split_hit_regions;
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
    UpdatePersistentSplitFocus(browser);
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
  void WillCloseAllTabs(TabStripModel*) override {
    // Capture while the model still contains its tabs, bypassing the UI poll
    // and debounce. The existing BLOCK_SHUTDOWN sequence orders this after any
    // in-flight autosave; the task owns values, never this closing window.
    if (space_name.empty() || !space_error.empty()) return;
    auto capture = CaptureNativeSpace(browser);
    if (!capture) return;
    SpaceRunner()->PostTask(FROM_HERE, base::BindOnce(
        [](base::FilePath path, std::string name, base::DictValue data) {
          auto result = SpaceDisk(std::move(path), "previewSpaceSave", std::move(name), std::move(data));
          if (const auto* error = result.FindString("error")) LOG(ERROR) << "Blanc Spaces exit flush: " << *error;
        }, browser->GetProfile()->GetPath().AppendASCII("BlancPrototypeSpaces.json"),
        space_name, std::move(*capture)));
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
  void RenderFrameDeleted(content::RenderFrameHost* frame) override {
    // The PDF renderer can die while its outer page remains live. Retire the
    // search session when its PDF frame disappears; late replies must not
    // repopulate the capsule. Ordinary subframe removal keeps parent find live.
    if (frame->GetProcess()->IsPdf()) ResetFindAfterRendererLoss();
  }
  void PrimaryMainFrameRenderProcessGone(base::TerminationStatus) override {
    ResetFindAfterRendererLoss();
  }
  void ResetFindAfterRendererLoss() {
    // A crashed renderer cannot complete its pending find. Retire the session
    // without sending StopFinding to the dead process, and clear stale UI.
    find_request_ = -1;
    find_query_.clear();
    find_matches_ = find_ordinal_ = 0;
    FindEvent(u"window.BlancPrototypeHost?.findReset()");
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
    if (!owner) return GetLocalBounds().Intersects(rect);
    if (!owner->split_geometry.empty()) {
      if (gfx::Rect(0, 0, width(), 68).Intersects(rect)) return true;
      for (const auto& region : owner->split_hit_regions)
        if (region.Intersects(rect)) return true;
      return (owner->vertical && gfx::Rect(0, 68, owner->rail_width, height()).Intersects(rect)) ||
          (owner->height > 68 && owner->interactive_bounds.Intersects(rect));
    }
    if (!owner->vertical) return GetLocalBounds().Intersects(rect);
    return gfx::Rect(0, 0, width(), HeaderHeight(const_cast<views::View*>(parent()))).Intersects(rect) ||
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
      "installed-theme.js", "pages/installed-theme.js",
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

// Foreground activation can expand a restored group. Reapply only the saved
// collapsed flag to groups identified by returned tabs or their saved identity.
bool RestoreClosedGroupCollapsed(
    BrowserWindowInterface* browser,
    std::optional<bool> collapsed,
    std::optional<base::Uuid> saved_group_id,
    const std::vector<sessions::LiveTab*>& restored) {
  if (!collapsed) return false;
  auto* model = browser->GetTabStripModel();
  std::set<tab_groups::TabGroupId> groups;
  // Saved-group restoration can return no LiveTabs even after reopening the
  // group. Resolve its stable saved identity through the native context.
  if (saved_group_id) {
    if (auto id = BrowserLiveTabContext::From(browser)->GetGroupIdForSavedGroup(
            *saved_group_id)) groups.insert(*id);
  }
  for (auto* live : restored) {
    if (!live) continue;
    for (int i = 0; i < model->count(); ++i) {
      if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)) !=
          live->GetSessionID()) continue;
      if (auto group = model->GetTabGroupForTab(i)) groups.insert(*group);
    }
  }
  bool applied = false;
  for (const auto& id : groups) {
    const auto* group = model->group_model()->GetTabGroup(id);
    if (!group) continue;
    const auto* visual = group->visual_data();
    model->ChangeTabGroupVisuals(id, tab_groups::TabGroupVisualData(
        visual->title(), visual->color(), *collapsed));
    applied = true;
  }
  return applied;
}

std::optional<base::Uuid> ClosedSavedGroup(const sessions::tab_restore::Entry& entry) {
  if (entry.type != sessions::tab_restore::GROUP) return std::nullopt;
  return static_cast<const sessions::tab_restore::Group&>(entry).saved_group_id;
}

std::optional<bool> ClosedGroupCollapsed(const sessions::tab_restore::Entry& entry) {
  if (entry.type != sessions::tab_restore::GROUP) return std::nullopt;
  return static_cast<const sessions::tab_restore::Group&>(entry)
      .visual_data.is_collapsed();
}

std::optional<int> ClosedSplitFocus(const sessions::tab_restore::Entry& entry) {
  if (entry.type != sessions::tab_restore::SPLIT) return std::nullopt;
  const auto& tabs = static_cast<const sessions::tab_restore::Split&>(entry).tabs;
  if (tabs.size() != 2) return std::nullopt;
  int focused = -1;
  for (int i = 0; i < 2; ++i) {
    const auto found = tabs[i]->extra_data.find(kPersistentSplitKey);
    if (found == tabs[i]->extra_data.end() || (found->second != "1" && found->second != "2")) return std::nullopt;
    if (found->second == "2") { if (focused >= 0) return std::nullopt; focused = i; }
  }
  return focused < 0 ? std::nullopt : std::make_optional(focused);
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

// A small internal Spaces store. Disk work is serialized across all windows;
// corruption and unsupported snapshots refuse rather than overwrite or drop tabs.
scoped_refptr<base::SequencedTaskRunner> SpaceRunner() {
  static base::NoDestructor<scoped_refptr<base::SequencedTaskRunner>> runner(
      base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN}));
  return *runner;
}
class PersistentSplitData : public base::SupportsUserData::Data {
 public:
  explicit PersistentSplitData(bool focused = false) : focused(focused) {}
  bool focused;
};
void MarkPersistentSplit(BrowserWindowInterface* browser, content::WebContents* tab, bool enabled, bool focused = false) {
  if (enabled) tab->SetUserData(kPersistentSplitKey, std::make_unique<PersistentSplitData>(focused));
  else tab->RemoveUserData(kPersistentSplitKey);
  if (!browser->GetProfile()->IsOffTheRecord())
    if (auto* service = SessionServiceFactory::GetForProfile(browser->GetProfile()))
      service->AddTabExtraData(browser->GetSessionID(), sessions::SessionTabHelper::IdForTab(tab), kPersistentSplitKey, enabled ? (focused ? "2" : "1") : "0");
}
void RestoreClosedSplitMetadata(BrowserWindowInterface* browser,
    std::optional<int> focus, const std::vector<sessions::LiveTab*>& restored) {
  if (!focus || restored.size() != 2) return;
  auto* model = browser->GetTabStripModel();
  std::vector<int> indices;
  for (auto* live : restored) {
    if (!live) return;
    int index = -1;
    for (int i = 0; i < model->count(); ++i)
      if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)) == live->GetSessionID()) index = i;
    if (index < 0) return;
    indices.push_back(index);
  }
  const auto split = model->GetSplitForTab(indices[0]);
  if (!split || split != model->GetSplitForTab(indices[1])) return;
  for (int i = 0; i < 2; ++i)
    MarkPersistentSplit(browser, model->GetWebContentsAt(indices[i]), true, i == *focus);
  model->ActivateTabAt(indices[*focus]);
}

// A cancelled batch close can leave a live pane represented in Split history.
// Reuse only its exact durable identity, never a URL/title match.
std::optional<bool> RestorePartialSplit(BrowserWindowInterface* browser,
    sessions::TabRestoreService* service, const sessions::tab_restore::Entry& entry) {
  const auto focus = ClosedSplitFocus(entry);
  if (!focus) return std::nullopt;
  const auto& saved = static_cast<const sessions::tab_restore::Split&>(entry);
  std::vector<content::WebContents*> survivors(2, nullptr);
  bool ambiguous = false;
  for (int pane = 0; pane < 2; ++pane) {
    const auto identity = saved.tabs[pane]->extra_data.find(kTabIdentityKey);
    if (identity == saved.tabs[pane]->extra_data.end() || identity->second.empty())
      return std::nullopt;
    GlobalBrowserCollection::GetInstance()->ForEach([&](BrowserWindowInterface* other) {
      if (other->GetProfile() != browser->GetProfile()) return true;
      auto* tabs = other->GetTabStripModel();
      for (int i = 0; i < tabs->count(); ++i) {
        auto* tab = tabs->GetWebContentsAt(i);
        if (TabIdentity(tab) != identity->second) continue;
        if (other != browser || survivors[pane]) ambiguous = true;
        survivors[pane] = tab;
      }
      return true;
    });
  }
  if (ambiguous) return false;
  if (!survivors[0] && !survivors[1]) return std::nullopt;
  if (survivors[0] && survivors[1]) return false;
  const int retained = survivors[0] ? 0 : 1;
  const int missing = 1 - retained;
  auto* model = browser->GetTabStripModel();
  auto* survivor = survivors[retained];
  int index = model->GetIndexOfWebContents(survivor);
  if (index < 0 || model->IsTabPinned(index) || model->GetSplitForTab(index)) return false;
  const auto survivor_history_id = saved.tabs[retained]->id;
  const auto missing_history_id = saved.tabs[missing]->id;
  const auto visual = saved.visual_data;
  const auto restored = service->RestoreEntryById(BrowserLiveTabContext::From(browser),
      missing_history_id, WindowOpenDisposition::NEW_FOREGROUND_TAB);
  if (!restored || restored->size() != 1 || !(*restored)[0]) return false;
  content::WebContents* recovered = nullptr;
  for (int i = 0; i < model->count(); ++i)
    if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)) ==
        (*restored)[0]->GetSessionID()) recovered = model->GetWebContentsAt(i);
  if (!recovered) return false;
  survivors[missing] = recovered;
  index = model->GetIndexOfWebContents(survivor);
  int recovered_index = model->GetIndexOfWebContents(recovered);
  const auto group = model->GetTabGroupForTab(index);
  if (model->GetTabGroupForTab(recovered_index) != group) {
    if (group) model->AddToExistingGroup({recovered_index}, *group);
    else model->RemoveFromGroup({recovered_index});
  }
  const int left = model->GetIndexOfWebContents(survivors[0]);
  const int right = model->GetIndexOfWebContents(survivors[1]);
  const auto split = model->AddToNewSplit({left, right}, visual,
      split_tabs::SplitTabCreatedSource::kToolbarButton);
  if (left > right) model->ReverseTabsInSplit(split);
  for (int i = 0; i < 2; ++i) MarkPersistentSplit(browser, survivors[i], true, i == *focus);
  model->ActivateTabAt(model->GetIndexOfWebContents(survivors[*focus]));
  service->RemoveEntryById(survivor_history_id);
  return true;
}

void UpdatePersistentSplitFocus(BrowserWindowInterface* browser) {
  if (SessionRestore::IsRestoring(browser->GetProfile())) return;
  auto* model = browser->GetTabStripModel();
  const int active = model->active_index();
  if (active < 0) return;
  const auto split = model->GetSplitForTab(active);
  if (!split) return;
  for (int i = 0; i < model->count(); ++i) {
    if (model->GetSplitForTab(i) != split) continue;
    auto* tab = model->GetWebContentsAt(i);
    auto* data = static_cast<PersistentSplitData*>(tab->GetUserData(kPersistentSplitKey));
    if (data && data->focused != (i == active)) MarkPersistentSplit(browser, tab, true, i == active);
  }
}
bool ValidSpace(const base::DictValue& record) {
  const auto* tabs = record.FindList("tabs");
  const auto* groups = record.FindList("groups");
  auto active = record.FindInt("active");
  if (!tabs || tabs->empty() || tabs->size() > 200 || !groups ||
      groups->size() > tabs->size() || !active || *active < 0 ||
      *active >= static_cast<int>(tabs->size())) return false;
  bool loose = false;
  std::set<int> ended;
  int prior = -1;
  for (const auto& value : *tabs) {
    if (!value.is_dict()) return false;
    const auto& tab = value.GetDict();
    const auto* url = tab.FindString("url");
    const auto pin = tab.FindBool("pinned");
    const auto group = tab.FindInt("group");
    if (!url || url->size() > 8192 || !pin || !group || *group < -1 ||
        *group >= static_cast<int>(groups->size())) return false;
    const GURL parsed(*url);
    if (!parsed.is_valid() || parsed.has_username() || parsed.has_password() ||
        (!parsed.SchemeIsHTTPOrHTTPS() && parsed != GURL("chrome://newtab/"))) return false;
    if (*pin && (loose || *group >= 0)) return false;
    if (!*pin) loose = true;
    if (*group != prior) { if (prior >= 0) ended.insert(prior); if (ended.contains(*group)) return false; }
    prior = *group;
  }
  for (const auto& value : *groups) {
    if (!value.is_dict()) return false;
    const auto& group = value.GetDict();
    const auto* name = group.FindString("name");
    const auto color = group.FindInt("color");
    if (!name || name->size() > 512 || !color || *color < 0 || *color > 8 ||
        !group.FindBool("collapsed")) return false;
  }
  // PR993 columns: optional for legacy records, both required when present.
  const auto* splits = record.FindList("splits");
  const auto* ids = record.FindList("splitIds");
  if (record.contains("splits") || record.contains("splitIds")) {
    if (!splits || !ids || ids->size() != tabs->size() || splits->size() > tabs->size() / 2) return false;
    std::map<std::string, std::vector<int>> membership;
    for (size_t i = 0; i < ids->size(); ++i) {
      if ((*ids)[i].is_none()) continue;
      if (!(*ids)[i].is_string()) return false;
      membership[(*ids)[i].GetString()].push_back(i);
    }
    if (membership.size() != splits->size()) return false;
    std::set<std::string> seen;
    for (const auto& value : *splits) {
      if (!value.is_dict()) return false;
      const auto& split = value.GetDict();
      const auto* id = split.FindString("id");
      const auto* layout = split.FindDict("layout");
      const auto focus = split.FindInt("focusedIndex");
      if (!id || *id != "split-" + base::NumberToString(seen.size()) || !seen.insert(*id).second || !membership.contains(*id) || !layout || !focus || *focus < 0 || *focus > 1) return false;
      const auto& members = membership.at(*id);
      if (members.size() != 2 || members[1] != members[0] + 1 ||
          (std::ranges::contains(members, *active) && *active != members[*focus])) return false;
      const auto* kind = layout->FindString("kind");
      const auto* widths = layout->FindList("widths");
      if (!kind || *kind != "columns" || !widths || widths->size() != 2) return false;
      auto a = (*widths)[0].GetIfDouble(), b = (*widths)[1].GetIfDouble();
      if (!a || !b || !std::isfinite(*a) || !std::isfinite(*b) || *a < .2 || *b < .2 || std::abs(*a + *b - 1) > 1e-6) return false;
      const auto& first = (*tabs)[members[0]].GetDict();
      const auto& second = (*tabs)[members[1]].GetDict();
      if (*first.FindBool("pinned") || *second.FindBool("pinned") || first.FindInt("group") != second.FindInt("group")) return false;
    }
  }
  return true;
}
std::optional<base::DictValue> CaptureNativeSpace(BrowserWindowInterface* browser) {
  if (browser->GetProfile()->IsOffTheRecord()) return std::nullopt;
  auto* model = browser->GetTabStripModel();
  // Temporary Glance is never serialized as persistent Split View.
  for (auto* owner : Owner::Live()) if (owner->browser == browser && owner->glance_main >= 0) return std::nullopt;
  base::ListValue tabs, groups, splits, split_ids;
  std::map<split_tabs::SplitTabId, std::string> captured_splits;
  UpdatePersistentSplitFocus(browser);
  const auto order = GroupsInOrder(model);
  for (const auto& id : order) {
    const auto* v = GroupVisuals(model, id);
    if (!v) return std::nullopt;
    groups.Append(base::DictValue().Set("name", base::UTF16ToUTF8(v->title()))
        .Set("color", static_cast<int>(v->color())).Set("collapsed", v->is_collapsed()));
  }
  for (int i = 0; i < model->count(); ++i) {
    auto* tab = model->GetWebContentsAt(i);
    // In-flight navigation and unload-sensitive forms remain ineligible.
    if (tab->IsLoading() ||
        tab->NeedToFireBeforeUnload()) return std::nullopt;
    if (auto id = model->GetSplitForTab(i)) {
      if (!tab->GetUserData(kPersistentSplitKey)) return std::nullopt;
      if (!captured_splits.contains(*id)) {
        auto* data = model->GetSplitData(*id);
        const auto range = data->GetIndexRange();
        const auto* visual = data->visual_data();
        if (range.length() != 2 ||
            visual->split_layout() != split_tabs::SplitTabLayout::kSideBySide) return std::nullopt;
        const double ratio = visual->split_ratio();
        int focus = -1;
        for (int j = range.start(); j < static_cast<int>(range.end()); ++j) {
          auto* member = static_cast<PersistentSplitData*>(model->GetWebContentsAt(j)->GetUserData(kPersistentSplitKey));
          if (!member) return std::nullopt;
          if (member->focused) { if (focus >= 0) return std::nullopt; focus = j - range.start(); }
        }
        if (focus < 0) return std::nullopt;
        const std::string key = "split-" + base::NumberToString(captured_splits.size());
        splits.Append(base::DictValue().Set("id", key)
            .Set("layout", base::DictValue().Set("kind", "columns").Set("widths", base::ListValue().Append(ratio).Append(1 - ratio)))
            .Set("focusedIndex", focus));
        captured_splits.emplace(*id, key);
      }
      split_ids.Append(captured_splits.at(*id));
    } else split_ids.Append(base::Value());
    GURL url = tab->GetLastCommittedURL();
    if (tab->GetVisibleURL() == GURL("chrome://newtab/") ||
        url == GURL("chrome://blanc-prototype/pages/newtab.html")) url = GURL("chrome://newtab/");
    int group_index = -1;
    if (const auto group = model->GetTabGroupForTab(i)) {
      const auto it = std::ranges::find(order, *group);
      if (it == order.end()) return std::nullopt;
      group_index = it - order.begin();
    }
    tabs.Append(base::DictValue().Set("url", url.spec()).Set("pinned", model->IsTabPinned(i)).Set("group", group_index));
  }
  auto record = base::DictValue().Set("tabs", std::move(tabs)).Set("groups", std::move(groups)).Set("active", model->active_index());
  // Keep unsplit legacy records byte-shape compatible with existing journals.
  if (!splits.empty()) { record.Set("splits", std::move(splits)); record.Set("splitIds", std::move(split_ids)); }
  if (!ValidSpace(record)) return std::nullopt;
  return record;
}
base::DictValue SpaceDisk(base::FilePath path, std::string method,
                          std::string name, base::DictValue capture) {
  const auto journal = path.AddExtensionASCII("switch");
  if (method == "spaceRollback" || method == "spaceCommit") {
    if (!base::PathExists(journal)) return base::DictValue().Set("none", true);
    std::string bytes;
    if (!base::ReadFileToStringWithMaxSize(journal, &bytes, 4 * 1024 * 1024)) return base::DictValue().Set("error", "Switch recovery record unreadable.");
    auto intent = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
    if (!intent || (intent->FindInt("version") != 1 && intent->FindInt("version") != 2 && intent->FindInt("version") != 3 && intent->FindInt("version") != 4) || !intent->FindString("id") || !intent->FindString("source_name") || !intent->FindDict("source") || !ValidSpace(*intent->FindDict("source")) || !intent->FindDict("destination") || !ValidSpace(*intent->FindDict("destination"))) return base::DictValue().Set("error", "Switch recovery record invalid; retained.");
    if (intent->FindInt("version").value_or(0) >= 2 && (!intent->FindString("source_window") || !base::Uuid::ParseLowercase(*intent->FindString("source_window")).is_valid())) return base::DictValue().Set("error", "Switch window identity invalid; retained.");
    if (intent->FindInt("version").value_or(0) >= 3) {
      const auto* ids = intent->FindList("source_tabs");
      std::set<std::string> unique;
      if (!ids || ids->size() != intent->FindDict("source")->FindList("tabs")->size())
        return base::DictValue().Set("error", "Switch tab identities invalid; retained.");
      for (const auto& value : *ids)
        if (!value.is_string() || !base::Uuid::ParseLowercase(value.GetString()).is_valid() ||
            !unique.insert(value.GetString()).second)
          return base::DictValue().Set("error", "Switch tab identities invalid; retained.");
    }
    if (method == "spaceCommit") {
      if (*intent->FindString("id") != name || !base::DeleteFile(journal)) return base::DictValue().Set("error", "Switch completion could not be recorded.");
      return base::DictValue();
    }
    auto result = base::DictValue().Set("record", intent->FindDict("source")->Clone()).Set("transaction", *intent->FindString("id")).Set("source_name", *intent->FindString("source_name")).Set("source_window", intent->FindString("source_window") ? *intent->FindString("source_window") : "");
    if (intent->FindInt("version").value_or(0) >= 3)
      result.Set("source_tabs", intent->FindList("source_tabs")->Clone());
    return result;
  }
  if ((method == "previewSpaceSave" || method == "previewSpaceOpen" || method == "previewSpaceRecover") && base::PathExists(journal)) return base::DictValue().Set("error", "Interrupted switch pending; saved spaces unchanged.");
  base::DictValue store;
  const bool recover = method == "previewSpaceRecover";
  const auto load_path = recover ? path.AddExtensionASCII("backup") : path;
  if (!recover && !base::PathExists(path) && base::PathExists(path.AddExtensionASCII("backup")))
    return base::DictValue().Set("error", "Space store missing; recover the previous checkpoint explicitly.");
  if (recover && !base::PathExists(load_path))
    return base::DictValue().Set("error", "No previous space checkpoint exists.");
  if (base::PathExists(load_path)) {
    std::string bytes;
    if (!base::ReadFileToStringWithMaxSize(load_path, &bytes, 4 * 1024 * 1024))
      return base::DictValue().Set("error", "Space store unreadable; unchanged.");
    auto parsed = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
    if (!parsed || (parsed->FindInt("version") != 1 && parsed->FindInt("version") != 2) || !parsed->FindDict("items"))
      return base::DictValue().Set("error", "Space store invalid; unchanged.");
    store = std::move(*parsed);
  } else { store.Set("version", 1); store.Set("items", base::DictValue()); }
  auto* items = store.FindDict("items");
  if (items->size() > 25) return base::DictValue().Set("error", "Space limit exceeded.");
  for (const auto [key, value] : *items) {
    if (key.empty() || key.size() > 120 || !value.is_dict() || !ValidSpace(value.GetDict()))
      return base::DictValue().Set("error", "Space record invalid; unchanged.");
  }
  if (method == "previewSpaceSave") {
    if (!ValidSpace(capture) || (!items->contains(name) && items->size() >= 25))
      return base::DictValue().Set("error", "Cannot save this space.");
    // Preserve the validated previous generation before replacing the main
    // file. Recovery is explicit; corrupt data is never silently overwritten.
    auto previous = base::WriteJson(store);
    if (!previous || !base::ImportantFileWriter::WriteFileAtomically(path.AddExtensionASCII("backup"), *previous))
      return base::DictValue().Set("error", "Previous space checkpoint write failed.");
    if (capture.contains("splits")) store.Set("version", 2);
    items->Set(name, std::move(capture));
    auto json = base::WriteJson(store);
    if (!json || !base::ImportantFileWriter::WriteFileAtomically(path, *json))
      return base::DictValue().Set("error", "Space write failed.");
  }
  if (recover) {
    auto json = base::WriteJson(store);
    if (!json || !base::ImportantFileWriter::WriteFileAtomically(path, *json))
      return base::DictValue().Set("error", "Space recovery write failed.");
  }
  if (method == "previewSpaceOpen") {
    const auto* item = items->FindDict(name);
    if (!item) return base::DictValue().Set("error", "Space does not exist.");
    const auto* source_key = capture.FindString("_source_name");
    const std::string source_name = source_key ? *source_key : "";
    const auto* window_key = capture.FindString("_source_window");
    const std::string window_id = window_key ? *window_key : "";
    auto* source_ids = capture.FindList("_source_tabs");
    if (!source_ids || source_ids->size() != capture.FindList("tabs")->size())
      return base::DictValue().Set("error", "Source tab identities unavailable.");
    std::set<std::string> unique_ids;
    for (const auto& value : *source_ids)
      if (!value.is_string() || !base::Uuid::ParseLowercase(value.GetString()).is_valid() ||
          !unique_ids.insert(value.GetString()).second)
        return base::DictValue().Set("error", "Source tab identities ambiguous.");
    auto tab_ids = source_ids->Clone();
    capture.Remove("_source_tabs");
    capture.Remove("_source_name");
    capture.Remove("_source_window");
    if (!base::Uuid::ParseLowercase(window_id).is_valid()) return base::DictValue().Set("error", "Source window identity unavailable.");
    const auto* source = items->FindDict(source_name);
    if (!source || *source != capture) return base::DictValue().Set("error", "Source space is not durably saved.");
    const std::string transaction = base::Uuid::GenerateRandomV4().AsLowercaseString();
    auto intent = base::WriteJson(base::DictValue().Set("version", capture.contains("splits") || item->contains("splits") ? 4 : 3).Set("source_tabs", std::move(tab_ids)).Set("source_window", window_id).Set("id", transaction).Set("source_name", source_name).Set("source", capture.Clone()).Set("destination", item->Clone()));
    if (!intent || !base::ImportantFileWriter::WriteFileAtomically(journal, *intent)) return base::DictValue().Set("error", "Switch intent write failed; tabs unchanged.");
    return base::DictValue().Set("record", item->Clone()).Set("transaction", transaction);
  }
  base::ListValue names;
  for (const auto [key, value] : *items) names.Append(key);
  return base::DictValue().Set("names", std::move(names));
}

// Read Chromium's installed theme; private windows retain their private appearance.
// Image bytes come from the validated native theme pack, never a renderer path.
base::DictValue InstalledTheme(Profile* profile, bool images = false) {
  base::DictValue result;
  if (profile->IsOffTheRecord()) return result;
  auto* service = ThemeServiceFactory::GetForProfile(profile);
  if (!service || !service->UsingExtensionTheme()) return result;
  auto* supplier = service->GetThemeSupplier();
  if (!supplier) return result;
  result.Set("id", service->GetThemeID());
  const auto color = [&](const char* name, int property) {
    SkColor value = ThemeProperties::GetDefaultColor(property, false);
    supplier->GetColor(property, &value);
    result.Set(name, base::StringPrintf("#%02x%02x%02x",
        SkColorGetR(value), SkColorGetG(value), SkColorGetB(value)));
  };
  color("frame", ThemeProperties::COLOR_FRAME_ACTIVE);
  color("surface", ThemeProperties::COLOR_TOOLBAR);
  color("text", ThemeProperties::COLOR_TOOLBAR_TEXT);
  color("background", ThemeProperties::COLOR_NTP_BACKGROUND);
  color("backgroundText", ThemeProperties::COLOR_NTP_TEXT);
  color("link", ThemeProperties::COLOR_NTP_LINK);
  if (images) {
    const auto& provider = ThemeService::GetThemeProviderForProfile(profile);
    const auto image = [&](const char* name, int resource) {
      if (!provider.HasCustomImage(resource)) return;
      auto bytes = provider.GetRawData(resource, ui::k100Percent);
      if (bytes && bytes->size() && bytes->size() <= 8 * 1024 * 1024)
        result.Set(name, std::string("chrome://blanc-prototype/") +
            (resource == IDR_THEME_NTP_BACKGROUND ? "theme-background.png?" : "theme-attribution.png?") + service->GetThemeID());
    };
    image("image", IDR_THEME_NTP_BACKGROUND);
    image("attribution", IDR_THEME_NTP_ATTRIBUTION);
    const int alignment = provider.GetDisplayProperty(ThemeProperties::NTP_BACKGROUND_ALIGNMENT);
    result.Set("position", std::string(alignment & ThemeProperties::ALIGN_LEFT ? "left" :
        alignment & ThemeProperties::ALIGN_RIGHT ? "right" : "center") + " " +
        (alignment & ThemeProperties::ALIGN_TOP ? "top" :
         alignment & ThemeProperties::ALIGN_BOTTOM ? "bottom" : "center"));
    const int tiling = provider.GetDisplayProperty(ThemeProperties::NTP_BACKGROUND_TILING);
    result.Set("repeat", tiling == ThemeProperties::REPEAT ? "repeat" :
        tiling == ThemeProperties::REPEAT_X ? "repeat-x" :
        tiling == ThemeProperties::REPEAT_Y ? "repeat-y" : "no-repeat");
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
  base::ListValue persistent_splits;
  // Live UI metadata is independent of persistence admission (including private
  // windows, loading documents and unload-sensitive forms).
  UpdatePersistentSplitFocus(browser);
  for (int i = 0; i < model->count(); ++i) {
    const auto id = model->GetSplitForTab(i);
    if (!id) continue;
    const auto* data = model->GetSplitData(*id);
    const auto range = data->GetIndexRange();
    if (i != static_cast<int>(range.start()) || range.length() != 2 ||
        data->visual_data()->split_layout() != split_tabs::SplitTabLayout::kSideBySide) continue;
    base::ListValue members;
    int focus = -1;
    bool valid = true;
    for (int j = range.start(); j < static_cast<int>(range.end()); ++j) {
      auto* tab = model->GetWebContentsAt(j);
      auto* state = static_cast<PersistentSplitData*>(tab->GetUserData(kPersistentSplitKey));
      if (!state) { valid = false; break; }
      if (state->focused) { if (focus >= 0) { valid = false; break; } focus = j - range.start(); }
      members.Append(sessions::SessionTabHelper::IdForTab(tab).id());
    }
    if (!valid || focus < 0) continue;
    const double ratio = data->visual_data()->split_ratio();
    auto split = base::DictValue()
        .Set("id", "split-" + base::NumberToString(persistent_splits.size()))
        .Set("layout", base::DictValue().Set("kind", "columns")
            .Set("widths", base::ListValue().Append(ratio).Append(1 - ratio)))
        .Set("focusedIndex", focus).Set("focusedTabId", members[focus].Clone());
    split.Set("tabIds", std::move(members));
    persistent_splits.Append(std::move(split));
  }
  const int main_index = owner->MainIndex();
  auto* active = main_index >= 0 ? model->GetWebContentsAt(main_index) : nullptr;
  auto* focused = model->GetActiveWebContents();
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
      .Set("installedTheme", InstalledTheme(browser->GetProfile()))
      .Set("splitGeometry", owner->split_geometry.Clone())
      .Set("spaceName", owner->space_name)
      .Set("spaceAutosaveError", owner->space_error)
      .Set("spaceBusy", owner->space_busy)
      .Set("spaceWindowIdentity", WindowIdentity(browser))
      .Set("initialWindowSaved", owner->initial_window_saved)
      .Set("initialWindowSaveFailed", owner->initial_window_save_failed)
      .Set("extensionsWidth", extension_width)
      .Set("tabs", std::move(tabs))
      .Set("activeTabId", std::move(active_id))
      .Set("groups", std::move(groups))
      .Set("splits", std::move(persistent_splits))
      .Set("closed", ClosedEntries(browser->GetProfile()))
      .Set("glanceTabId", owner->glance_reference >= 0 ? base::Value(owner->glance_reference) : base::Value())
      .Set("focusedTabId", focused ? base::Value(sessions::SessionTabHelper::IdForTab(focused).id()) : base::Value())
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
    if (method == "installedTheme" && args.size() == 1 && args[0].is_string()) {
      auto theme = InstalledTheme(profile);
      const auto* theme_id = theme.FindString("id");
      if (args[0].GetString() == (theme_id ? *theme_id : "")) Reply(id, true, base::Value());
      else Reply(id, true, base::Value(InstalledTheme(profile, true)));
      return;
    }
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

// Public Store HTML is treated only as data. Never load it into the Island DOM.
// Deliberately conservative: changed markup produces an explicit unavailable state.
base::ListValue ParseStoreResults(const std::string& html) {
  base::ListValue items;
  std::set<std::string> seen;
  const std::string marker = "data-item-id=\"";
  size_t at = 0;
  while ((at = html.find(marker, at)) != std::string::npos && items.size() < 6) {
    at += marker.size();
    const auto end = html.find('"', at);
    if (end == std::string::npos) break;
    const std::string id = html.substr(at, end - at);
    const auto next = html.find(marker, end);
    const auto card = html.substr(end, std::min(size_t(20000), next - end));
    if (id.size() != 32 || id.find_first_not_of("abcdefghijklmnop") != std::string::npos || !seen.insert(id).second) continue;
    auto text = [&](const std::string& start, const std::string& close) {
      auto begin = card.find(start);
      if (begin == std::string::npos) return std::string();
      begin = card.find('>', begin);
      if (begin == std::string::npos) return std::string();
      const auto stop = card.find(close, ++begin);
      if (stop == std::string::npos || stop - begin > 1000) return std::string();
      const auto raw = card.substr(begin, stop - begin);
      if (raw.find('<') != std::string::npos) return std::string();
      return base::UTF16ToUTF8(base::UnescapeForHTML(base::UTF8ToUTF16(raw)));
    };
    const auto name = text("<h2", "</h2>");
    if (name.empty() || card.find("/" + id + "\"") == std::string::npos) continue;
    base::DictValue item;
    item.Set("id", id);
    item.Set("name", name);
    item.Set("description", text("<p class=\"g3IrHd\"", "</p>"));
    // The card's first image can be a promotional screenshot. The public
    // serialized item record instead identifies the extension's actual icon.
    const std::string icon_marker = "[\"" + id + "\",\"";
    auto icon_at = html.find(icon_marker);
    if (icon_at != std::string::npos) {
      icon_at += icon_marker.size();
      const auto icon_end = html.find('"', icon_at);
      if (icon_end != std::string::npos && icon_end - icon_at < 2048) {
        const GURL icon(html.substr(icon_at, icon_end - icon_at));
        if (icon.is_valid() && icon.SchemeIs("https") &&
            icon.host() == "lh3.googleusercontent.com" && !icon.has_username() &&
            !icon.has_password() && !icon.has_port() && !icon.has_query() &&
            !icon.has_ref() && icon.path().find('=') == std::string::npos) {
          item.Set("icon", icon.spec() + "=s72");
        }
      }
    }

    items.Append(std::move(item));
  }
  return items;
}

// Keep the native extension commands and policy checks, but report the menu outcome
// separately from focus changes so the Island can stay visible behind the menu.
class IslandExtensionMenu : public extensions::ExtensionContextMenuModel {
 public:
  IslandExtensionMenu(const extensions::Extension* extension,
                      BrowserWindowInterface* browser, bool pinned,
                      base::RepeatingClosure closed)
      : ExtensionContextMenuModel(extension, browser, pinned, nullptr, true,
                                  ContextMenuSource::kToolbarAction),
        closed_(std::move(closed)) {}
  void ExecuteCommand(int command, int flags) override {
    selected = true;
    ExtensionContextMenuModel::ExecuteCommand(command, flags);
  }
  void MenuClosed(ui::SimpleMenuModel* source) override {
    ExtensionContextMenuModel::MenuClosed(source);
    if (source == this) closed_.Run();
  }
  bool selected = false;
 private:
  base::RepeatingClosure closed_;
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
    split_closes_.clear();
    extension_menu_runner_.reset();
    extension_menu_adapter_.reset();
    extension_menu_.reset();
    store_loader_.reset();
    icon_loaders_.clear();
  }

 private:
  void ExtensionMenuClosed(std::string id) {
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&Handler::ExtensionMenuResult,
                                 weak_factory_.GetWeakPtr(), std::move(id)));
  }
  void ExtensionMenuResult(std::string id) {
    Reply(id, true, base::Value(extension_menu_ && extension_menu_->selected));
  }
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
  class SplitCloseWatch : public content::WebContentsObserver {
   public:
    SplitCloseWatch(content::WebContents* tab, base::RepeatingClosure cancelled)
        : content::WebContentsObserver(tab), cancelled_(std::move(cancelled)) {}
    void BeforeUnloadFired(bool proceed) override { if (!proceed) cancelled_.Run(); }
    void BeforeUnloadDialogCancelled() override { cancelled_.Run(); }
   private:
    base::RepeatingClosure cancelled_;
  };
  struct PendingSplitClose {
    base::WeakPtr<BrowserWindowInterface> browser;
    std::vector<int> tabs;
    std::vector<std::unique_ptr<SplitCloseWatch>> watches;
    bool cancelled = false;
  };
  std::map<std::string, PendingSplitClose> split_closes_;
  void SplitCloseCancelled(std::string id) {
    auto it = split_closes_.find(id);
    if (it != split_closes_.end()) it->second.cancelled = true;
  }
  void SplitCloseSaved(std::string id, bool cancelled, bool saved) {
    if (!split_closes_.erase(id)) return;
    Reply(id, saved && !cancelled, saved ?
        (cancelled ? base::Value("Split closure cancelled; partial history and session saved.") : base::Value()) :
        base::Value("Split history/session persistence failed; recovery is not acknowledged."));
  }
  void SplitSessionSaved(std::string id, bool cancelled, bool saved) {
    auto it = split_closes_.find(id);
    if (it == split_closes_.end()) return;
    if (!saved || !it->second.browser) { SplitCloseSaved(id, cancelled, false); return; }
    auto* service = ClosedService(it->second.browser->GetProfile());
    if (!service) { SplitCloseSaved(id, cancelled, false); return; }
    service->SaveAndFlush(base::BindOnce(&Handler::SplitCloseSaved,
        weak_factory_.GetWeakPtr(), id, cancelled));
  }
  void CheckSplitClose(std::string id) {
    auto it = split_closes_.find(id);
    if (it == split_closes_.end()) return;
    auto* browser = it->second.browser.get();
    if (!browser) { SplitCloseSaved(id, false, false); return; }
    auto* model = browser->GetTabStripModel();
    bool surviving = false;
    for (int i = 0; i < model->count(); ++i)
      for (int tab_id : it->second.tabs)
        surviving |= sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id() == tab_id;
    if (surviving && !it->second.cancelled) {
      base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
          base::BindOnce(&Handler::CheckSplitClose, weak_factory_.GetWeakPtr(), id), base::Milliseconds(25));
      return;
    }
    const bool cancelled = it->second.cancelled;
    base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
        base::BindOnce(&Handler::SplitCloseSaved, weak_factory_.GetWeakPtr(), id, cancelled, false), base::Seconds(9));
    if (browser->GetProfile()->IsOffTheRecord()) { SplitCloseSaved(id, cancelled, true); return; }
    if (!cancelled) { SplitSessionSaved(id, false, true); return; }
    auto* service = SessionServiceFactory::GetForProfile(browser->GetProfile());
    if (!service) { SplitCloseSaved(id, cancelled, false); return; }
    // Run after unload callbacks unwind, capturing only actual surviving tabs.
    service->ResetFromCurrentBrowsers();
    service->SaveAndFlushSession(base::BindOnce(&Handler::SplitSessionSaved,
        weak_factory_.GetWeakPtr(), id, cancelled));
  }
  void ClosedHistorySaved(std::string id, bool saved) {
    if (!history_saves_.erase(id)) return;
    Reply(id, saved, saved ? base::Value() :
        base::Value("Tab closed, but history persistence failed or timed out."));
  }
  void SaveClosedHistory(std::string id, Profile* profile) {
    if (profile->IsOffTheRecord()) { Reply(id, true, base::Value()); return; }
    history_saves_.insert(id);
    auto* service = ClosedService(profile);
    if (!service) {
      ClosedHistorySaved(id, false);
      return;
    }
    service->SaveAndFlush(base::BindOnce(
        &Handler::ClosedHistorySaved, weak_factory_.GetWeakPtr(), id));
    base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
        FROM_HERE, base::BindOnce(&Handler::ClosedHistorySaved,
          weak_factory_.GetWeakPtr(), id, false), base::Seconds(10));
  }
  std::set<std::string> history_saves_;
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
  void AutosaveReady(base::DictValue capture, base::DictValue result) {
    auto* owner = GetOwner(web_ui()->GetWebContents());
    if (!owner) return;
    owner->space_busy = false;
    if (const auto* error = result.FindString("error")) owner->space_error = *error;
    else owner->space_saved = std::move(capture);
  }
  void SwitchCommitted(base::DictValue result) {
    auto* owner = GetOwner(web_ui()->GetWebContents());
    if (!owner) return;
    owner->space_busy = false;
    if (const auto* error = result.FindString("error")) { owner->space_error = *error; return; }
    owner->space_transaction.clear(); owner->space_expected.reset();
  }
  void SpaceSaveTimeout(std::string id, uint64_t generation) {
    if (!space_save_pending_ || generation != space_save_generation_) return;
    space_save_pending_ = false;
    if (auto* owner = GetOwner(web_ui()->GetWebContents())) {
      owner->space_busy = false;
      owner->space_error = "Session metadata save acknowledgement timed out.";
    }
    Reply(id, false, base::Value("Session metadata save acknowledgement timed out."));
  }
  static std::string BeginPreferenceWrite(Profile* profile) {
    static const base::NoDestructor<std::string> epoch(
        base::Uuid::GenerateRandomV4().AsLowercaseString());
    static uint64_t sequence = 0;
    CHECK(sequence < std::numeric_limits<uint64_t>::max());
    std::string marker = *epoch + ":" + base::NumberToString(++sequence);
    profile->GetPrefs()->SetString("blanc.prototype.preference_write", marker);
    return marker;
  }
  static bool PreferenceWriteReached(base::FilePath path, std::string expected) {
    std::string bytes;
    if (!base::ReadFileToString(path, &bytes)) return false;
    auto prefs = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_CHROMIUM_EXTENSIONS);
    const auto* marker = prefs ? prefs->FindStringByDottedPath(
        "blanc.prototype.preference_write") : nullptr;
    const auto split = expected.find(':');
    if (!marker || split == std::string::npos ||
        !base::StartsWith(*marker, expected.substr(0, split + 1))) return false;
    uint64_t requested = 0, persisted = 0;
    return base::StringToUint64(expected.substr(split + 1), &requested) &&
        base::StringToUint64(marker->substr(split + 1), &persisted) &&
        persisted >= requested;
  }
  void SpacePreferencesCommitted(std::string id, std::string name,
      base::DictValue captured, base::DictValue disk_capture,
      base::WeakPtr<BrowserWindowInterface> expected_browser,
      std::string identity, uint64_t generation, std::string write_marker) {
    if (!space_save_pending_ || generation != space_save_generation_ ||
        !expected_browser) return;
    // Require this attempt's marker, or a later write from this process.
    // A stale readable dictionary cannot prove that this write succeeded.
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&Handler::PreferenceWriteReached,
            expected_browser->GetProfile()->GetPath().AppendASCII("Preferences"),
            std::move(write_marker)),
        base::BindOnce(&Handler::SpaceProfileAcknowledged,
            weak_factory_.GetWeakPtr(), id, name, std::move(captured),
            std::move(disk_capture), expected_browser, identity, generation));
  }
  void SpaceSaveAcknowledged(std::string id, std::string name,
      base::DictValue captured, base::DictValue disk_capture,
      base::WeakPtr<BrowserWindowInterface> expected_browser,
      std::string identity, uint64_t generation, bool success) {
    if (!space_save_pending_ || generation != space_save_generation_) return;
    if (!success || !expected_browser) {
      SpaceProfileAcknowledged(id, name, std::move(captured),
          std::move(disk_capture), expected_browser, identity, generation, false);
      return;
    }
    // Session bytes alone are insufficient on the first run: without the
    // Preferences file, ProfileImpl::IsNewProfile suppresses session restore.
    std::string marker = BeginPreferenceWrite(expected_browser->GetProfile());
    expected_browser->GetProfile()->GetPrefs()->CommitPendingWrite(
        base::BindOnce(&Handler::SpacePreferencesCommitted,
            weak_factory_.GetWeakPtr(), id, name, std::move(captured),
            std::move(disk_capture), expected_browser, identity, generation,
            std::move(marker)));
  }
  void SpaceProfileAcknowledged(std::string id, std::string name,
      base::DictValue captured, base::DictValue disk_capture,
      base::WeakPtr<BrowserWindowInterface> expected_browser,
      std::string identity, uint64_t generation, bool success) {
    if (!space_save_pending_ || generation != space_save_generation_) return;
    space_save_pending_ = false;
    auto* owner = GetOwner(web_ui()->GetWebContents());
    if (!owner) return;
    auto current = CaptureNativeSpace(owner->browser);
    if (!success || !expected_browser || owner->browser != expected_browser.get() ||
        WindowIdentity(owner->browser) != identity || !current || *current != captured) {
      owner->space_busy = false;
      owner->space_error = "Session metadata save failed or source changed; tabs unchanged.";
      Reply(id, false, base::Value(owner->space_error));
      return;
    }
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&SpaceDisk, owner->browser->GetProfile()->GetPath().AppendASCII("BlancPrototypeSpaces.json"),
            "previewSpaceOpen", name, std::move(disk_capture)),
        base::BindOnce(&Handler::SpaceReady, weak_factory_.GetWeakPtr(), id,
            "previewSpaceOpen", name, std::move(captured)));
  }
  void InitialWindowPreferencesCommitted(
      base::WeakPtr<BrowserWindowInterface> expected, base::DictValue capture,
      std::string write_marker) {
    if (!expected) return;
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&Handler::PreferenceWriteReached,
            expected->GetProfile()->GetPath().AppendASCII("Preferences"),
            std::move(write_marker)),
        base::BindOnce(&Handler::InitialWindowSaved, weak_factory_.GetWeakPtr(),
            expected, std::move(capture)));
  }
  void InitialWindowSessionSaved(
      base::WeakPtr<BrowserWindowInterface> expected, base::DictValue capture,
      bool success) {
    if (!success || !expected) {
      InitialWindowSaved(expected, std::move(capture), false);
      return;
    }
    // A fresh profile without Preferences is classified as new on restart,
    // even when its session stream contains every acknowledged window.
    std::string marker = BeginPreferenceWrite(expected->GetProfile());
    expected->GetProfile()->GetPrefs()->CommitPendingWrite(base::BindOnce(
        &Handler::InitialWindowPreferencesCommitted, weak_factory_.GetWeakPtr(),
        expected, std::move(capture), std::move(marker)));
  }
  void InitialWindowSaved(base::WeakPtr<BrowserWindowInterface> expected,
      base::DictValue capture, bool success) {
    auto* owner = GetOwner(web_ui()->GetWebContents());
    if (!expected || !owner || owner->browser != expected.get()) return;
    const auto current = CaptureNativeSpace(expected.get());
    if (!current || *current != capture) {
      owner->initial_window_save_started = false;
      return;
    }
    owner->initial_window_saved = success;
    owner->initial_window_save_failed = !success;
    if (!success) {
      owner->initial_window_save_started = false;
      owner->initial_window_save_failures =
          std::min(owner->initial_window_save_failures + 1, 6);
      owner->initial_window_retry_at = base::TimeTicks::Now() +
          base::Seconds(std::min(1 << (owner->initial_window_save_failures - 1), 30));
    }
  }
  void MaybeSaveInitialWindow(Owner* owner) {
    auto* browser = owner->browser.get();
    if (owner->initial_window_save_started || owner->initial_window_saved ||
        base::TimeTicks::Now() < owner->initial_window_retry_at ||
        browser->CreatedBySessionRestore() ||
        browser->GetProfile()->IsOffTheRecord() ||
        SessionRestore::IsRestoring(browser->GetProfile())) return;
    auto* model = browser->GetTabStripModel();
    if (!model->count()) return;
    for (int i = 0; i < model->count(); ++i)
      if (model->GetWebContentsAt(i)->IsLoading()) return;
    auto capture = CaptureNativeSpace(browser);
    auto* service = SessionServiceFactory::GetForProfile(browser->GetProfile());
    if (!capture || !service) return;
    // New windows created during restore must not depend on the ordinary
    // 2.5-second save timer. Order their identity after initial navigation and
    // flush the native session stream; never write a parallel session format.
    // Restored owners may not have reached their first host refresh yet.
    // Persist their restored identities in the same flush, otherwise a new
    // window can become durable while its restored neighbours lose ownership.
    for (auto* live : Owner::Live()) {
      if (live->browser->GetProfile() != browser->GetProfile()) continue;
      if (WindowIdentity(live->browser).empty()) return;
    }
    for (auto* live : Owner::Live()) {
      if (live->browser->GetProfile() != browser->GetProfile()) continue;
      service->AddWindowExtraData(live->browser->GetSessionID(), kWindowIdentityKey,
                                  WindowIdentity(live->browser));
      auto* tabs = live->browser->GetTabStripModel();
      for (int i = 0; i < tabs->count(); ++i) {
        auto* tab = tabs->GetWebContentsAt(i);
        service->AddTabExtraData(live->browser->GetSessionID(),
            sessions::SessionTabHelper::IdForTab(tab), kTabIdentityKey,
            TabIdentity(tab));
      }
    }
    // A successful flush of an existing stream does not establish that a new
    // window is tracked. Rebuild from the current native browser collection so
    // acknowledgement covers its window, tabs, groups and split metadata too.
    service->ResetFromCurrentBrowsers();
    owner->initial_window_save_started = true;
    service->SaveAndFlushSession(base::BindOnce(&Handler::InitialWindowSessionSaved,
        weak_factory_.GetWeakPtr(), browser->GetWeakPtr(), std::move(*capture)));
  }
  void MaybeRollback(Owner* owner) {
    auto* profile = owner->browser->GetProfile();
    if (!owner->identity_registered && !profile->IsOffTheRecord()) {
      const auto identity = WindowIdentity(owner->browser);
      if (!identity.empty()) {
        if (auto* service = SessionServiceFactory::GetForProfile(profile)) {
          service->AddWindowExtraData(owner->browser->GetSessionID(), kWindowIdentityKey, identity);
          owner->identity_registered = true;
        }
      }
    }
    MaybeSaveInitialWindow(owner);
    if (profile->IsOffTheRecord() || owner->space_busy || SessionRestore::IsRestoring(profile) || owner->recovery_checked) return;
    auto before = CaptureNativeSpace(owner->browser);
    if (!before) return;
    owner->recovery_checked = true;
    owner->space_pending_ids.clear();
    auto* model = owner->browser->GetTabStripModel();
    for (int i=0; i<model->count(); ++i) owner->space_pending_ids.push_back(sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id());
    owner->space_busy = true;
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE, base::BindOnce(&SpaceDisk, profile->GetPath().AppendASCII("BlancPrototypeSpaces.json"), "spaceRollback", "", base::DictValue()), base::BindOnce(&Handler::SpaceReady, weak_factory_.GetWeakPtr(), "", "spaceRollback", "", std::move(*before)));
  }
  void MaybeAutosave(Owner* owner) {
    auto* profile = owner->browser->GetProfile();
    if (owner->space_expected) {
      if (owner->space_busy || !owner->space_error.empty()) return;
      auto current = CaptureNativeSpace(owner->browser);
      if (!current || *current != *owner->space_expected) return;
      std::vector<int> ids;
      auto* model = owner->browser->GetTabStripModel();
      for (int i = 0; i < model->count(); ++i) ids.push_back(sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id());
      if (ids != owner->space_destination_ids) return;
      owner->space_busy = true;
      SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE, base::BindOnce(&SpaceDisk, profile->GetPath().AppendASCII("BlancPrototypeSpaces.json"), "spaceCommit", owner->space_transaction, base::DictValue()), base::BindOnce(&Handler::SwitchCommitted, weak_factory_.GetWeakPtr()));
      return;
    }
    if (profile->IsOffTheRecord() || owner->space_name.empty() || owner->space_busy || !owner->space_error.empty()) return;
    for (auto* other : Owner::Live())
      if (other != owner && other->browser->GetProfile() == profile && other->space_busy) return;
    auto capture = CaptureNativeSpace(owner->browser);
    if (!capture) { owner->space_candidate.reset(); return; }
    if (owner->space_saved && *capture == *owner->space_saved) return;
    if (!owner->space_candidate || *capture != *owner->space_candidate) {
      owner->space_candidate = capture->Clone();
      owner->space_candidate_at = base::TimeTicks::Now();
      return;
    }
    if (base::TimeTicks::Now() - owner->space_candidate_at < base::Seconds(1)) return;
    owner->space_busy = true;
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&SpaceDisk, profile->GetPath().AppendASCII("BlancPrototypeSpaces.json"),
            "previewSpaceSave", owner->space_name, capture->Clone()),
        base::BindOnce(&Handler::AutosaveReady, weak_factory_.GetWeakPtr(), std::move(*capture)));
  }
  void SpaceReady(std::string id, std::string method, std::string name,
                  base::DictValue before, base::DictValue result) {
    auto* owner = GetOwner(web_ui()->GetWebContents());
    if (!owner) return;
    owner->space_busy = false;
    if (const auto* error = result.FindString("error")) {
      owner->space_error = *error;
      if (!id.empty()) Reply(id, false, base::Value(*error)); return;
    }
    if (result.FindBool("none").value_or(false)) return;
    auto* browser = owner->browser.get();
    if (method == "previewSpaceList" || method == "previewSpaceRecover") {
      if (method == "previewSpaceRecover") {
        for (auto* live : Owner::Live()) if (live->browser->GetProfile() == browser->GetProfile()) {
          live->space_name.clear(); live->space_saved.reset(); live->space_candidate.reset(); live->space_error.clear();
        }
      }
      Reply(id, true, base::Value(std::move(result))); return;
    }
    if (method == "spaceRollback") {
      auto* tabs = before.FindList("tabs");
      int windows = 0;
      for (auto* live : Owner::Live()) if (live->browser->GetProfile() == browser->GetProfile()) ++windows;
      const auto* source_window = result.FindString("source_window");
      if (source_window && !source_window->empty()) {
        int matches = 0;
        for (auto* live : Owner::Live()) if (live->browser->GetProfile() == browser->GetProfile() && WindowIdentity(live->browser) == *source_window) ++matches;
        if (matches != 1 || WindowIdentity(browser) != *source_window || SessionRestore::IsRestoring(browser->GetProfile())) {
          owner->space_error = "Interrupted switch retained: no unique matching window identity."; return;
        }
      } else if (windows != 1 || !tabs || tabs->size() != 1 || *(*tabs)[0].GetDict().FindString("url") != "chrome://newtab/" || browser->CreatedBySessionRestore() || SessionRestore::IsRestoring(browser->GetProfile())) {
        owner->space_error = "Interrupted switch retained: startup window ownership is ambiguous."; return;
      }
      name = *result.FindString("source_name");
    }
    std::vector<int> live_ids;
    for (int i = 0; i < browser->GetTabStripModel()->count(); ++i)
      live_ids.push_back(sessions::SessionTabHelper::IdForTab(browser->GetTabStripModel()->GetWebContentsAt(i)).id());
    auto current = CaptureNativeSpace(browser);
    if (!current || *current != before || live_ids != owner->space_pending_ids) {
      Reply(id, false, base::Value("Window changed during disk operation; tabs unchanged.")); return;
    }
    for (auto* other : Owner::Live()) {
      if (other != owner && other->browser->GetProfile() == browser->GetProfile() && other->space_name == name) {
        Reply(id, false, base::Value("Space belongs to another window.")); return;
      }
    }
    if (method == "previewSpaceSave") {
      owner->space_error.clear();
      owner->space_name = name;
      owner->space_saved = std::move(before);
      Reply(id, true, base::Value(std::move(result))); return;
    }
    const auto* record = result.FindDict("record");
    if (!record || !ValidSpace(*record)) { Reply(id, false, base::Value("Invalid saved space.")); return; }
    // SessionRestore already reconstructed these exact source tabs, including
    // Chromium-owned page state. Reopening their URLs would discard form and
    // scroll state. Preserve only a complete matching restored window, after
    // the UUID, restore-in-progress and live-tab guards above have succeeded.
    if (method == "spaceRollback" && browser->CreatedBySessionRestore() &&
        !result.FindList("source_tabs") && *current == *record) {
      owner->space_name = name;
      owner->space_saved = record->Clone();
      owner->space_destination_ids = std::move(live_ids);
      owner->space_expected = record->Clone();
      owner->space_transaction = *result.FindString("transaction");
      owner->space_error.clear();
      return;
    }
    auto* model = browser->GetTabStripModel();
    std::vector<content::WebContents*> old_tabs, added;
    for (int i = 0; i < model->count(); ++i) old_tabs.push_back(model->GetWebContentsAt(i));
    std::map<std::string, content::WebContents*> survivors;
    const auto* source_ids = method == "spaceRollback" ? result.FindList("source_tabs") : nullptr;
    if (source_ids && browser->CreatedBySessionRestore()) {
      for (auto* tab : old_tabs) {
        if (!survivors.emplace(TabIdentity(tab), tab).second) {
          owner->space_error = "Interrupted switch retained: duplicate tab identity.";
          return;
        }
      }
    }
    // Closed-tab history keeps Chromium's serialized page state. Admit only
    // unique exact identities, never a URL-only history match. Wait for the
    // history read before making any live-window mutation.
    std::map<std::string, const sessions::tab_restore::Tab*> closed_tabs;
    auto* closed = source_ids ? ClosedService(browser->GetProfile()) : nullptr;
    if (closed && !closed->IsLoaded()) {
      owner->recovery_checked = false;
      return;
    }
    if (closed) for (const auto& entry : closed->entries()) {
      if (entry->type != sessions::tab_restore::TAB) continue;
      const auto identity = entry->extra_data.find(kTabIdentityKey);
      if (identity == entry->extra_data.end()) continue;
      if (!std::ranges::any_of(*source_ids, [&](const auto& value) {
            return value.GetString() == identity->second;
          })) continue;
      if (!closed_tabs.emplace(identity->second,
              static_cast<const sessions::tab_restore::Tab*>(entry.get())).second) {
        owner->space_error = "Interrupted switch retained: duplicate closed tab identity.";
        return;
      }
    }
    size_t source_index = 0;
    for (const auto& item : *record->FindList("tabs")) {
      content::WebContents* retained = nullptr;
      if (source_ids && !survivors.empty()) {
        auto found = survivors.find((*source_ids)[source_index].GetString());
        if (found != survivors.end() &&
            found->second->GetLastCommittedURL() == GURL(*item.GetDict().FindString("url")))
          retained = found->second;
      }
      if (!retained && source_ids && closed) {
        const auto& identity = (*source_ids)[source_index].GetString();
        const auto found = closed_tabs.find(identity);
        if (found != closed_tabs.end()) {
          const auto* saved = found->second;
          if (!saved->group && !saved->saved_group_id &&
              !saved->navigations.empty() &&
              saved->navigations[saved->normalized_navigation_index()].virtual_url() ==
                  GURL(*item.GetDict().FindString("url"))) {
            auto* live = BrowserLiveTabContext::From(browser)->AddRestoredTab(
                *saved, model->count(), false, false, sessions::tab_restore::TAB);
            if (live) {
              for (int i = 0; i < model->count(); ++i) {
                auto* candidate = model->GetWebContentsAt(i);
                if (sessions::SessionTabHelper::IdForTab(candidate) == live->GetSessionID())
                  retained = candidate;
              }
              if (retained) RestoreTabIdentity(retained, saved->extra_data);
            }
          }
        }
      }
      if (retained) added.push_back(retained);
      else {
        auto* created = chrome::AddAndReturnTabAt(
            browser, GURL(*item.GetDict().FindString("url")), -1, true);
        if (!created) {
          owner->space_error = "Switch staging failed; recovery journal retained.";
          if (!id.empty()) Reply(id, false, base::Value(owner->space_error));
          return;
        }
        added.push_back(created);
      }
      ++source_index;
    }
    std::vector<int> regroup;
    for (auto* tab : added) regroup.push_back(model->GetIndexOfWebContents(tab));
    std::set<split_tabs::SplitTabId> old_splits;
    for (int index : regroup) if (auto split = model->GetSplitForTab(index)) old_splits.insert(*split);
    for (const auto& split : old_splits) model->RemoveSplit(split);
    owner->glance_main = owner->glance_reference = -1;
    model->RemoveFromGroup(regroup);
    for (auto* tab : added) model->SetTabPinned(model->GetIndexOfWebContents(tab), false);
    for (auto* tab : old_tabs) {
      if (std::ranges::contains(added, tab)) continue;
      const int index = model->GetIndexOfWebContents(tab);
      if (index >= 0) model->CloseWebContentsAt(index, TabCloseTypes::CLOSE_CREATE_HISTORICAL_TAB);
    }
    // Closing an old tab can finish asynchronously. Its pinned slot still
    // constrains absolute indices, so establish desired relative order at the
    // unpinned end before assigning saved pins/groups. Completion waits for the
    // exact final capture and IDs after pending old tabs actually disappear.
    for (auto* tab : added)
      model->MoveWebContentsAt(model->GetIndexOfWebContents(tab), model->count() - 1, false);
    const auto& tabs = *record->FindList("tabs");
    for (size_t i = 0; i < added.size(); ++i)
      if (*tabs[i].GetDict().FindBool("pinned")) model->SetTabPinned(model->GetIndexOfWebContents(added[i]), true);
    const auto& groups = *record->FindList("groups");
    std::map<size_t, tab_groups::TabGroupId> restored_groups;
    for (size_t i = 0; i < groups.size(); ++i) {
      std::vector<int> indices;
      for (size_t j = 0; j < added.size(); ++j)
        if (tabs[j].GetDict().FindInt("group") == static_cast<int>(i)) indices.push_back(model->GetIndexOfWebContents(added[j]));
      if (indices.empty()) continue;
      auto group = model->AddToNewGroup(indices);
      restored_groups.emplace(i, group);
      const auto& data = groups[i].GetDict();
      model->ChangeTabGroupVisuals(group, tab_groups::TabGroupVisualData(
          base::UTF8ToUTF16(*data.FindString("name")),
          static_cast<tab_groups::TabGroupColorId>(*data.FindInt("color")), *data.FindBool("collapsed")));
    }
    if (const auto* splits = record->FindList("splits"); splits && !splits->empty()) {
      const auto& ids = *record->FindList("splitIds");
      for (const auto& value : *splits) {
        const auto& saved = value.GetDict();
        std::vector<int> members;
        for (size_t i = 0; i < ids.size(); ++i)
          if (ids[i].is_string() && ids[i].GetString() == *saved.FindString("id")) members.push_back(model->GetIndexOfWebContents(added[i]));
        const double ratio = saved.FindDict("layout")->FindList("widths")->front().GetDouble();
        model->AddToNewSplit(members, split_tabs::SplitTabVisualData(split_tabs::SplitTabLayout::kSideBySide, ratio), split_tabs::SplitTabCreatedSource::kToolbarButton);
        for (size_t i = 0; i < members.size(); ++i) MarkPersistentSplit(browser, model->GetWebContentsAt(members[i]), true, static_cast<int>(i) == *saved.FindInt("focusedIndex"));
      }
    }
    model->ActivateTabAt(model->GetIndexOfWebContents(added[*record->FindInt("active")]));
    // Selecting/closing staging tabs can expand groups. Apply saved visuals
    // after the final selection, just as Recently Closed restoration does.
    for (const auto& [i, group] : restored_groups) {
      const auto& data = groups[i].GetDict();
      model->ChangeTabGroupVisuals(group, tab_groups::TabGroupVisualData(
          base::UTF8ToUTF16(*data.FindString("name")),
          static_cast<tab_groups::TabGroupColorId>(*data.FindInt("color")), *data.FindBool("collapsed")));
    }
    owner->space_name = name;
    owner->space_saved = record->Clone();
    owner->space_destination_ids.clear();
    for (int i = 0; i < model->count(); ++i) {
      auto* tab = model->GetWebContentsAt(i);
      if (std::ranges::contains(added, tab)) owner->space_destination_ids.push_back(sessions::SessionTabHelper::IdForTab(tab).id());
    }
    owner->space_expected = record->Clone();
    owner->space_transaction = *result.FindString("transaction");
    owner->space_error.clear();
    if (!id.empty()) Reply(id, true, base::Value(true));
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
    if (method == "storeIcon" && args.size() == 1 && args[0].is_string()) {
      const GURL url(args[0].GetString());
      if (!url.is_valid() || !url.SchemeIs("https") || url.host() != "lh3.googleusercontent.com" ||
          url.has_username() || url.has_password() || url.has_port() || url.has_query() || url.has_ref() ||
          url.spec().size() > 2048 || icon_loaders_.size() >= 6 || icon_loaders_.contains(id)) {
        reply(false, base::Value("Icon unavailable."));
        return;
      }
      auto request = std::make_unique<network::ResourceRequest>();
      request->url = url;
      request->credentials_mode = network::mojom::CredentialsMode::kOmit;
      request->redirect_mode = network::mojom::RedirectMode::kError;
      auto loader = network::SimpleURLLoader::Create(std::move(request),
          net::DefineNetworkTrafficAnnotation("blanc_store_icon", R"(
            semantics { sender: "Blanc extension search" description: "Loads public extension icons for search results."
              trigger: "User searches for extensions." data: "Public icon URL; no cookies or credentials."
              destination: GOOGLE_OWNED_SERVICE }
            policy { cookies_allowed: NO setting: "Only used for user initiated extension search."
              policy_exception_justification: "Prototype extension discovery." })"));
      loader->SetTimeoutDuration(base::Seconds(6));
      auto* pending = loader.get();
      icon_loaders_[id] = std::move(loader);
      pending->DownloadToString(profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess().get(),
          base::BindOnce(&Handler::StoreIcon, weak_factory_.GetWeakPtr(), id), 256 * 1024);
      return;
    }
    if (method == "storeSearch" && args.size() == 1 && args[0].is_string()) {
      const auto& query = args[0].GetString();
      if (query.size() < 2 || query.size() > 256) {
        reply(false, base::Value("Enter 2–256 characters to search the Store."));
        return;
      }
      if (store_loader_) Reply(store_callback_, false, base::Value("Search replaced."));
      store_callback_ = id;
      auto request = std::make_unique<network::ResourceRequest>();
      request->url = GURL("https://chromewebstore.google.com/search/" + base::EscapeQueryParamValue(query, false) + "?hl=en");
      request->credentials_mode = network::mojom::CredentialsMode::kOmit;
      request->redirect_mode = network::mojom::RedirectMode::kError;
      const auto annotation = net::DefineNetworkTrafficAnnotation("blanc_store_search", R"(
        semantics {
          sender: "Blanc extension search"
          description: "Retrieves public Chrome Web Store search results for the Island extension picker."
          trigger: "User types at least two characters in extension search."
          data: "The extension search query; no cookies or credentials."
          destination: GOOGLE_OWNED_SERVICE
        }
        policy {
          cookies_allowed: NO
          setting: "Only runs while the user searches for extensions."
          policy_exception_justification: "User initiated prototype extension discovery."
        })");
      store_loader_ = network::SimpleURLLoader::Create(std::move(request), annotation);
      store_loader_->SetTimeoutDuration(base::Seconds(6));
      store_loader_->DownloadToString(
          profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess().get(),
          base::BindOnce(&Handler::StoreResults, weak_factory_.GetWeakPtr(), id),
          2 * 1024 * 1024);
      return;
    }

    if (method == "previewSpaceSave" || method == "previewSpaceOpen" || method == "previewSpaceList" || method == "previewSpaceRecover") {
      const bool list = method == "previewSpaceList" || method == "previewSpaceRecover";
      if (profile->IsOffTheRecord() || owner->space_busy ||
          (list ? !args.empty() : args.size() != 1 || !args[0].is_string() ||
              args[0].GetString().empty() || args[0].GetString().size() > 120)) {
        reply(false, base::Value("Space operation unavailable.")); return;
      }
      const std::string name = list ? "" : args[0].GetString();
      for (auto* other : Owner::Live()) {
        if (other != owner && other->browser->GetProfile() == profile &&
            (other->space_busy || (!list && other->space_name == name))) {
          reply(false, base::Value("Space operation belongs to another window.")); return;
        }
      }
      auto captured = list ? std::make_optional(base::DictValue()) : CaptureNativeSpace(browser);
      if (!captured || (method == "previewSpaceOpen" &&
          (!owner->space_saved || *owner->space_saved != *captured))) {
        reply(false, base::Value("Save the complete current window before switching.")); return;
      }
      owner->space_pending_ids.clear();
      for (int i = 0; i < model->count(); ++i)
        owner->space_pending_ids.push_back(sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id());
      owner->space_busy = true;
      auto disk_capture = captured->Clone();
      if (method == "previewSpaceOpen") {
        disk_capture.Set("_source_name", owner->space_name);
        const auto identity = WindowIdentity(browser);
        disk_capture.Set("_source_window", identity);
        auto* service = SessionServiceFactory::GetForProfile(profile);
        if (!service || identity.empty()) {
          owner->space_busy = false;
          reply(false, base::Value("Session metadata save unavailable.")); return;
        }
        space_save_pending_ = true;
        const uint64_t generation = ++space_save_generation_;
        base::ListValue source_ids;
        for (int i = 0; i < model->count(); ++i) {
          auto* tab = model->GetWebContentsAt(i);
          const auto tab_identity = TabIdentity(tab);
          source_ids.Append(tab_identity);
          service->AddTabExtraData(browser->GetSessionID(),
              sessions::SessionTabHelper::IdForTab(tab), kTabIdentityKey, tab_identity);
        }
        disk_capture.Set("_source_tabs", std::move(source_ids));
        service->AddWindowExtraData(browser->GetSessionID(), kWindowIdentityKey, identity);
        service->SaveAndFlushSession(base::BindOnce(&Handler::SpaceSaveAcknowledged,
            weak_factory_.GetWeakPtr(), id, name, std::move(*captured),
            std::move(disk_capture), browser->GetWeakPtr(), identity, generation));
        base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
            base::BindOnce(&Handler::SpaceSaveTimeout, weak_factory_.GetWeakPtr(), id, generation),
            base::Seconds(8));
        return;
      }
      SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
          base::BindOnce(&SpaceDisk, profile->GetPath().AppendASCII("BlancPrototypeSpaces.json"),
              method, name, std::move(disk_capture)),
          base::BindOnce(&Handler::SpaceReady, weak_factory_.GetWeakPtr(), id, method, name, std::move(*captured)));
      return;
    }
    if (method == "previewPageCommand" && args.size() == 1 && args[0].is_string()) {
      const std::map<std::string, int> commands = {
        {"restore", IDC_RESTORE_TAB}, {"slot1", IDC_SELECT_TAB_0}, {"slot2", IDC_SELECT_TAB_1}, {"slot3", IDC_SELECT_TAB_2}, {"slot9", IDC_SELECT_LAST_TAB},
        {"nextTab", IDC_SELECT_NEXT_TAB}, {"previousTab", IDC_SELECT_PREVIOUS_TAB},
        {"hardReload", IDC_RELOAD_BYPASSING_CACHE}, {"close", IDC_CLOSE_TAB},
        {"zoomIn", IDC_ZOOM_PLUS}, {"zoomOut", IDC_ZOOM_MINUS},
        {"zoomReset", IDC_ZOOM_NORMAL}, {"print", IDC_PRINT}};
      const auto command = commands.find(args[0].GetString());
      if (command == commands.end()) { reply(false, base::Value("Unknown page command.")); return; }
      if (command->second == IDC_CLOSE_TAB && model->count() < 2) { reply(true, base::Value(false)); return; }
      // Browser commands already target the focused native WebContents. Do
      // not rewrite explicit row close actions or main-scoped navigation IDs.
      reply(true, base::Value(chrome::ExecuteCommand(browser, command->second)));
      return;
    }
    // Native split foundation only: UI exposure waits for Glance role/focus
    // parity. Never merge pin/group ownership as a side effect of a probe.
    if ((method == "previewGlancePair" || method == "previewSplitPair" || method == "createSplit") && args.size() == 2 &&
        args[0].is_int() && args[1].is_int()) {
      // PR993: a visible split owns both panes. Even a request naming two
      // loose tabs must not replace that presentation with temporary Glance.
      if (method == "previewGlancePair" && model->active_index() >= 0 &&
          model->GetSplitForTab(model->active_index())) {
        reply(true, base::Value(false)); return;
      }
      int first = -1, second = -1;
      for (int i = 0; i < model->count(); ++i) {
        const int tab_id = sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id();
        if (tab_id == args[0].GetInt()) first = i;
        if (tab_id == args[1].GetInt()) second = i;
      }
      if (first < 0 || second < 0 || first == second ||
          model->IsTabPinned(first) || model->IsTabPinned(second) ||
          (method != "createSplit" && (model->GetTabGroupForTab(first) || model->GetTabGroupForTab(second))) ||
          model->GetSplitForTab(first) || model->GetSplitForTab(second)) {
        reply(true, base::Value(false)); return;
      }
      if (method == "createSplit") {
        const auto group = model->GetTabGroupForTab(first);
        auto* initiating = model->GetWebContentsAt(first);
        auto* other = model->GetWebContentsAt(second);
        if (model->GetTabGroupForTab(second) != group) {
          if (group) model->AddToExistingGroup({second}, *group);
          else model->RemoveFromGroup({second});
          first = model->GetIndexOfWebContents(initiating);
          second = model->GetIndexOfWebContents(other);
        }
      }
      MarkPersistentSplit(browser, model->GetWebContentsAt(first), method != "previewGlancePair", true);
      MarkPersistentSplit(browser, model->GetWebContentsAt(second), method != "previewGlancePair");
      const bool reverse = first > second;
      const auto split = model->AddToNewSplit({first, second},
          split_tabs::SplitTabVisualData(split_tabs::SplitTabLayout::kSideBySide, method != "previewGlancePair" ? 0.5 : 0.62),
          split_tabs::SplitTabCreatedSource::kToolbarButton);
      if (reverse) model->ReverseTabsInSplit(split);
      owner->glance_main = method != "previewGlancePair" ? -1 : args[0].GetInt();
      owner->glance_reference = method != "previewGlancePair" ? -1 : args[1].GetInt();
      if (method != "previewGlancePair") model->ActivateTabAt(first);
      reply(true, base::Value(true)); return;
    }
    if (method == "resizeSplit" && args.size() == 3 && args[0].is_int() &&
        args[1].is_int() && args[2].is_double()) {
      const double ratio = args[2].GetDouble();
      int first = -1, second = -1;
      for (int i = 0; i < model->count(); ++i) {
        const int tab_id = sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id();
        if (tab_id == args[0].GetInt()) first = i;
        if (tab_id == args[1].GetInt()) second = i;
      }
      const auto split = first >= 0 ? model->GetSplitForTab(first) : std::nullopt;
      if ((owner->split_geometry.FindString("mode") && *owner->split_geometry.FindString("mode") != "columns") ||
          !std::isfinite(ratio) || ratio < 0.2 || ratio > 0.8 || first < 0 ||
          second <= first || !split || model->GetSplitForTab(second) != split ||
          model->GetSplitForTab(model->active_index()) != split ||
          !model->GetWebContentsAt(first)->GetUserData(kPersistentSplitKey)) {
        reply(true, base::Value(false)); return;
      }
      model->UpdateSplitRatio(*split, ratio);
      reply(true, base::Value(true)); return;
    }
    if ((method == "previewGlanceClose" || method == "removeFromSplit") && args.size() == 1 && args[0].is_int()) {
      for (int i = 0; i < model->count(); ++i) {
        if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)).id() != args[0].GetInt()) continue;
        const auto split = model->GetSplitForTab(i);
        if (split) {
          int after = i;
          for (int member = 0; member < model->count(); ++member)
            if (model->GetSplitForTab(member) == split) after = std::max(after, member);
          auto* removed = model->GetWebContentsAt(i);
          model->RemoveSplit(*split);
          if (method == "removeFromSplit") {
            if (after != i) model->MoveWebContentsAt(i, after, false);
            model->ActivateTabAt(model->GetIndexOfWebContents(removed));
          }
        }
        // Clear stale temporary ownership before a synchronous Spaces capture.
        // Snapshot polling must not be required to make saving available again.
        owner->MainIndex();
        reply(true, base::Value(split.has_value())); return;
      }
      reply(true, base::Value(false)); return;
    }
    if (method == "snapshot") {
      MaybeRollback(owner);
      MaybeAutosave(owner);
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
        if (!service->entries().empty()) {
          auto partial = RestorePartialSplit(browser, service, *service->entries().front());
          if (partial) { reply(true, base::Value(*partial)); return; }
        }
        const auto collapsed = service->entries().empty() ? std::nullopt
            : ClosedGroupCollapsed(*service->entries().front());
        const auto saved_group = service->entries().empty() ? std::nullopt
            : ClosedSavedGroup(*service->entries().front());
        const auto split_focus = service->entries().empty() ? std::nullopt
            : ClosedSplitFocus(*service->entries().front());
        // UNKNOWN disposition routes an old browser ID to another window
        // after restart. Blanc reopens a closed split into the current window.
        const auto restored = split_focus
            ? service->RestoreEntryById(context, service->entries().front()->id,
                  WindowOpenDisposition::NEW_FOREGROUND_TAB).value_or(std::vector<sessions::LiveTab*>())
            : service->RestoreMostRecentEntry(context);
        RestoreClosedSplitMetadata(browser, split_focus, restored);
        const bool group_restored = RestoreClosedGroupCollapsed(
            browser, collapsed, saved_group, restored);
        reply(true, base::Value(!restored.empty() || group_restored));
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
          auto partial = RestorePartialSplit(browser, service, *entry);
          if (partial) { reply(true, base::Value(*partial)); return; }
          const auto collapsed = ClosedGroupCollapsed(*entry);
          const auto saved_group = ClosedSavedGroup(*entry);
          const auto split_focus = ClosedSplitFocus(*entry);
          const auto restored = service->RestoreEntryById(context, id_to_restore,
              WindowOpenDisposition::NEW_FOREGROUND_TAB);
          if (restored) {
            RestoreClosedSplitMetadata(browser, split_focus, *restored);
            RestoreClosedGroupCollapsed(browser, collapsed, saved_group, *restored);
          }
          reply(true, base::Value(restored.has_value()));
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
    if ((method == "extensionAction" || method == "extensionContextMenu") && args.size() == 2 &&
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
      if (!action || (method == "extensionAction" && !action->IsEnabled(active)) ||
          (method == "extensionContextMenu" && !container->GetViewForId(args[0].GetString()))) {
        reply(false, base::Value("This extension is unavailable on the current page."));
        return;
      }
      if (method == "extensionContextMenu") {
        // Prototype branding only; Chromium still owns command policy and confirmation.
        ui::ResourceBundle::GetSharedInstance().OverrideLocaleStringResource(
            IDS_EXTENSIONS_UNINSTALL, u"Remove from Blanc");
        if (extension_menu_runner_ && extension_menu_runner_->IsRunning()) {
          reply(false, base::Value("An extension menu is already open."));
          return;
        }
        const auto* extension = extensions::ExtensionRegistry::Get(profile)
            ->enabled_extensions().GetByID(args[0].GetString());
        if (!extension) {
          reply(false, base::Value("This extension is no longer installed."));
          return;
        }
        extension_menu_runner_.reset();
        extension_menu_adapter_.reset();
        extension_menu_ = std::make_unique<IslandExtensionMenu>(
            extension, browser,
            ToolbarActionsModel::Get(profile)->IsActionPinned(args[0].GetString()),
            base::BindRepeating(&Handler::ExtensionMenuClosed,
                                weak_factory_.GetWeakPtr(), id));
        extension_menu_adapter_ = std::make_unique<views::MenuModelAdapter>(extension_menu_.get());
        extension_menu_runner_ = std::make_unique<views::MenuRunner>(
            extension_menu_adapter_->CreateMenu(), views::MenuRunner::CONTEXT_MENU);
        extension_menu_runner_->RunMenuAt(
            BrowserView::GetBrowserViewForBrowser(browser)->GetWidget(), nullptr,
            gfx::Rect(display::Screen::Get()->GetCursorScreenPoint(), gfx::Size()),
            views::MenuAnchorPosition::kTopLeft, ui::mojom::MenuSourceType::kNone);
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
      const int moved_index = model->GetIndexOfWebContents(tab);
      if (!model->IsTabPinned(moved_index) && !model->GetTabGroupForTab(moved_index))
        model->MoveWebContentsAt(moved_index, model->count() - 1, false);
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
      // Group the complete native split, preserving its membership and focus.
      std::vector<int> members{index};
      if (const auto split = model->GetSplitForTab(index)) {
        members.clear();
        const auto range = model->GetSplitData(*split)->GetIndexRange();
        for (int i = range.start(); i < static_cast<int>(range.end()); ++i) members.push_back(i);
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
          target = model->AddToNewGroup(members);
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
        if (target) model->AddToExistingGroup(members, *target);
        else model->RemoveFromGroup(members);
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
      const auto moving_split = model->GetSplitForTab(index);
      if (moving_split && tab->GetUserData(kPersistentSplitKey)) {
        const auto range = model->GetSplitData(*moving_split)->GetIndexRange();
        const int first = static_cast<int>(range.start());
        const int count = static_cast<int>(range.length());
        for (int i = first; i < first + count; ++i)
          if (!model->GetWebContentsAt(i)->GetUserData(kPersistentSplitKey)) {
            reply(true, base::Value(false)); return;
          }
        int boundary = model->count();
        if (before) {
          boundary = model->GetIndexOfWebContents(before);
          if (auto destination = model->GetSplitForTab(boundary)) {
            if (destination == moving_split) {
              reply(true, base::Value(model->GetTabGroupForTab(index) == target)); return;
            }
            boundary = static_cast<int>(model->GetSplitData(*destination)->GetIndexRange().start());
          }
        } else if (pinned) boundary = model->IndexOfFirstNonPinnedTab();
        else if (target) boundary = static_cast<int>(model->group_model()->GetTabGroup(*target)->ListTabs().end());
        const int to = boundary > first ? boundary - count : boundary;
        model->MoveSplitTo(*moving_split, to, pinned, target);
        const int now = model->GetIndexOfWebContents(tab);
        reply(true, base::Value(model->GetSplitForTab(now) == moving_split &&
            model->GetTabGroupForTab(now) == target && model->IsTabPinned(now) == pinned));
        return;
      }
      // A single-tab drop beside a split must target its leading boundary.
      if (before) {
        const int b = model->GetIndexOfWebContents(before);
        if (auto destination = model->GetSplitForTab(b))
          before = model->GetWebContentsAt(model->GetSplitData(*destination)->GetIndexRange().start());
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
    } else if (method == "closeSplit") {
      const auto split = model->GetSplitForTab(index);
      if (!split || !tab->GetUserData(kPersistentSplitKey)) {
        reply(true, base::Value(false)); return;
      }
      const auto range = model->GetSplitData(*split)->GetIndexRange();
      for (int i = range.start(); i < static_cast<int>(range.end()); ++i)
        if (!model->GetWebContentsAt(i)->GetUserData(kPersistentSplitKey)) {
          reply(true, base::Value(false)); return;
        }
      // Native batch closing records one historical Split entry and retains
      // Chromium's unload/cancellation handling, including private exclusion.
      if (static_cast<size_t>(model->count()) == range.length())
        chrome::AddTabAt(browser, GURL("chrome://newtab/"), -1, false);
      int focused = index;
      for (int i = range.start(); i < static_cast<int>(range.end()); ++i) {
        const auto* state = static_cast<PersistentSplitData*>(model->GetWebContentsAt(i)->GetUserData(kPersistentSplitKey));
        if (state && state->focused) focused = i;
      }
      ui::ListSelectionModel selection;
      selection.SetSelectedIndex(focused);
      for (size_t i = range.start(); i < range.end(); ++i) selection.AddIndexToSelection(i);
      auto& pending_close = split_closes_[id];
      pending_close.browser = browser->GetWeakPtr();
      for (size_t i = range.start(); i < range.end(); ++i) {
        auto* closing_tab = model->GetWebContentsAt(i);
        pending_close.tabs.push_back(sessions::SessionTabHelper::IdForTab(closing_tab).id());
        pending_close.watches.push_back(std::make_unique<SplitCloseWatch>(closing_tab,
            base::BindRepeating(&Handler::SplitCloseCancelled, weak_factory_.GetWeakPtr(), id)));
      }
      model->SetSelectionFromModel(selection);
      model->CloseSelectedTabs();
      base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,
          base::BindOnce(&Handler::CheckSplitClose, weak_factory_.GetWeakPtr(), id));
      return;
    } else if (method == "closeTab") {
      if (model->count() == 1) {
        chrome::AddTabAt(browser, GURL("chrome://newtab/"), -1, true);
      }
      model->CloseWebContentsAt(index, TabCloseTypes::CLOSE_CREATE_HISTORICAL_TAB);
      if (model->GetIndexOfWebContents(tab) != TabStripModel::kNoTab) {
        reply(false, base::Value("Tab closure is pending or cancelled; history is not acknowledged."));
        return;
      }
      SaveClosedHistory(id, browser->GetProfile());
      return;
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
  void StoreResults(const std::string& callback, std::optional<std::string> body) {
    store_loader_.reset();
    if (!body) {
      Reply(callback, false, base::Value("Store search unavailable. Try again or open the Store."));
      return;
    }
    auto items = ParseStoreResults(*body);
    base::DictValue result;
    result.Set("items", std::move(items));
    Reply(callback, true, base::Value(std::move(result)));
  }
  void StoreIcon(const std::string& id, std::optional<std::string> body) {
    icon_loaders_.erase(id);
    std::string type;
    if (body && body->size() >= 12) {
      if (body->compare(0, 8, "\x89PNG\r\n\x1a\n", 8) == 0) type = "png";
      else if (body->compare(0, 3, "\xff\xd8\xff", 3) == 0) type = "jpeg";
      else if (body->substr(0, 4) == "RIFF" && body->substr(8, 4) == "WEBP") type = "webp";
    }
    if (type.empty()) { Reply(id, false, base::Value("Icon unavailable.")); return; }
    Reply(id, true, base::Value("data:image/" + type + ";base64," + base::Base64Encode(*body)));
  }
  std::map<std::string, std::unique_ptr<network::SimpleURLLoader>> icon_loaders_;
  std::unique_ptr<network::SimpleURLLoader> store_loader_;
  std::string store_callback_;
  uint64_t space_save_generation_ = 0;
  bool space_save_pending_ = false;
  std::unique_ptr<IslandExtensionMenu> extension_menu_;
  std::unique_ptr<views::MenuModelAdapter> extension_menu_adapter_;
  std::unique_ptr<views::MenuRunner> extension_menu_runner_;
  base::CancelableTaskTracker tracker_;
  base::WeakPtrFactory<Handler> weak_factory_{this};
};
struct WindowIdentityState {
  base::WeakPtr<BrowserWindowInterface> browser;
  std::string id;
};
auto& WindowIdentities() {
  static base::NoDestructor<std::map<BrowserWindowInterface*, WindowIdentityState>> states;
  std::erase_if(*states, [](const auto& item) { return !item.second.browser; });
  return *states;
}
}  // namespace

namespace {
class TabIdentityData : public base::SupportsUserData::Data {
 public:
  explicit TabIdentityData(std::string value) : id(std::move(value)) {}
  std::string id;
};
}
std::string PersistentSplitState(content::WebContents* tab) {
  auto* data = static_cast<PersistentSplitData*>(tab->GetUserData(kPersistentSplitKey));
  return data ? (data->focused ? "2" : "1") : "0";
}
// PR993: numbered shortcuts select clusters when groups exist; otherwise a
// persistent split counts once, at its first pane. Cyclic next/previous still
// visits individual panes, matching the Electron reference.
bool RestoreClosedSplitFromCommand(BrowserWindowInterface* browser) {
  if (!IsIslandWindow(browser) || browser->GetProfile()->IsOffTheRecord()) return false;
  auto* service = ClosedService(browser->GetProfile());
  if (!service || !service->IsLoaded() || service->entries().empty()) return false;
  if (RestorePartialSplit(browser, service, *service->entries().front()).has_value()) return true;
  const auto focus = ClosedSplitFocus(*service->entries().front());
  if (!focus) return false;
  auto* context = BrowserLiveTabContext::From(browser);
  if (!context) return false;
  const auto restored = service->RestoreEntryById(context, service->entries().front()->id,
      WindowOpenDisposition::NEW_FOREGROUND_TAB);
  if (restored) RestoreClosedSplitMetadata(browser, focus, *restored);
  return true;
}

bool SelectIslandSlot(BrowserWindowInterface* browser, int slot) {
  if (!IsIslandWindow(browser)) return false;
  auto* model = browser->GetTabStripModel();
  if (slot < 0 || slot > 8 || model->empty()) return true;
  const bool grouped = !GroupsInOrder(model).empty();
  std::vector<int> slots;
  std::optional<tab_groups::TabGroupId> previous_group;
  bool loose = false;
  bool pins = false;
  for (int i = 0; i < model->count(); ++i) {
    const auto group = model->GetTabGroupForTab(i);
    if (grouped) {
      if (group) {
        if (group != previous_group) slots.push_back(i);
        loose = false;
      } else if (model->IsTabPinned(i)) {
        if (!pins) slots.insert(slots.begin(), i);
        pins = true; loose = false;
      } else {
        if (!loose) slots.push_back(i);
        loose = true;
      }
      previous_group = group;
    } else {
      const auto split = model->GetSplitForTab(i);
      if (split && model->GetWebContentsAt(i)->GetUserData(kPersistentSplitKey) &&
          i != static_cast<int>(model->GetSplitData(*split)->GetIndexRange().start())) continue;
      slots.push_back(i);
    }
  }
  if (slots.empty()) return true;
  if (!grouped && slot == 8) slot = static_cast<int>(slots.size()) - 1;
  if (slot >= static_cast<int>(slots.size())) return true;
  const int index = slots[slot];
  if (auto group = model->GetTabGroupForTab(index)) {
    const auto* visual = model->group_model()->GetTabGroup(*group)->visual_data();
    model->ChangeTabGroupVisuals(*group, tab_groups::TabGroupVisualData(visual->title(), visual->color(), false));
  }
  model->ActivateTabAt(index);
  return true;
}
bool IsPersistentSplitTab(content::WebContents* tab) {
  return IsEnabled() && !tab->GetBrowserContext()->IsOffTheRecord() && tab->GetUserData(kPersistentSplitKey);
}
std::string TabIdentity(content::WebContents* tab) {
  if (!IsEnabled() || tab->GetBrowserContext()->IsOffTheRecord()) return "";
  auto* data = static_cast<TabIdentityData*>(tab->GetUserData(kTabIdentityKey));
  if (!data) {
    tab->SetUserData(kTabIdentityKey, std::make_unique<TabIdentityData>(
        base::Uuid::GenerateRandomV4().AsLowercaseString()));
    data = static_cast<TabIdentityData*>(tab->GetUserData(kTabIdentityKey));
  }
  return data->id;
}
void RestoreTabIdentity(content::WebContents* tab,
    const std::map<std::string, std::string>& extra_data) {
  if (!IsEnabled() || tab->GetBrowserContext()->IsOffTheRecord()) return;
  if (auto split = extra_data.find(kPersistentSplitKey); split != extra_data.end() && (split->second == "1" || split->second == "2"))
    tab->SetUserData(kPersistentSplitKey, std::make_unique<PersistentSplitData>(split->second == "2"));
  const auto it = extra_data.find(kTabIdentityKey);
  if (it != extra_data.end() && base::Uuid::ParseLowercase(it->second).is_valid())
    tab->SetUserData(kTabIdentityKey, std::make_unique<TabIdentityData>(it->second));
}
std::string WindowIdentity(BrowserWindowInterface* browser) {
  if (!IsIslandWindow(browser) || browser->GetProfile()->IsOffTheRecord()) return "";
  auto& states = WindowIdentities();
  auto found = states.find(browser);
  if (found != states.end()) return found->second.id;
  // Missing restored identity must not become a newly invented match.
  std::string id = browser->CreatedBySessionRestore() ? "" : base::Uuid::GenerateRandomV4().AsLowercaseString();
  states.emplace(browser, WindowIdentityState{browser->GetWeakPtr(), id});
  return id;
}
void RestoreWindowIdentity(BrowserWindowInterface* browser,
    const std::map<std::string, std::string>& extra_data) {
  if (!IsIslandWindow(browser) || browser->GetProfile()->IsOffTheRecord()) return;
  auto found = extra_data.find(kWindowIdentityKey);
  const std::string id = found != extra_data.end() && base::Uuid::ParseLowercase(found->second).is_valid() ? found->second : "";
  WindowIdentities().insert_or_assign(browser, WindowIdentityState{browser->GetWeakPtr(), id});
}

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
          [](base::FilePath root, base::WeakPtr<Profile> profile, const std::string& path,
             content::WebUIDataSource::GotDataCallback callback) {
            if (path.starts_with("theme-background.png?") || path.starts_with("theme-attribution.png?")) {
              scoped_refptr<base::RefCountedMemory> bytes;
              auto* service = profile && !profile->IsOffTheRecord() ?
                  ThemeServiceFactory::GetForProfile(profile.get()) : nullptr;
              const auto query = path.substr(path.find('?') + 1);
              if (service && service->UsingExtensionTheme() && query == service->GetThemeID()) {
                const int resource = path.starts_with("theme-background") ? IDR_THEME_NTP_BACKGROUND : IDR_THEME_NTP_ATTRIBUTION;
                const auto& provider = ThemeService::GetThemeProviderForProfile(profile.get());
                if (provider.HasCustomImage(resource)) bytes = provider.GetRawData(resource, ui::k100Percent);
                if (bytes && bytes->size() > 8 * 1024 * 1024) bytes.reset();
              }
              std::move(callback).Run(bytes);
              return;
            }
            base::ThreadPool::PostTaskAndReplyWithResult(
                FROM_HERE, {base::MayBlock()},
                base::BindOnce(&ReadAsset, root, path), std::move(callback));
          },
          root, Profile::FromWebUI(web_ui)->GetWeakPtr()));
  web_ui->AddMessageHandler(std::make_unique<Handler>());
  web_ui->AddMessageHandler(std::make_unique<NewTabHandler>());
}

ToolbarButtonProvider* ToolbarProvider(BrowserWindowInterface* browser,
                                      ToolbarButtonProvider* delegate) {
  if (!delegate || !IsIslandWindow(browser)) return delegate;
  auto* parent = BrowserView::GetBrowserViewForBrowser(browser);
  auto* view = parent ? static_cast<views::WebView*>(
      parent->GetViewByID(kIslandViewId)) : nullptr;
  auto* owner = view ? GetOwner(view->GetWebContents()) : nullptr;
  if (!owner) return delegate;
  if (!owner->toolbar_provider)
    owner->toolbar_provider = std::make_unique<IslandToolbarProvider>(delegate, view, parent->toolbar());
  return owner->toolbar_provider.get();
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

int HeaderHeight(views::View* parent) {
  if (!HasIsland(parent)) return 68;
  auto* model = static_cast<BrowserView*>(parent)->browser()->GetTabStripModel();
  return model->active_index() >= 0 && model->GetSplitForTab(model->active_index()) &&
      !model->GetActiveWebContents()->GetUserData(kPersistentSplitKey) ? 98 : 68;
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

// Transient presentation only: native split membership and saved column ratio
// remain authoritative while narrow windows stack or focus panes.
void AdjustSplitLayout(const MultiContentsView* view, views::ProposedLayout* layout) {
  if (!IsEnabled()) return;
  Owner* owner = nullptr;
  BrowserView* browser_view = nullptr;
  for (auto* candidate : Owner::Live()) {
    auto* bv = BrowserView::GetBrowserViewForBrowser(candidate->browser);
    if (bv && bv->multi_contents_view() == view) { owner = candidate; browser_view = bv; break; }
  }
  if (!owner) return;
  auto* model = owner->browser->GetTabStripModel();
  if (model->active_index() < 0 || !model->GetSplitForTab(model->active_index()) ||
      !model->GetActiveWebContents()->GetUserData(kPersistentSplitKey)) {
    owner->split_geometry.clear(); owner->split_hit_regions.clear(); return;
  }
  const auto& containers = view->contents_container_views();
  if (containers.size() != 2) return;
  const int width = layout->host_size.width(), height = layout->host_size.height();
  const bool columns = width >= 612;
  const bool rows = !columns && height >= 392;
  const int first = columns ? std::clamp(static_cast<int>(std::round((width - 12) * view->GetSplitRatio())), 300, width - 312)
      : rows ? (height - 12) / 2 : (view->GetActiveIndex() == 0 ? std::max(30, height - 30) : 30);
  std::array<gfx::Rect, 2> panes;
  gfx::Rect gutter;
  if (columns) {
    panes[0] = gfx::Rect(0, 0, first, height);
    gutter = gfx::Rect(first, 0, 12, height);
    panes[1] = gfx::Rect(first + 12, 0, width - first - 12, height);
  } else {
    panes[0] = gfx::Rect(0, 0, width, first);
    gutter = gfx::Rect(0, first, width, rows ? 12 : 0);
    panes[1] = gfx::Rect(0, first + gutter.height(), width, std::max(30, height - first - gutter.height()));
  }
  gfx::Point origin;
  views::View::ConvertPointToTarget(view, browser_view, &origin);
  if (auto* island = browser_view->GetViewByID(kIslandViewId)) origin.Offset(-island->x(), -island->y());
  auto encode = [](const gfx::Rect& r) { return base::DictValue().Set("x", r.x()).Set("y", r.y()).Set("width", r.width()).Set("height", r.height()); };
  base::ListValue headers;
  std::vector<gfx::Rect> hit_regions;
  for (int i = 0; i < 2; ++i) {
    gfx::Rect header = panes[i]; header.set_height(30); header.Offset(origin.x(), origin.y());
    hit_regions.push_back(header); headers.Append(encode(header));
    auto page = panes[i]; page.Inset(gfx::Insets::TLBR(30, 0, 0, 0));
    for (auto& child : layout->child_layouts) {
      if (child.child_view == containers[i]) { child.bounds = page; child.visible = true; }
    }
  }
  for (auto& child : layout->child_layouts)
    if (std::string(child.child_view->GetClassName()) == "MultiContentsResizeArea") child.bounds = gfx::Rect();
  gutter.Offset(origin.x(), origin.y());
  if (columns) hit_regions.push_back(gutter);
  // Preferred-size probes also call this method with zero/non-current bounds.
  // Only applied-size geometry may own input regions or renderer metadata.
  if (width <= 0 || width != view->width() || height != view->height()) return;
  owner->split_hit_regions = std::move(hit_regions);
  owner->split_geometry = base::DictValue().Set("mode", columns ? "columns" : rows ? "rows" : "focus")
      .Set("headers", std::move(headers)).Set("divider", encode(gutter))
      .Set("originX", origin.x()).Set("usableWidth", std::max(1, width - 12));
}

void LayoutIsland(views::View* parent, int top) {
  auto* view = static_cast<views::WebView*>(parent->GetViewByID(kIslandViewId));
  if (!view) return;
  auto* owner = GetOwner(view->GetWebContents());
  const int available = std::max(0, parent->height() - top);
  view->SetBounds(0, top, parent->width(),
                  std::min(owner && (owner->vertical || !owner->split_geometry.empty()) ? available : owner ? std::max(owner->height, HeaderHeight(parent)) : 68, available));
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
