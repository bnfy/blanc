#ifndef CHROME_SERVICES_BLANC_BLOCKER_SERVICE_H_
#define CHROME_SERVICES_BLANC_BLOCKER_SERVICE_H_
#include <memory>
#include "chrome/services/blanc_blocker/blocker.mojom.h"
#include "gin/public/isolate_holder.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "v8/include/v8.h"
namespace blanc {
class BlockerTaskRunner;
class BlockerService : public mojom::Blocker {
 public:
  explicit BlockerService(mojo::PendingReceiver<mojom::Blocker> receiver);
  ~BlockerService() override;
  void Initialize(const std::string& script, InitializeCallback callback) override;
  void Decide(const std::string& url, const std::string& resource_type,
              const std::string& referrer, DecideCallback callback) override;
  void Cosmetics(const std::string& input, CosmeticsCallback callback) override;
 private:
  scoped_refptr<BlockerTaskRunner> task_runner_;
  std::unique_ptr<gin::IsolateHolder> isolate_;
  v8::Global<v8::Context> context_;
  v8::Global<v8::Function> decide_;
  v8::Global<v8::Function> cosmetics_;
  mojo::Receiver<mojom::Blocker> receiver_;
};
}
#endif
