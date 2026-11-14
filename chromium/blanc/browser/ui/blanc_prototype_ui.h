// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_
#define CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_

#include "base/functional/callback.h"
#include "base/values.h"
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <string_view>
#include <vector>
#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "ui/webui/mojo_web_ui_controller.h"

class GURL;
struct NavigateParams;
namespace sessions { struct SessionWindow; }
namespace content { class WebContents; class RenderFrameHost; }
namespace blanc::browser_api::mojom { class BrowserApiFactory; }
class BrowserWindowInterface;
class MultiContentsView;
class ToolbarButtonProvider;
class Profile;
namespace settings { class SettingsPageUIHandler; }
namespace views {
class View;
struct ProposedLayout;
class WebView;
}

namespace blanc_prototype {
base::OnceClosure ShowBlockerRecovery();
bool OpenExternalLink(const GURL& url);
bool IsMiniWindow(BrowserWindowInterface* browser);
void OpenMiniWindow();
void ConfirmLinkRouteActivation(content::WebContents* created);
bool RouteNewTabLink(NavigateParams* params);
void RememberLinkRouteSource(content::WebContents* source, content::RenderFrameHost* frame,
                             content::WebContents* created, const GURL& url);
base::DictValue RouteActiveSite(BrowserWindowInterface* browser, const std::string& mode);
// Reconcile durable accepted closes before SessionRestore creates any views.
void ReadSharedSessionPlan(Profile* profile,
    base::OnceCallback<void(std::string)> ready);
void ApplySharedSessionPlan(
    std::vector<std::unique_ptr<sessions::SessionWindow>>* windows,
    std::string_view plan);
inline constexpr char kAssetsSwitch[] = "blanc-prototype-assets";
inline constexpr char kHost[] = "blanc-prototype";

class BrowserApiHost;

class UI : public ui::MojoWebUIController {
 public:
  explicit UI(content::WebUI* web_ui);
  UI(const UI&) = delete;
  UI& operator=(const UI&) = delete;
  ~UI() override;
  // Binds the typed Island interface (F0.6), for the Island host document only.
  void BindInterface(
      mojo::PendingReceiver<blanc::browser_api::mojom::BrowserApiFactory> receiver);

