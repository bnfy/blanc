#include "personal_deletion_guard.h"
#include "base/check.h"
#include "base/uuid.h"
#include "build/build_config.h"
#include <string_view>
#if BUILDFLAG(IS_POSIX)
#include <sys/stat.h>
#endif
namespace blanc::sync {
PersonalDeletionGuard::PersonalDeletionGuard(base::FilePath root):root_(std::move(root)){}
bool PersonalDeletionGuard::ValidChild(const base::FilePath& path) const {
 return root_.IsAbsolute()&&!root_.ReferencesParent()&&path.IsAbsolute()&&
     !path.ReferencesParent()&&path.DirName()==root_;
}
bool PersonalDeletionGuard::Confirm(const PersonalIdentityStore::Identity& identity){
 base::AutoLock lock(lock_);
 const auto id=base::Uuid::ParseLowercase(identity.id);
 if(!ValidChild(identity.profile_path)||!id.is_valid()||identity.id.size()!=36||
    identity.id[14]!='4'||!std::string_view("89ab").contains(identity.id[19])||
    (pinned_&&(pinned_->profile_path!=identity.profile_path||pinned_->id!=identity.id))){
  verified_=false;return false;
 }
 pinned_=identity;verified_=true;return true;
}
void PersonalDeletionGuard::Invalidate(){base::AutoLock lock(lock_);verified_=false;}
PersonalDeletionGuard::Preflight PersonalDeletionGuard::ClassifyLocked(
    const base::FilePath& target){
 if(!ValidChild(target))return Preflight::kInvalidPath;
 if(!verified_||!pinned_)return Preflight::kDeferred;
 if(target==pinned_->profile_path)return Preflight::kProtected;
#if BUILDFLAG(IS_POSIX)
 // Lexically different names can address the same directory on a
 // case-insensitive filesystem. Reject symlinks, missing targets and any
 // failure to establish different directory identities before an action.
 struct stat personal{},candidate{};
 if(lstat(pinned_->profile_path.value().c_str(),&personal)!=0||
    lstat(target.value().c_str(),&candidate)!=0||!S_ISDIR(personal.st_mode)||
    !S_ISDIR(candidate.st_mode))return Preflight::kDeferred;
 if(personal.st_dev==candidate.st_dev&&personal.st_ino==candidate.st_ino)
   return Preflight::kProtected;
#else
 // Native handle/reparse-point checks are required before enabling Windows.
 return Preflight::kDeferred;
#endif
 return Preflight::kMaySchedule;
}
PersonalDeletionGuard::Preflight PersonalDeletionGuard::CheckBeforeScheduling(
    const base::FilePath& target){
 base::AutoLock lock(lock_);
 return ClassifyLocked(target);
}
PersonalDeletionGuard::Decision PersonalDeletionGuard::RunIfAllowed(
    const base::FilePath& target,std::function<bool()> action){
 base::AutoLock lock(lock_);
 switch(ClassifyLocked(target)){
  case Preflight::kInvalidPath:return Decision::kInvalidPath;
  case Preflight::kDeferred:return Decision::kDeferred;
  case Preflight::kProtected:return Decision::kProtected;
  case Preflight::kMaySchedule:break;
 }
 if(!action||!action())return Decision::kActionFailed;
 return Decision::kDeleted;
}
}  // namespace blanc::sync
