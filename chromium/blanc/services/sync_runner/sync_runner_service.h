#ifndef BLANC_SERVICES_SYNC_RUNNER_SYNC_RUNNER_SERVICE_H_
#define BLANC_SERVICES_SYNC_RUNNER_SYNC_RUNNER_SERVICE_H_

#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "base/containers/flat_map.h"
#include "base/memory/weak_ptr.h"
#include "blanc/services/sync_runner/sync_runner.mojom.h"
#include "gin/public/isolate_holder.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "v8/include/v8.h"

namespace blanc {
class SyncRunnerTaskRunner;

class SyncRunnerService : public mojom::SyncRunner {
 public:
  explicit SyncRunnerService(mojo::PendingReceiver<mojom::SyncRunner> receiver);
  ~SyncRunnerService() override;

  void Start(const std::string& script,
             const base::flat_map<std::string, std::vector<uint8_t>>& stores,
             const std::string& config_json,
             mojo::PendingRemote<mojom::SyncHost> host,
             StartCallback callback) override;
  void Call(const std::string& method, const std::string& args_json,
            CallCallback callback) override;

  // What the script's __host functions reach.
  mojom::SyncHost* host() { return host_.get(); }
  const base::flat_map<std::string, std::vector<uint8_t>>& initial_stores() const { return stores_; }
  void SetTimer(int id, int64_t delay_ms);
  void Fetch(const std::string& url, const std::string& method, const std::string& headers,
             std::optional<std::vector<uint8_t>> body, v8::Local<v8::Function> callback);
  void FinishCall(int id, bool ok, const std::string& result);

 private:
  template <typename F> void Enter(F&& body);
  void FireTimer(int id);
  void FetchDone(int id, const std::string& error, int32_t status, const std::string& headers,
                 const std::vector<uint8_t>& body);

  mojo::Receiver<mojom::SyncRunner> receiver_;
  mojo::Remote<mojom::SyncHost> host_;
  base::flat_map<std::string, std::vector<uint8_t>> stores_;
  scoped_refptr<SyncRunnerTaskRunner> task_runner_;
  std::unique_ptr<gin::IsolateHolder> isolate_;
  v8::Global<v8::Context> context_;
  std::map<int, v8::Global<v8::Function>> fetches_;
  std::map<int, CallCallback> calls_;
  int next_id_ = 1;
  base::WeakPtrFactory<SyncRunnerService> weak_{this};
};
}  // namespace blanc

#endif  // BLANC_SERVICES_SYNC_RUNNER_SYNC_RUNNER_SERVICE_H_
