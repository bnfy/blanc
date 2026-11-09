// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/browser/sync/desktop_sync_platform.h"

#include <utility>

#include "base/command_line.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "blanc/services/sync_runner/sync_endpoint.h"
#include "build/build_config.h"
#include "chrome/browser/profiles/profile.h"
#include "components/version_info/version_info.h"
#include "content/public/browser/storage_partition.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"

namespace blanc {
DesktopSyncPlatform::DesktopSyncPlatform(
    Profile* profile, std::string device_name,
    scoped_refptr<os_crypt_async::Encryptor> encryptor, EventCallback on_event)
    : store_dir_(profile->GetPath().AppendASCII("BlancSync")),
      device_name_(std::move(device_name)), encryptor_(std::move(encryptor)),
      factory_(profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess()),
      on_event_(std::move(on_event)) {}
DesktopSyncPlatform::~DesktopSyncPlatform() = default;
base::FilePath DesktopSyncPlatform::StoreDir() { return store_dir_; }
std::string DesktopSyncPlatform::Endpoint() {
  const auto test = base::CommandLine::ForCurrentProcess()->GetSwitchValueASCII("blanc-sync-endpoint");
  return test.empty() ? kSyncEndpoint : test;
}
std::string DesktopSyncPlatform::ConfigJson() {
  base::DictValue config;
#if BUILDFLAG(IS_MAC)
  config.Set("platform", "darwin");
#elif BUILDFLAG(IS_WIN)
  config.Set("platform", "win32");
#else
  config.Set("platform", "linux");
#endif
  config.Set("version", std::string(version_info::GetVersionNumber()));
  config.Set("deviceName", device_name_);
  config.Set("keyStore", true);
  const auto test = base::CommandLine::ForCurrentProcess()->GetSwitchValueASCII("blanc-sync-endpoint");
  if (!test.empty()) {
    config.Set("testEndpoint", test);
    config.Set("env", base::DictValue().Set("BLANC_TEST", "1").Set("BLANC_TEST_SYNC_ENDPOINT", test));
  }
  return base::WriteJson(config).value_or("{}");
}
scoped_refptr<network::SharedURLLoaderFactory> DesktopSyncPlatform::UrlLoaderFactory() { return factory_; }
std::optional<std::vector<uint8_t>> DesktopSyncPlatform::Protect(const std::vector<uint8_t>& data) {
  if (!encryptor_ || !encryptor_->IsEncryptionAvailable()) return std::nullopt;
  return encryptor_->EncryptString(std::string(data.begin(), data.end()));
}
std::optional<std::vector<uint8_t>> DesktopSyncPlatform::Unprotect(const std::vector<uint8_t>& data) {
  if (!encryptor_) return std::nullopt;
  const auto plain = encryptor_->DecryptData(data);
  if (!plain) return std::nullopt;
  return std::vector<uint8_t>(plain->begin(), plain->end());
}
void DesktopSyncPlatform::OnEvent(const std::string& event, const std::string& json) {
  on_event_.Run(event, json);
}
}  // namespace blanc
