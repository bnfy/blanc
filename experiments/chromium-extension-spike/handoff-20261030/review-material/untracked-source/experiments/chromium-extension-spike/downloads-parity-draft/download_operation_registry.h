#ifndef BLANC_DOWNLOAD_OPERATION_REGISTRY_H_
#define BLANC_DOWNLOAD_OPERATION_REGISTRY_H_

#include <cstdint>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

// Isolated model, not yet connected to Chromium. Family and context are
// browser-owned lifetime identities, never renderer-supplied profile IDs.
// The registry belongs on one native sequence. Its lifetime must outlast UI
// documents and dispatched operations. It does not implement authorization,
// operation observation, persistence, or cross-process at-most-once behavior.
class DownloadOperationRegistry {
 public:
  enum class Action { kCancel, kResume, kRetry, kOpen, kShow };
  enum class Result { kReserved, kDispatched, kSucceeded, kDeniedBeforeDispatch, kConfirmedFailure };
  struct ItemKey {
    std::string context_epoch;
    std::string guid;
    bool operator<(const ItemKey& other) const {
      return context_epoch < other.context_epoch || (context_epoch == other.context_epoch && guid < other.guid);
    }
    bool Valid() const { return !context_epoch.empty() && !guid.empty(); }
  };
  struct Operation { uint64_t token; Result result; bool clear; ItemKey item; std::optional<Action> action; };

  std::optional<uint64_t> BeginItem(const std::string& family, const ItemKey& key, Action action) {
    if (family.empty() || !key.Valid()) return std::nullopt;
    auto found = owners_.find(family);
    if (found != owners_.end() && (found->second.items.count(key) || found->second.clear_items.count(key))) return std::nullopt;
    auto token = Next(); if (!token) return std::nullopt;
    owners_[family].items.emplace(key, Operation{*token, Result::kReserved, false, key, action});
    return token;
  }
  // The caller must supply an already validated, stable snapshot of eligible
  // finished items. The native handler must re-resolve every item before
  // removal and must never delete files or intermediate download data.
  std::optional<uint64_t> BeginClear(const std::string& family, const std::vector<ItemKey>& snapshot) {
    if (family.empty()) return std::nullopt;
    std::set<ItemKey> keys;
    for (const auto& key : snapshot) if (!key.Valid() || !keys.insert(key).second) return std::nullopt;
    auto found = owners_.find(family);
    if (found != owners_.end()) {
      if (found->second.clear) return std::nullopt;
      for (const auto& key : keys) if (found->second.items.count(key)) return std::nullopt;
    }
    auto token = Next(); if (!token) return std::nullopt;
    auto& owner = owners_[family];
    owner.clear = Operation{*token, Result::kReserved, true, {}, std::nullopt};
    owner.clear_items = std::move(keys);
    return token;
  }
  bool MarkDispatched(const std::string& family, uint64_t token) {
    Operation* op = FindMutable(family, token);
    if (!op || op->result != Result::kReserved) return false;
    op->result = Result::kDispatched; return true;
  }
  bool DenyBeforeDispatch(const std::string& family, uint64_t token) {
    Operation* op = FindMutable(family, token);
    if (!op || op->result != Result::kReserved) return false;
    op->result = Result::kDeniedBeforeDispatch; return true;
  }
  // Only an authoritative terminal observation can resolve dispatched work.
  // Timeout, observer loss, void return, or a partially completed batch must
  // remain kDispatched until the backend can establish the full result.
  bool ObserveTerminal(const std::string& family, uint64_t token, Result result) {
    if (result != Result::kSucceeded && result != Result::kConfirmedFailure) return false;
    Operation* op = FindMutable(family, token);
    if (!op || op->result != Result::kDispatched) return false;
    op->result = result; return true;
  }
  std::optional<Operation> Find(const std::string& family, uint64_t token) const {
    auto found = owners_.find(family); if (found == owners_.end()) return std::nullopt;
    if (found->second.clear && found->second.clear->token == token) return *found->second.clear;
    for (const auto& [key, op] : found->second.items) if (op.token == token) return op;
    return std::nullopt;
  }
  std::optional<Operation> FindItem(const std::string& family, const ItemKey& key) const {
    auto owner = owners_.find(family); if (owner == owners_.end()) return std::nullopt;
    auto item = owner->second.items.find(key);
    return item == owner->second.items.end() ? std::nullopt : std::optional<Operation>(item->second);
  }
  // Enables a newly created trusted sheet to reconcile native operation
  // state without retaining a token in renderer or profile storage.
  std::vector<Operation> List(const std::string& family) const {
    std::vector<Operation> result;
    auto owner = owners_.find(family); if (owner == owners_.end()) return result;
    if (owner->second.clear) result.push_back(*owner->second.clear);
    for (const auto& [key, op] : owner->second.items) result.push_back(op);
    return result;
  }
  // Internal only: the trusted backend must filter by authorized context
  // epoch before projecting any busy state into a renderer.
  std::optional<std::vector<ItemKey>> ClearItems(const std::string& family, uint64_t token) const {
    auto owner = owners_.find(family);
    if (owner == owners_.end() || !owner->second.clear || owner->second.clear->token != token) return std::nullopt;
    return std::vector<ItemKey>(owner->second.clear_items.begin(), owner->second.clear_items.end());
  }
  bool Acknowledge(const std::string& family, uint64_t token) {
    auto found = owners_.find(family); if (found == owners_.end()) return false;
    auto& state = found->second;
    if (state.clear && state.clear->token == token) {
      if (state.clear->result == Result::kReserved || state.clear->result == Result::kDispatched) return false;
      state.clear.reset(); state.clear_items.clear();
    } else {
      auto item = state.items.begin();
      while (item != state.items.end() && item->second.token != token) ++item;
      if (item == state.items.end() || item->second.result == Result::kReserved || item->second.result == Result::kDispatched) return false;
      state.items.erase(item);
    }
    if (!state.clear && state.items.empty()) owners_.erase(found);
    return true;
  }
  bool RetireFamily(const std::string& family) const { return owners_.find(family) == owners_.end(); }
 private:
  struct OwnerState { std::map<ItemKey, Operation> items; std::optional<Operation> clear; std::set<ItemKey> clear_items; };
  std::optional<uint64_t> Next() {
    if (next_ == std::numeric_limits<uint64_t>::max()) return std::nullopt;
    return ++next_;
  }
  Operation* FindMutable(const std::string& family, uint64_t token) {
    auto found = owners_.find(family); if (found == owners_.end()) return nullptr;
    if (found->second.clear && found->second.clear->token == token) return &*found->second.clear;
    for (auto& [key, op] : found->second.items) if (op.token == token) return &op;
    return nullptr;
  }
  uint64_t next_ = 0;
  std::map<std::string, OwnerState> owners_;
};
#endif
