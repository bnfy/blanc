#ifndef BLANC_SYNC_REQUEST_STATE_STORE_H_
#define BLANC_SYNC_REQUEST_STATE_STORE_H_
#include "base/files/file_path.h"
#include "base/sequence_checker.h"
#include "base/values.h"
#include "request_scheduler.h"

namespace blanc::sync {
// One instance per non-private profile/account on an owned MayBlock sequence.
// The service must establish consent/account identity before constructing this
// adapter. This file contains rate accounting only, never keys or user content.
// Missing/corrupt state is an error for an existing account, never a fresh quota.
class RequestLedger {
 public:
  enum class Status { kLoaded, kMissing, kReadError, kCorrupt,
                      kWrongAccount, kInvalidBinding, kWriteError, kAlreadyExists,
                      kWrongProfile, kNotAllowed };
  struct Loaded {
    Status status;
    std::optional<SchedulerState> state;
  };
  virtual ~RequestLedger() = default;
  virtual Loaded Load() = 0;
  virtual Status InitializeNew() = 0;
  virtual Status Commit(const SchedulerState& state) = 0;
};
std::optional<base::DictValue> EncodeRequestState(const SchedulerState& state);
std::optional<SchedulerState> DecodeRequestState(const base::DictValue& value);
class RequestStateStore : public RequestLedger {
 public:
  RequestStateStore(base::FilePath path, std::string account_binding);
  RequestStateStore(const RequestStateStore&) = delete;
  RequestStateStore& operator=(const RequestStateStore&) = delete;
  Loaded Load() override;
  // Only the service's explicit new-account transaction may call this. Refuses
  // any existing file. External processes must not share this profile/store.
  Status InitializeNew() override;
  Status Commit(const SchedulerState& state) override;
 private:
  Status Write(const SchedulerState& state);
  base::FilePath path_;
  std::string binding_;
  SEQUENCE_CHECKER(sequence_checker_);
};
}  // namespace blanc::sync
#endif
