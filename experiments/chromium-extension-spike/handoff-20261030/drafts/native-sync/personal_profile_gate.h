#ifndef BLANC_SYNC_PERSONAL_PROFILE_GATE_H_
#define BLANC_SYNC_PERSONAL_PROFILE_GATE_H_
#include <optional>
#include "base/files/file_path.h"
namespace blanc::sync {
// Policy used only after the native registry supplies its protected Personal
// mapping. This never creates/loads a profile or chooses one from window focus.
class PersonalProfileGate {
 public:
  bool Authorize(const base::FilePath& user_data_root, const base::FilePath& mapped,
                 bool requester_regular, bool requester_owned,
                 bool personal_loaded_regular) {
    if (!requester_regular || !requester_owned || !personal_loaded_regular ||
        !user_data_root.IsAbsolute() || user_data_root.ReferencesParent() ||
        !mapped.IsAbsolute() || mapped.ReferencesParent() ||
        mapped.DirName() != user_data_root || (pinned_ && *pinned_ != mapped))
      return false;
    pinned_ = mapped;
    return true;
  }
 private:
  std::optional<base::FilePath> pinned_;
};
}  // namespace blanc::sync
#endif
