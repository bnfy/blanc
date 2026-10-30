#ifndef BLANC_SYNC_PROFILE_SERVICE_FACTORY_H_
#define BLANC_SYNC_PROFILE_SERVICE_FACTORY_H_
#include "chrome/browser/profiles/profile_keyed_service_factory.h"
#include "base/no_destructor.h"
#include "base/types/pass_key.h"
#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "personal_profile_gate.h"
#include <optional>
class ProfileManager;
namespace blanc::sync {
class ProfileService;
class NativeLocalProfileRegistry;
class ProfileServiceFactory : public ProfileKeyedServiceFactory {
 public:
  static ProfileServiceFactory* GetInstance();
  // Account-level operations in a named regular profile route to the verified
  // Personal profile, as in shipping Blanc. Private/guest/system callers are
  // refused. A missing or unloaded Personal profile is never inferred/created.
  static ProfileService* GetForProfile(Profile* profile);
  // Only the native local-profile registry can supply the protected Personal
  // mapping. Its callback must return nullopt after registry shutdown.
  static void InstallPersonalProfileResolver(
      base::RepeatingCallback<std::optional<base::FilePath>()> resolver,
      base::PassKey<NativeLocalProfileRegistry>);
  // Called only by ProfileManager's genuinely new-profile creation completion,
  // never a general load callback or IsNewProfile(). Does not reset a service
  // already created for this profile.
  static ProfileService* GetForCreatedProfile(Profile* profile, base::PassKey<ProfileManager>);
 private:
  friend base::NoDestructor<ProfileServiceFactory>;
  std::optional<base::FilePath> creating_path_;
  base::RepeatingCallback<std::optional<base::FilePath>()> personal_resolver_;
  mutable PersonalProfileGate personal_gate_;
  Profile* ResolvePersonal(Profile* requester) const;
  ProfileServiceFactory();
  ~ProfileServiceFactory() override;
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};
}
#endif
