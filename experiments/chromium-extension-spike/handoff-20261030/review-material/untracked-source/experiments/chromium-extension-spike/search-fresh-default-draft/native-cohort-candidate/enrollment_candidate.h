#ifndef BLANC_COHORT_ENROLLMENT_CANDIDATE_H_
#define BLANC_COHORT_ENROLLMENT_CANDIDATE_H_
#include "base/memory/weak_ptr.h"
#include "fresh_profile_proof.h"
class Profile;
namespace blanc::cohort_candidate {
class ImportCoordinator;
// Only a future, reviewed importer owner may mint this after it proves no
// existing profile/settings are being imported. No such owner exists yet.
class ImportResolution {
 private:
  friend class ImportCoordinator;
  friend class Enrollment;
  explicit ImportResolution(base::WeakPtr<Profile> profile);
  ~ImportResolution();
  base::WeakPtr<Profile> profile_;
};
enum class Result { kPreserved, kSetInMemoryNotDurable };
class Enrollment {
 public:
  explicit Enrollment(fresh_default::FreshProfileProof proof)
      : proof_(std::move(proof)) {}
  Enrollment(const Enrollment&) = delete;
  Enrollment& operator=(const Enrollment&) = delete;
  Result Run(Profile* profile, const ImportResolution& import);
 private:
  fresh_default::FreshProfileProof proof_;
  bool consumed_ = false;
};
}
#endif
