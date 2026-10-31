#include "restart_record_auth.h"
#include <cassert>
#include <iostream>
using namespace blanc::fresh_default;
int main(){
 int checks=0;AuthKey key{};key[0]=1;AuthenticatedRecord r{};r.installation[0]=2;r.profile[0]=3;r.filesystem_identity[0]=4;r.generation=42;r.phase=RecordPhase::kPending;
 TrustedAnchor a{r.installation,r.profile,r.filesystem_identity,r.generation,r.phase};auto tag=SealRecord(key,r);assert(tag);++checks;
 const AuthTag expected={0x68,0x2a,0xec,0x90,0x81,0x16,0x0b,0xb5,0x3b,0x41,0x7c,0xc9,0xeb,0x06,0xa3,0x39,0xf4,0x08,0x14,0xea,0x5e,0x89,0x3e,0x81,0xc3,0x22,0x17,0xbe,0x26,0x7e,0xf4,0x09};
 assert(*tag==expected);++checks; // Independently generated Python HMAC-SHA256 vector.
 assert(VerifyRecord(key,r,*tag,a));++checks;
 auto key2=key;key2[1]=1;assert(!VerifyRecord(key2,r,*tag,a));++checks;
 auto altered=r;altered.phase=RecordPhase::kCommitted;assert(!VerifyRecord(key,altered,*tag,a));++checks;
 auto committed=SealRecord(key,altered);assert(committed && !VerifyRecord(key,altered,*committed,a));++checks;
 auto committed_anchor=a;committed_anchor.phase=RecordPhase::kCommitted;
 assert(!VerifyRecord(key,r,*tag,committed_anchor));++checks; // replayed pending record
 altered=r;altered.profile[1]=9;assert(!VerifyRecord(key,altered,*tag,a));++checks;
 altered=r;altered.installation[1]=9;assert(!VerifyRecord(key,altered,*tag,a));++checks;
 altered=r;altered.filesystem_identity[1]=9;assert(!VerifyRecord(key,altered,*tag,a));++checks;
 altered=r;altered.generation=41;assert(!VerifyRecord(key,altered,*tag,a));++checks;
 auto anchor=a;anchor.generation=43;assert(!VerifyRecord(key,r,*tag,anchor));++checks;
 anchor=a;anchor.profile[1]=1;assert(!VerifyRecord(key,r,*tag,anchor));++checks;
 auto tag2=*tag;tag2[0]^=1;assert(!VerifyRecord(key,r,tag2,a));++checks;
 AuthKey zero{};assert(!SealRecord(zero,r));++checks;
 altered=r;altered.generation=0;assert(!SealRecord(key,altered));++checks;
 altered=r;altered.phase=static_cast<RecordPhase>(255);assert(!SealRecord(key,altered));++checks;
 std::cout<<"restart record authentication checks="<<checks<<" failures=0; synthetic key and data only\n";
}
