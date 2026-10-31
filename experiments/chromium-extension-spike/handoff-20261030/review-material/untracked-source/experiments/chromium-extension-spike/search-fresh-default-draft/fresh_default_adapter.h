#ifndef BLANC_FRESH_DEFAULT_ADAPTER_H_
#define BLANC_FRESH_DEFAULT_ADAPTER_H_
#include <utility>
#include "fresh_profile_proof.h"
class Profile;
namespace blanc::fresh_default {
enum class Result { kWaitingForIdentity, kWaitingForModel, kPreserved, kSelectedAndPrefObserved, kSelectionNotPersisted };
// One attempt per newly created regular profile; the owner must prove a fresh
// profile directory before creating any profile files, tie the attempt's
// lifetime to that profile, and register a load callback before Load().
// The adapter never retains a user query and has no internal asynchronous work.
class Attempt {
 public:
  explicit Attempt(FreshProfileProof proof) : proof_(std::move(proof)) {}
  Result Advance(Profile* profile);
 private:
  FreshProfileProof proof_;
  bool consumed_ = false;
};
}
#endif
