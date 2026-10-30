#include "bang_disk_confirmation.h"
#include "base/at_exit.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
using namespace blanc::bangs::draft;
int main(int argc,char** argv){
 if(argc!=3)return 1;base::AtExitManager exit;
 const auto source=base::FilePath::FromUTF8Unsafe(argv[1]);auto dir=base::FilePath::FromUTF8Unsafe(argv[2]);if(!base::CreateDirectory(dir))return 2;
 std::string bytes;if(!base::ReadFileToString(source,&bytes))return 3;auto root=base::JSONReader::ReadDict(bytes,base::JSON_PARSE_CHROMIUM_EXTENSIONS);if(!root)return 4;
 auto* custom=root->FindByDottedPath("blanc.bangs.custom_utf16_v1");if(!custom||!custom->is_list())return 5;
 if(!ConfirmBangPrefOnDisk(source,SavedBangPref::kCustom,*custom))return 6;
 if(ConfirmBangPrefOnDisk(source,SavedBangPref::kCustom,base::Value(base::ListValue())))return 7;
 if(ConfirmBangPrefOnDisk(source,SavedBangPref::kEnabled,base::Value(true)))return 8;
 auto file=dir.AppendASCII("prefs.json");if(!base::WriteFile(file,"{bad"))return 9;
 if(ConfirmBangPrefOnDisk(file,SavedBangPref::kCustom,*custom))return 10;
 if(!base::WriteFile(file,"{\"blanc\":{\"bangs\":{\"enabled\":true}}}"))return 11;
 if(!ConfirmBangPrefOnDisk(file,SavedBangPref::kEnabled,base::Value(true)))return 12;
 if(ConfirmBangPrefOnDisk(file,SavedBangPref::kEnabled,base::Value(false)))return 13;
 if(ConfirmBangPrefOnDisk(dir.AppendASCII("missing"),SavedBangPref::kEnabled,base::Value(true)))return 14;
 return 0;
}