 private:
  std::unique_ptr<BrowserApiHost> browser_api_;
  WEB_UI_CONTROLLER_TYPE_DECL();
};

class Config : public content::DefaultWebUIConfig<UI> {
 public:
  Config();
  bool IsWebUIEnabled(content::BrowserContext* context) override;
};

ToolbarButtonProvider* ToolbarProvider(BrowserWindowInterface* browser,
                                      ToolbarButtonProvider* delegate);
inline constexpr char kWindowIdentityKey[] = "blanc.window.identity.v1";
std::string WindowIdentity(BrowserWindowInterface* browser);
inline constexpr char kWindowSpaceKey[] = "blanc.window.space.v1";
std::string WindowSpace(BrowserWindowInterface* browser);
void SetWindowSpace(BrowserWindowInterface* browser, const std::string& name);
inline constexpr char kWindowSharedGroupsKey[] = "blanc.window.shared-groups.v1";
std::string WindowSharedGroups(BrowserWindowInterface* browser);
std::string WindowSharedGroup(BrowserWindowInterface* browser, const std::string& local);
void SetWindowSharedGroup(BrowserWindowInterface* browser, const std::string& local, const std::string& shared);
void RemapWindowSharedGroup(BrowserWindowInterface* browser, const std::string& previous, const std::string& current);
void RestoreWindowIdentity(BrowserWindowInterface* browser,
    const std::map<std::string, std::string>& extra_data);
inline constexpr char kClosedBatchKey[] = "blanc.closed.batch.v1";
std::map<std::string, std::string> ClosedBatchExtraData(content::WebContents* tab);
inline constexpr char kPersistentSplitKey[] = "blanc.split.persistent.v1";
std::string PersistentSplitState(content::WebContents* tab);
bool IsPersistentSplitTab(content::WebContents* tab);
bool HasSplitPresentation(content::WebContents* tab);
// A Glance over a split lets go of `contents` before Chromium shows it.
void ReleaseOverlayGlance(content::WebContents* contents);
// A page command while focus is in a Glance over a split goes to its page.
bool ExecuteForFocusedGlance(BrowserWindowInterface* browser, int command_id);
inline constexpr char kGroupPinKey[] = "blanc.tab.group-pin.v1";
bool GroupPinned(content::WebContents* tab);
void SetGroupPinned(content::WebContents* tab, bool pinned);
inline constexpr char kPinnedHomeKey[] = "blanc.tab.pinned-home.v1";
// The one local HTML file a tab was granted (N15), saved with its session.
inline constexpr char kLocalFileGrantKey[] = "blanc.tab.local-file.v1";
std::string LocalFileGrant(content::WebContents* tab);
std::string PinnedHome(content::WebContents* tab);
void SetPinnedHome(content::WebContents* tab, const std::string& url);
void ApplyPinnedHomesOnStartup(Profile* profile,
    std::vector<std::unique_ptr<sessions::SessionWindow>>* windows);
inline constexpr char kTabNameKey[] = "blanc.tab.name.v1";
inline constexpr char kSharedTabIdKey[] = "blanc.tab.shared-id.v1";
std::string SharedTabId(content::WebContents* tab);
inline constexpr char kSharedColdNavigationKey[] = "blanc.tab.shared-cold-navigation.v1";
std::string SharedColdNavigationToken(content::WebContents* tab);
void SetSharedColdNavigationToken(content::WebContents* tab, const std::string& token);
void SetSharedTabId(BrowserWindowInterface* browser, content::WebContents* tab,
                    const std::string& id);
std::string CustomTabName(content::WebContents* tab);
std::string PersistentTabName(content::WebContents* tab);
void RestoreCustomTabName(content::WebContents* tab,
    const std::map<std::string, std::string>& extra_data);
bool RenameTab(BrowserWindowInterface* browser, content::WebContents* tab,
               const std::string& raw);
inline constexpr char kTabIdentityKey[] = "blanc.tab.identity.v1";
std::string TabIdentity(content::WebContents* tab);
void RestoreTabIdentity(content::WebContents* tab,
    const std::map<std::string, std::string>& extra_data);
// N4 (V4): the sandbox flags a page-opened tab inherited from its opener,
// kept for the life of its WebContents and saved with the tab. A tab rebuilt
// from session, Space or Recently closed is created with them
// (WebContents::CreateParams::starting_sandbox_flags), so its page loads
// under the same sandbox; Duplicate and Quiet refuse it.
inline constexpr char kInheritedDocumentPolicyKey[] = "blanc.tab.inherited-policy.v1";
bool HasInheritedDocumentPolicy(content::WebContents* tab);
// A native duplicate remains usable but keeps its source's Sync exclusion.
void CopySyncExclusion(content::WebContents* source, content::WebContents* copy);
inline constexpr char kInheritedSandboxKey[] = "blanc.tab.inherited-sandbox.v1";
void NoteInheritedSandbox(content::WebContents* tab);
uint32_t InheritedSandboxFlags(content::WebContents* tab);
bool HasInheritedSandbox(content::WebContents* tab);
std::string InheritedSandboxState(content::WebContents* tab);
// None without a saved mark; every flag when the saved value is malformed.
uint32_t RestoredSandboxFlags(const std::map<std::string, std::string>& extra_data);
void RestoreInheritedSandbox(content::WebContents* tab, uint32_t flags);
bool RestoreClosedSplitFromCommand(BrowserWindowInterface* browser);
bool ParkClosedTab(BrowserWindowInterface* browser, content::WebContents* tab);
bool SelectIslandSlot(BrowserWindowInterface* browser, int slot);
bool ToggleGlance(BrowserWindowInterface* browser);
inline constexpr int kLinkSpaceMenuCommand = 59900;
inline constexpr int kLinkSpaceFirstCommand = 59901;
std::u16string LinkSpaceLabel(bool fresh);
std::vector<std::pair<std::string, std::u16string>> LinkSpaceTargets(content::WebContents*, content::RenderFrameHost*, const GURL&);
void OpenLinkInSpace(content::WebContents*, content::RenderFrameHost*, const GURL&, const std::u16string&, const std::string&);
// Open Link in Glance, in the page context menu (F34). Above every id
// Chromium's menus use, so no generated command header has to change.
inline constexpr int kOpenLinkInGlanceCommand = 59990;
bool CanOpenLinkInGlance(content::WebContents* source, const GURL& url);
std::u16string OpenLinkInGlanceLabel();
void OpenLinkInGlance(content::WebContents* source, const GURL& url);
// Returns a dismissal closure; no browser/profile/session state is created.
base::OnceClosure ShowSessionRecovery();
bool IsEnabled();
bool IsBetaBuild();
bool IsIslandWindow(const BrowserWindowInterface* browser);
// The never-shown window a profile's set-aside Space pages live in (F41).
bool IsHoldWindow(BrowserWindowInterface* browser);
// Shipping's private tab (owner decision D1): |url| (the private Start Page
// when empty) in a new private tab of |browser|, an ordinary window.
content::WebContents* NewPrivateTab(BrowserWindowInterface* browser, const GURL& url);
// The Dock's New Private Window, and ⌘⇧N with no window open: a window
// Chromium just opened becomes one private tab, as shipping's
// openNewWindow({private: true}). False leaves it as Chromium made it.
bool MakePrivateWindow(BrowserWindowInterface* browser);
bool HasIsland(views::View* parent);
int RailWidth(views::View* parent);
int HeaderHeight(views::View* parent);
bool IsCaption(views::View* parent, int x, int y);
void RestoreExtensions(views::View* parent);
bool OpenExtensions(BrowserWindowInterface* browser);
// Whether an extension may open its action popup in |browser| on its own
// (chrome.action.openPopup): an Island window, unless a page is fullscreen.
// The Island hides Chromium's toolbar but keeps its extensions container,
// where the popup anchors.
bool CanOpenExtensionPopup(BrowserWindowInterface* browser);
// Chromium's extensions container in |browser| started or stopped showing
// an action popup. With Auto-hide on, the Island comes down and stays while
// the popup is open, as shipping's open popups hold it.
void ExtensionPopupChanged(BrowserWindowInterface* browser, bool open);
// History, Downloads and the bookmark manager in an Island window open
// Blanc's utility sheet ("history", "downloads" or "bookmarks"), as
// shipping's menu items do. False leaves Chromium's own page.
bool OpenUtilitySheet(BrowserWindowInterface* browser, std::string_view page, std::string_view section = {});
bool OpenFindIsland(BrowserWindowInterface* browser, int direction = 0);
// ⌘D in an Island window: toggle the Favorite like the Island heart instead of
// opening Chromium's star bubble. Returns true when the window is an Island
// window, whether or not the page could be saved.
bool ToggleFavoriteFromIsland(BrowserWindowInterface* browser);
bool ToggleTabLayout(BrowserWindowInterface* browser);
bool OpenIsland(BrowserWindowInterface* browser, bool new_tab = false,
                const std::string& initial_text = std::string());
std::unique_ptr<views::WebView> CreateIsland(BrowserWindowInterface* browser);
void AdjustSplitLayout(const MultiContentsView* view, views::ProposedLayout* layout);
void LayoutIsland(views::View* parent, int top);
// Blanc's lists and language in chrome://settings (S1.7), for SettingsUI.
std::unique_ptr<settings::SettingsPageUIHandler> CreateSettingsHandler(Profile* profile);
}  // namespace blanc_prototype

#endif  // CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_
