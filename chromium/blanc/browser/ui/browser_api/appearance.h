// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_APPEARANCE_H_
#define BLANC_BROWSER_UI_BROWSER_API_APPEARANCE_H_

#include <optional>
#include <string>

#include "base/memory/raw_ptr.h"
#include "base/scoped_observation.h"
#include "blanc/common/browser_api/browser_api.mojom.h"
#include "chrome/browser/themes/theme_service_observer.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "ui/native_theme/native_theme.h"
#include "ui/native_theme/native_theme_observer.h"

class Profile;
class ThemeService;

namespace blanc::browser_api {

// Shipping's theme setting (system, light or dark) is Chromium's own browser
// color scheme, the one chrome://settings/appearance and Customize Chrome
// change, so the Island, chrome:// pages and websites follow it together.
std::string ThemeOf(Profile* profile);
// Stores `theme` if it is one of shipping's; returns whether it was.
bool SetTheme(Profile* profile, const std::string& theme);

// The contract's "appearance" group. /theme follows shipping's rule
// (theme_choice.h), and the Island hears the effective appearance (light or
// dark) whenever the choice or the system's appearance changes. Dark websites
// (F42) and link routing (F60) belong to later slices and answer as shipping
// does when they can't act: no site, and routing unavailable.
class Appearance : public mojom::Appearance,
                   public ThemeServiceObserver,
                   public ui::NativeThemeObserver {
 public:
  Appearance(Profile* profile, mojo::PendingReceiver<mojom::Appearance> receiver,
             mojo::PendingRemote<mojom::AppearanceClient> client);
  Appearance(const Appearance&) = delete;
  Appearance& operator=(const Appearance&) = delete;
  ~Appearance() override;

  // mojom::Appearance:
  void ToggleDarkSiteOnActiveSite(ToggleDarkSiteOnActiveSiteCallback callback) override;
  void RouteActiveSite(const std::string& mode, RouteActiveSiteCallback callback) override;
  void CycleTheme(const std::optional<std::string>& theme, CycleThemeCallback callback) override;

  // ThemeServiceObserver:
  void OnThemeChanged() override;
  // ui::NativeThemeObserver:
  void OnNativeThemeUpdated(ui::NativeTheme* observed_theme) override;

 private:
  void SendAppearance();

  raw_ptr<Profile> profile_;
  mojo::Receiver<mojom::Appearance> receiver_;
  mojo::Remote<mojom::AppearanceClient> client_;
  std::optional<std::string> sent_;
  base::ScopedObservation<ThemeService, ThemeServiceObserver> theme_observation_{this};
  base::ScopedObservation<ui::NativeTheme, ui::NativeThemeObserver> native_observation_{this};
};

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_APPEARANCE_H_
