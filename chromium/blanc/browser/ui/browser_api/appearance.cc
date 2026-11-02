// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/appearance.h"

#include <utility>

#include "blanc/browser/ui/browser_api/theme_choice.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/themes/theme_service.h"
#include "chrome/browser/themes/theme_service_factory.h"

namespace blanc::browser_api {

namespace {

using Scheme = ThemeService::BrowserColorScheme;

ThemeService* Themes(Profile* profile) {
  return profile ? ThemeServiceFactory::GetForProfile(profile->GetOriginalProfile()) : nullptr;
}

}  // namespace

std::string ThemeOf(Profile* profile) {
  auto* themes = Themes(profile);
  switch (themes ? themes->GetBrowserColorScheme() : Scheme::kSystem) {
    case Scheme::kLight:
      return "light";
    case Scheme::kDark:
      return "dark";
    case Scheme::kSystem:
      return "system";
  }
  return "system";
}

bool SetTheme(Profile* profile, const std::string& theme) {
  auto* themes = Themes(profile);
  if (!themes || !theme_choice::IsTheme(theme)) {
    return false;
  }
  const Scheme scheme = theme == "light" ? Scheme::kLight : theme == "dark" ? Scheme::kDark : Scheme::kSystem;
  if (themes->GetBrowserColorScheme() != scheme) {
    themes->SetBrowserColorScheme(scheme);
  }
  return true;
}

Appearance::Appearance(Profile* profile, mojo::PendingReceiver<mojom::Appearance> receiver,
                       mojo::PendingRemote<mojom::AppearanceClient> client)
    : profile_(profile), receiver_(this, std::move(receiver)), client_(std::move(client)) {
  if (auto* themes = Themes(profile_)) {
    theme_observation_.Observe(themes);
  }
  native_observation_.Observe(ui::NativeTheme::GetInstanceForNativeUi());
}

Appearance::~Appearance() = default;

void Appearance::ToggleDarkSiteOnActiveSite(ToggleDarkSiteOnActiveSiteCallback callback) {
  std::move(callback).Run(nullptr);
}

void Appearance::RouteActiveSite(const std::string& mode, RouteActiveSiteCallback callback) {
  auto result = mojom::RouteResult::New();
  result->ok = false;
  result->error = "unavailable";
  std::move(callback).Run(std::move(result));
}

void Appearance::CycleTheme(const std::optional<std::string>& theme, CycleThemeCallback callback) {
  const std::string current = ThemeOf(profile_);
  const std::string next = theme_choice::NextTheme(
      current, theme ? std::optional<std::string_view>(*theme) : std::nullopt);
  if (next != current) {
    SetTheme(profile_, next);
  }
  std::move(callback).Run(next);
}

void Appearance::OnThemeChanged() {
  SendAppearance();
}

void Appearance::OnNativeThemeUpdated(ui::NativeTheme* observed_theme) {
  SendAppearance();
}

// Shipping sends the appearance in effect: the choice, or the system's for
// "system". Repeats are dropped, as the Island only needs changes.
void Appearance::SendAppearance() {
  const std::string theme = ThemeOf(profile_);
  const bool dark = theme == "dark" ||
      (theme == "system" && ui::NativeTheme::GetInstanceForNativeUi()->preferred_color_scheme() ==
                                ui::NativeTheme::PreferredColorScheme::kDark);
  const std::string appearance = dark ? "dark" : "light";
  if (sent_ == appearance || !client_.is_bound()) {
    return;
  }
  sent_ = appearance;
  client_->OnThemeAppearance(appearance);
}

}  // namespace blanc::browser_api
