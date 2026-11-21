#include "personal_identity_store.h"
#include "base/check.h"
#include "base/containers/span.h"
#include "base/files/file.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/uuid.h"
#include "build/build_config.h"
#include "crypto/sha2.h"
#include <string_view>
namespace blanc::sync {
namespace {
using Status=PersonalIdentityStore::Status;
std::string Binding(const base::FilePath& root) {
 return base::HexEncodeLower(crypto::SHA256HashString(root.AsUTF8Unsafe()));
}
bool SafeDirectory(const std::string& value) {
 if(value.empty()||value.size()>512||!base::IsStringUTF8AllowingNoncharacters(value)||
    value=="."||value==".."||value.find('/')!=std::string::npos||
    value.find('\\')!=std::string::npos||value.find('\0')!=std::string::npos)return false;
 const auto part=base::FilePath::FromUTF8Unsafe(value);
 return !part.IsAbsolute()&&!part.ReferencesParent()&&part==part.BaseName();
}
struct Bytes { Status status; std::string value; };
Bytes ReadBytes(const base::FilePath& path) {
 base::File file(path,base::File::FLAG_OPEN|base::File::FLAG_READ|base::File::FLAG_NO_FOLLOW);
 if(!file.IsValid())return {file.error_details()==base::File::FILE_ERROR_NOT_FOUND?Status::kMissing:Status::kReadError,{}};
 const auto size=file.GetLength();if(size<0)return {Status::kReadError,{}};if(!size||size>2048)return {Status::kCorrupt,{}};
 std::string value(static_cast<size_t>(size),'\0');
 if(!file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(value)))return {Status::kReadError,{}};
 return {Status::kLoaded,std::move(value)};
}
Status CreateExclusive(const base::FilePath& path,const std::string& bytes) {
 base::File file(path,base::File::FLAG_CREATE|base::File::FLAG_WRITE|base::File::FLAG_NO_FOLLOW);
 if(!file.IsValid())return file.error_details()==base::File::FILE_ERROR_EXISTS?Status::kAlreadyExists:Status::kWriteError;
 if(!file.WriteAtCurrentPosAndCheck(base::as_byte_span(bytes))||!file.Flush())return Status::kWriteError;
 file.Close();return Status::kLoaded;
}
}
PersonalIdentityStore::PersonalIdentityStore(base::FilePath root)
 :root_(std::move(root)),path_(root_.AppendASCII("Blanc Personal.identity")),
  claim_(root_.AppendASCII("Blanc Personal.claim")){}
bool PersonalIdentityStore::ValidRoot() const {return root_.IsAbsolute()&&!root_.ReferencesParent();}
PersonalIdentityStore::Result PersonalIdentityStore::Read(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
#if BUILDFLAG(IS_WIN)
 // FLAG_NO_FOLLOW is POSIX-only. Do not enable this path until Windows can
 // open and verify the reparse point without a check/use race.
 return {Status::kUnsupportedPlatform,{}};
#endif
 if(!ValidRoot())return {Status::kInvalidPath,{}};
 const auto claim=ReadBytes(claim_);const auto record=ReadBytes(path_);
 if(claim.status==Status::kMissing&&record.status==Status::kMissing)return {Status::kMissing,{}};
 if(claim.status==Status::kMissing||record.status==Status::kMissing)return {Status::kIncomplete,{}};
 if(claim.status!=Status::kLoaded)return {claim.status,{}};
 if(record.status!=Status::kLoaded)return {record.status,{}};
 if(claim.value!=record.value)return {Status::kCorrupt,{}};
 const auto& bytes=record.value;
 const auto json=base::JSONReader::ReadDict(bytes,base::JSON_PARSE_RFC,4);if(!json)return {Status::kCorrupt,{}};
 const auto version=json->FindInt("version");if(version&&*version>1)return {Status::kUnsupportedVersion,{}};
 if(!version||*version!=1||json->size()!=4)return {Status::kCorrupt,{}};
 const auto* binding=json->FindString("root");const auto* dir=json->FindString("directory");const auto* id=json->FindString("id");
 if(!binding||!dir||!id||!SafeDirectory(*dir))return {Status::kCorrupt,{}};
 const auto uuid=base::Uuid::ParseLowercase(*id);if(!uuid.is_valid()||id->size()!=36||(*id)[14]!='4'||!std::string_view("89ab").contains((*id)[19]))return {Status::kCorrupt,{}};
 if(*binding!=Binding(root_))return {Status::kWrongRoot,{}};
 const auto path=root_.Append(base::FilePath::FromUTF8Unsafe(*dir));
 if(path.DirName()!=root_||path.ReferencesParent())return {Status::kCorrupt,{}};
 // An independently present profile marker binds the protected mapping to the
 // specific profile directory. A reused directory lacking it cannot inherit
 // the former Personal identity. Neither missing nor mismatched markers heal
 // automatically: recovery must establish authority explicitly.
 const auto marker=ReadBytes(path.AppendASCII("Blanc Personal.owner"));
 if(marker.status!=Status::kLoaded)return {marker.status==Status::kMissing?Status::kIncomplete:marker.status,{}};
 if(marker.value!=bytes)return {Status::kCorrupt,{}};
 return {Status::kLoaded,Identity{path,*id}};
}
PersonalIdentityStore::Status PersonalIdentityStore::InitializeNew(const base::FilePath& personal){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
#if BUILDFLAG(IS_WIN)
 return Status::kUnsupportedPlatform;
#endif
 if(!ValidRoot()||!personal.IsAbsolute()||personal.ReferencesParent()||personal.DirName()!=root_||
    !SafeDirectory(personal.BaseName().AsUTF8Unsafe()))return Status::kInvalidPath;
 const auto existing=Read();if(existing.status!=Status::kMissing)return existing.status==Status::kLoaded?Status::kAlreadyExists:existing.status;
 base::DictValue json;json.Set("version",1);json.Set("root",Binding(root_));json.Set("directory",personal.BaseName().AsUTF8Unsafe());json.Set("id",base::Uuid::GenerateRandomV4().AsLowercaseString());
 const auto encoded=base::WriteJson(json);if(!encoded)return Status::kWriteError;
 // Claim the entire user-data root first. If either later write is interrupted,
 // the surviving claim prevents another profile from inheriting Personal.
 const auto claim=CreateExclusive(claim_,*encoded);if(claim!=Status::kLoaded)return claim;
 const auto marker=CreateExclusive(personal.AppendASCII("Blanc Personal.owner"),*encoded);
 if(marker!=Status::kLoaded)return marker;
 const auto record=CreateExclusive(path_,*encoded);if(record!=Status::kLoaded)return record;
 return Read().status;
}
}  // namespace blanc::sync
