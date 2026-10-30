#include "profile_service_factory.h"
#include "base/auto_reset.h"
#include "profile_service.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/browser_process.h"
#include "base/strings/string_number_conversions.h"
#include "crypto/sha2.h"
namespace blanc::sync {
ProfileServiceFactory* ProfileServiceFactory::GetInstance() {
  static base::NoDestructor<ProfileServiceFactory> instance;
  return instance.get();
}
ProfileService* ProfileServiceFactory::GetForProfile(Profile* profile) {
  auto* factory = GetInstance();
  auto* personal = factory->ResolvePersonal(profile);
  if (!personal) return nullptr;
  return static_cast<ProfileService*>(factory->GetServiceForBrowserContext(personal, true));
}
void ProfileServiceFactory::InstallPersonalProfileResolver(
    base::RepeatingCallback<std::optional<base::FilePath>()> resolver,
    base::PassKey<NativeLocalProfileRegistry>) {
  GetInstance()->personal_resolver_ = std::move(resolver);
}
Profile* ProfileServiceFactory::ResolvePersonal(Profile* requester) const {
  if (!requester || requester->IsOffTheRecord() || !requester->IsRegularProfile() ||
      requester->lifecycle_state()!=Profile::LifecycleState::kRegistered ||
      !personal_resolver_ || !g_browser_process) return nullptr;
  auto* manager = g_browser_process->profile_manager();
  if (!manager || manager->GetProfileByPath(requester->GetPath()) != requester) return nullptr;
  const auto path = personal_resolver_.Run();
  if (!path) return nullptr;
  auto* personal = manager->GetProfileByPath(*path);
  if (!personal_gate_.Authorize(manager->user_data_dir(), *path, true, true,
      personal && !personal->IsOffTheRecord() && personal->IsRegularProfile() &&
      personal->lifecycle_state()==Profile::LifecycleState::kRegistered)) return nullptr;
  return personal;
}
ProfileService* ProfileServiceFactory::GetForCreatedProfile(
    Profile* profile, base::PassKey<ProfileManager>) {
  auto* factory = GetInstance();
  // Never grant first-setup authority to a newly created named profile, and
  // never route that authority to an existing Personal profile by accident.
  if (!profile || factory->ResolvePersonal(profile) != profile) return nullptr;
  // A prior instance can already own persisted identity/quota; never upgrade
  // its bootstrap authority or recreate it in response to this callback.
  if (auto* existing = factory->GetServiceForBrowserContext(profile, false))
    return static_cast<ProfileService*>(existing);
  base::AutoReset<std::optional<base::FilePath>> creating(&factory->creating_path_, profile->GetPath());
  return GetForProfile(profile);
}
ProfileServiceFactory::ProfileServiceFactory()
    : ProfileKeyedServiceFactory("BlancSync", ProfileSelections::BuildForRegularProfile()) {}
ProfileServiceFactory::~ProfileServiceFactory() = default;
std::unique_ptr<KeyedService> ProfileServiceFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  auto* profile = Profile::FromBrowserContext(context);
  if (!profile || ResolvePersonal(profile) != profile) return nullptr;
  // Stable, non-secret profile binding. Moving a profile requires explicit
  // migration; do not silently treat relocated encrypted state as first setup.
  auto binding = base::HexEncodeLower(crypto::SHA256HashString(profile->GetPath().AsUTF8Unsafe()));
  // No live adapters until the qualified credential broker and transport land.
  // IsNewProfile() is insufficient authority: ProfileImpl also returns true
  // for browser-wide first run, including an existing profile. A dedicated
  // native profile-creation/migration hook must grant first setup explicitly.
  const auto mode = creating_path_ && *creating_path_ == profile->GetPath()
      ? ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup
      : ProfileStateStore::BootstrapMode::kExistingOnly;
  return std::unique_ptr<ProfileService>(new ProfileService(
      profile->GetPath(), std::move(binding), AccountController::Hooks{}, mode));
}
}
