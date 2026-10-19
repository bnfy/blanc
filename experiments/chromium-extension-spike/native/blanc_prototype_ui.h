// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_
#define CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_

#include <memory>
#include <string>
#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"

class BrowserWindowInterface;
class ToolbarButtonProvider;
namespace views {
class View;
class WebView;
}

namespace blanc_prototype {
inline constexpr char kAssetsSwitch[] = "blanc-prototype-assets";
inline constexpr char kHost[] = "blanc-prototype";

class UI : public content::WebUIController {
 public:
  explicit UI(content::WebUI* web_ui);
};

class Config : public content::DefaultWebUIConfig<UI> {
 public:
  Config();
  bool IsWebUIEnabled(content::BrowserContext* context) override;
};

ToolbarButtonProvider* ToolbarProvider(BrowserWindowInterface* browser,
                                      ToolbarButtonProvider* delegate);
bool IsEnabled();
bool IsIslandWindow(const BrowserWindowInterface* browser);
bool HasIsland(views::View* parent);
int RailWidth(views::View* parent);
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
void LayoutIsland(views::View* parent, int top);
}  // namespace blanc_prototype

#endif  // CHROME_BROWSER_UI_BLANC_PROTOTYPE_UI_H_
