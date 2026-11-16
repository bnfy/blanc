#include "personal_profile_gate.h"
#include "base/at_exit.h"
#include "base/check.h"
#include <iostream>
using blanc::sync::PersonalProfileGate;
int main(){
 base::AtExitManager at_exit;
 const auto root=base::FilePath::FromUTF8Unsafe("/synthetic/blanc-user-data");
 const auto personal=root.AppendASCII("Default");const auto named=root.AppendASCII("Profile 1");
 PersonalProfileGate gate;
 CHECK(!gate.Authorize(root,personal,false,true,true)); // private/guest/system
 CHECK(!gate.Authorize(root,personal,true,false,true)); // unmanaged requester
 CHECK(!gate.Authorize(root,personal,true,true,false)); // missing/unloaded target
 CHECK(!gate.Authorize(root,base::FilePath::FromUTF8Unsafe("Default"),true,true,true));
 CHECK(!gate.Authorize(root,base::FilePath::FromUTF8Unsafe("/synthetic/blanc-user-data/../other"),true,true,true));
 CHECK(!gate.Authorize(root,base::FilePath::FromUTF8Unsafe("/other/Default"),true,true,true));
 // A failed candidate must not pin the path; a managed named caller can then
 // route account-level operations to the actual loaded Personal identity.
 CHECK(gate.Authorize(root,personal,true,true,true));
 CHECK(gate.Authorize(root,personal,true,true,true));
 CHECK(!gate.Authorize(root,named,true,true,true)); // focus/registry swap denied
 CHECK(!gate.Authorize(root,personal,false,true,true));
 CHECK(!gate.Authorize(root,personal,true,true,false)); // unloading does not fall back
 CHECK(gate.Authorize(root,personal,true,true,true));
 std::cout<<"personal profile gate rejects unsafe contexts and pins verified identity\n";
}
