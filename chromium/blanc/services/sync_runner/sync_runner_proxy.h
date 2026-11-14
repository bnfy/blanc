#ifndef BLANC_SERVICES_SYNC_RUNNER_SYNC_RUNNER_PROXY_H_
#define BLANC_SERVICES_SYNC_RUNNER_SYNC_RUNNER_PROXY_H_

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"

namespace network {
class SharedURLLoaderFactory;
}

namespace blanc {
// What each platform supplies: keys, a place for the files, and a network.
class SyncPlatform {
 public:
  virtual ~SyncPlatform() = default;
  virtual base::FilePath StoreDir() = 0;
  virtual std::string ConfigJson() = 0;
  virtual std::string Endpoint() = 0;
  virtual scoped_refptr<network::SharedURLLoaderFactory> UrlLoaderFactory() = 0;
  virtual std::optional<std::vector<uint8_t>> Protect(const std::vector<uint8_t>& data) = 0;
  virtual std::optional<std::vector<uint8_t>> Unprotect(const std::vector<uint8_t>& data) = 0;
  virtual void OnEvent(const std::string& event, const std::string& json) = 0;
};

using SyncCallback = base::OnceCallback<void(bool ok, const std::string& result)>;
// Must be set before SyncCall; not owned, lives for the process.
void SetSyncPlatform(SyncPlatform* platform);
// `method` is "module.export", `args_json` a JSON array. Starts the runner when needed.
void SyncCall(std::string method, std::string args_json, SyncCallback callback);
}  // namespace blanc

#endif  // BLANC_SERVICES_SYNC_RUNNER_SYNC_RUNNER_PROXY_H_
