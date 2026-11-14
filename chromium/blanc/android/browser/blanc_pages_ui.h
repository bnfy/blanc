// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_ANDROID_BROWSER_BLANC_PAGES_UI_H_
#define BLANC_ANDROID_BROWSER_BLANC_PAGES_UI_H_

#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"

namespace blanc::android {

inline constexpr char kPagesHost[] = "blanc";
// Where a new tab opens: Blanc's Start Page, never Chrome's.
inline constexpr char kStartPageUrl[] = "chrome://blanc/newtab.html";

// chrome://blanc/<page>.html: shipping's page files, served unchanged with
// the adapter that gives them window.bowserPages, as Blanc for iPhone serves
// them at blanc://<page>/ (A1 plan, Task 6).
class PagesUI : public content::WebUIController {
 public:
  explicit PagesUI(content::WebUI* web_ui);
  PagesUI(const PagesUI&) = delete;
  PagesUI& operator=(const PagesUI&) = delete;
  ~PagesUI() override;

 private:
  WEB_UI_CONTROLLER_TYPE_DECL();
};

class PagesUIConfig : public content::DefaultWebUIConfig<PagesUI> {
 public:
  PagesUIConfig();
};

}  // namespace blanc::android

#endif  // BLANC_ANDROID_BROWSER_BLANC_PAGES_UI_H_
