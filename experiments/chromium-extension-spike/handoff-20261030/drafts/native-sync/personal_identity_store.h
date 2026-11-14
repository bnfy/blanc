#ifndef BLANC_SYNC_PERSONAL_IDENTITY_STORE_H_
#define BLANC_SYNC_PERSONAL_IDENTITY_STORE_H_
#include <optional>
#include <string>
#include "base/files/file_path.h"
#include "base/sequence_checker.h"
namespace blanc::sync {
class NativeLocalProfileRegistry;
// Durable identity mapping only; it is not the named-profile registry. Run on a
// MayBlock sequence under the existing browser user-data singleton. Missing,
// incomplete, foreign or newer records never authorize fresh initialization.
class PersonalIdentityStore {
 public:
  enum class Status { kLoaded, kMissing, kReadError, kCorrupt, kWrongRoot,
                      kIncomplete, kUnsupportedVersion, kUnsupportedPlatform, kInvalidPath,
                      kAlreadyExists, kWriteError };
  struct Identity { base::FilePath profile_path; std::string id; };
  struct Result { Status status; std::optional<Identity> identity; };
  explicit PersonalIdentityStore(base::FilePath user_data_root);
  Result Read();
 private:
  friend class NativeLocalProfileRegistry;
  friend class PersonalIdentityStoreTestAccess;
  // Only an explicit trusted new-Personal creation or migration transaction may
  // call this. Never infer authorization from a missing file or profile name.
  Status InitializeNew(const base::FilePath& personal_path);
  bool ValidRoot() const;
  base::FilePath root_, path_, claim_;
  SEQUENCE_CHECKER(sequence_checker_);
};
}  // namespace blanc::sync
#endif
