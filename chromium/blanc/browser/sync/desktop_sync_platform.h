// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_DESKTOP_SYNC_PLATFORM_H_
#define BLANC_BROWSER_SYNC_DESKTOP_SYNC_PLATFORM_H_

#include "base/functional/callback.h"
#include "blanc/services/sync_runner/sync_runner_proxy.h"
#include "components/os_crypt/async/common/encryptor.h"

class Profile;
namespace blanc {
// Process-lived: the proxy posts Protect/Unprotect using an unretained pointer.
// Initialize completely before SetSyncPlatform. Only encryption runs off UI.
class DesktopSyncPlatform final : public SyncPlatform {
 public:
  using EventCallback = base::RepeatingCallback<void(const std::string&, const std::string&)>;
  DesktopSyncPlatform(Profile* profile, std::string device_name,
                      scoped_refptr<os_crypt_async::Encryptor> encryptor,
                      EventCallback on_event);
  ~DesktopSyncPlatform() override;
  base::FilePath StoreDir() override;
  std::string ConfigJson() override;
  std::string Endpoint() override;
  scoped_refptr<network::SharedURLLoaderFactory> UrlLoaderFactory() override;
  std::optional<std::vector<uint8_t>> Protect(const std::vector<uint8_t>& data) override;
  std::optional<std::vector<uint8_t>> Unprotect(const std::vector<uint8_t>& data) override;
  void OnEvent(const std::string& event, const std::string& json) override;

 private:
  const base::FilePath store_dir_;
  const std::string device_name_;
  const scoped_refptr<os_crypt_async::Encryptor> encryptor_;
  const scoped_refptr<network::SharedURLLoaderFactory> factory_;
  const EventCallback on_event_;
};
}  // namespace blanc
#endif
