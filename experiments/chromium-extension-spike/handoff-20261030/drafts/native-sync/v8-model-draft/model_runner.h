#ifndef BLANC_SYNC_DRAFT_MODEL_RUNNER_H_
#define BLANC_SYNC_DRAFT_MODEL_RUNNER_H_
#include <atomic>
#include <memory>
#include <string>
#include "base/functional/callback.h"
#include "base/sequence_checker.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/single_thread_task_runner.h"
namespace blanc::sync::draft {
// Native worker owner only. Requires prior process-owned Gin initialization.
// Never initializes V8, changes flags or grants filesystem/network/key APIs.
// This remains a draft until utility-process/resource-limit integration lands.
class ModelRunner {
 public:
  enum class Method { kJsonRoundTrip,kSanitizeEntry,kDeparture,kMergeDevices,kMergeBoundDevices };
  struct Result { std::string json,error; };
  using Completed=base::OnceCallback<void(Result)>;
  explicit ModelRunner(scoped_refptr<base::SingleThreadTaskRunner> model_sequence);
  ~ModelRunner();
  void Run(Method method,std::string json,Completed done);
  // Queued replies are redacted immediately; done runs after isolate disposal.
  void Shutdown(base::OnceClosure done = {});
 private:
  struct Backend;
  std::shared_ptr<Backend> backend_;
  scoped_refptr<base::SingleThreadTaskRunner> model_;
  scoped_refptr<base::SequencedTaskRunner> reply_;
  std::shared_ptr<std::atomic<bool>> stopped_=std::make_shared<std::atomic<bool>>(false);
  SEQUENCE_CHECKER(sequence_checker_);
};
}  // namespace blanc::sync::draft
#endif
