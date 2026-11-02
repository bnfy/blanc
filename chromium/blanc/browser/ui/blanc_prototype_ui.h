// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_
#define CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_

#include "base/functional/callback.h"
#include <map>
#include <memory>
#include <string>
#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "ui/webui/mojo_web_ui_controller.h"

namespace content { class WebContents; }
namespace blanc::browser_api::mojom { class BrowserApiFactory; }
class BrowserWindowInterface;
class MultiContentsView;
class ToolbarButtonProvider;
namespace views {
class View;
struct ProposedLayout;
class WebView;
}

namespace blanc_prototype {
base::OnceClosure ShowBlockerRecovery();
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
void RestoreWindowIdentity(BrowserWindowInterface* browser,
    const std::map<std::string, std::string>& extra_data);
inline constexpr char kPersistentSplitKey[] = "blanc.split.persistent.v1";
std::string PersistentSplitState(content::WebContents* tab);
bool IsPersistentSplitTab(content::WebContents* tab);
bool HasSplitPresentation(content::WebContents* tab);
inline constexpr char kTabNameKey[] = "blanc.tab.name.v1";
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
bool RestoreClosedSplitFromCommand(BrowserWindowInterface* browser);
bool SelectIslandSlot(BrowserWindowInterface* browser, int slot);
// Returns a dismissal closure; no browser/profile/session state is created.
base::OnceClosure ShowSessionRecovery();
bool IsEnabled();
bool IsIslandWindow(const BrowserWindowInterface* browser);
bool HasIsland(views::View* parent);
int RailWidth(views::View* parent);
int HeaderHeight(views::View* parent);
bool IsCaption(views::View* parent, int x, int y);
void RestoreExtensions(views::View* parent);
bool OpenExtensions(BrowserWindowInterface* browser);
bool OpenFindIsland(BrowserWindowInterface* browser, int direction = 0);
// ⌘D in an Island window: toggle the Favorite like the Island heart instead of
// opening Chromium's star bubble. Returns true when the window is an Island
// window, whether or not the page could be saved.
bool ToggleFavoriteFromIsland(BrowserWindowInterface* browser);
bool OpenIsland(BrowserWindowInterface* browser, bool new_tab = false,
                const std::string& initial_text = std::string());
std::unique_ptr<views::WebView> CreateIsland(BrowserWindowInterface* browser);
void AdjustSplitLayout(const MultiContentsView* view, views::ProposedLayout* layout);
void LayoutIsland(views::View* parent, int top);
}  // namespace blanc_prototype

#endif  // CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_
