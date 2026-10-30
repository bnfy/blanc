#include "legacy_recovery_broker.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "build/build_config.h"
#include "crypto/secure_util.h"
#if BUILDFLAG(IS_MAC)
#include "components/os_crypt/async/browser/keychain_key_provider.h"
#endif
namespace blanc::sync {
namespace {
std::unique_ptr<os_crypt_async::OSCryptAsync> MacSource() {
#if BUILDFLAG(IS_MAC)
  std::vector<std::pair<os_crypt_async::OSCryptAsync::Precedence,
                        std::unique_ptr<os_crypt_async::KeyProvider>>> providers;
  providers.emplace_back(0, std::make_unique<os_crypt_async::KeychainKeyProvider>(
      os_crypt_async::KeychainKeyProvider::ReadOnlyLookup{"Blanc Safe Storage", "Blanc"}));
  return std::make_unique<os_crypt_async::OSCryptAsync>(std::move(providers));
#else
  return nullptr;
#endif
}
}
LegacyRecoveryBroker::LegacyRecoveryBroker(VaultContext context,
    scoped_refptr<os_crypt_async::Encryptor> destination)
    : LegacyRecoveryBroker(std::move(context), std::move(destination), MacSource) {}
LegacyRecoveryBroker::LegacyRecoveryBroker(VaultContext context,
    scoped_refptr<os_crypt_async::Encryptor> destination, SourceFactory factory)
    : destination_(std::move(destination), std::move(context)), source_factory_(std::move(factory)),
      runner_(base::SequencedTaskRunner::GetCurrentDefault()) {}
LegacyRecoveryBroker::~LegacyRecoveryBroker() { Shutdown(); }
void LegacyRecoveryBroker::Reply(Completed done, Result result) {
  CHECK(runner_->PostTask(FROM_HERE, base::BindOnce(
      [](auto stopped, Completed done, Result result) {
        if (stopped->load()) result = {Status::kShutdown, {}};
        std::move(done).Run(std::move(result));
      }, stopped_, std::move(done), std::move(result))));
}
void LegacyRecoveryBroker::ClearInputs() {
  crypto::SecureZeroBuffer(base::as_writable_byte_span(sync_)); sync_.clear();
  crypto::SecureZeroBuffer(base::as_writable_byte_span(shared_)); shared_.clear();
}
void LegacyRecoveryBroker::Recover(std::string sync_json, std::string shared_json, Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); CHECK(done);
  if (stopping_ || pending_) {
    crypto::SecureZeroBuffer(base::as_writable_byte_span(sync_json));
    crypto::SecureZeroBuffer(base::as_writable_byte_span(shared_json));
    Reply(std::move(done), {stopping_ ? Status::kShutdown : Status::kBusy, {}}); return;
  }
  sync_ = std::move(sync_json); shared_ = std::move(shared_json); pending_ = std::move(done);
  const auto parsed = ParseLegacySyncRecord(sync_);
  // Resolve invalid/disabled/unavailable input without touching source OS storage.
  if (destination_.availability() != KeyVault::Status::kOk || !parsed.record ||
      !parsed.record->enabled || parsed.record->status_mapping_required ||
      parsed.record->device_id.empty() || !destination_.MatchesAccount(parsed.record->account) ||
      !ParseLegacyRequestState(shared_)) { SourceReady(nullptr); return; }
  // A denied/locked initialization is cached by OSCryptAsync. Each explicit
  // retry needs a fresh source instance so unlocking can actually recover.
  source_ = source_factory_ ? source_factory_() : nullptr;
  if (!source_) { SourceReady(nullptr); return; }
  // OSCryptAsync can reply synchronously. State/callback are installed first.
  source_->GetInstance(base::BindOnce(&LegacyRecoveryBroker::SourceReady, weak_factory_.GetWeakPtr()));
}
void LegacyRecoveryBroker::SourceReady(scoped_refptr<os_crypt_async::Encryptor> source) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_ || !pending_) return;
  auto prepared = PrepareLegacyCore(sync_, shared_, destination_, std::move(source));
  const auto status = prepared.status == LegacyPreparationStatus::kPreparedCore
      ? Status::kPrepared : Status::kRejected;
  Finish({status, std::move(prepared)});
}
void LegacyRecoveryBroker::Finish(Result result) {
  auto done = std::move(pending_); ClearInputs(); Reply(std::move(done), std::move(result));
}
void LegacyRecoveryBroker::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_) return;
  stopping_ = true; stopped_->store(true); weak_factory_.InvalidateWeakPtrs(); source_.reset();
  if (pending_) Finish({Status::kShutdown, {}}); else ClearInputs();
}
}
