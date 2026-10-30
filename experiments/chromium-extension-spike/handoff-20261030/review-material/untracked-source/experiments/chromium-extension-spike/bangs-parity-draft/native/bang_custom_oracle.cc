#include "bang_custom.h"
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include "base/at_exit.h"
#include "base/files/file.h"
#include "base/files/file_path.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
using namespace blanc::bangs::draft;
std::u16string Unhex(const std::string& s){if(s.size()%4)return {};std::u16string out;for(size_t i=0;i<s.size();i+=4)out.push_back(static_cast<char16_t>(std::stoul(s.substr(i,4),nullptr,16)));return out;}
std::string Hex(std::u16string_view s){std::ostringstream o;o<<std::hex<<std::setfill('0');for(auto c:s)o<<std::setw(4)<<static_cast<unsigned>(c);return o.str();}
std::vector<std::string> Split(const std::string& s){std::vector<std::string> v;size_t b=0;for(;;){auto e=s.find('\t',b);v.push_back(s.substr(b,e-b));if(e==std::string::npos)break;b=e+1;}return v;}
int main(int argc,char** argv){if(argc!=2)return 2;base::AtExitManager at_exit;auto file=base::File(base::FilePath::FromUTF8Unsafe(argv[1]).AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);if(!file.IsValid()||!base::i18n::InitializeICUWithFileDescriptor(file.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile))return 3;
 std::string line;while(std::getline(std::cin,line)){auto f=Split(line);if(f.size()!=3)return 4;auto out=NormalizeCustomBangs({{Unhex(f[0]),Unhex(f[1]),Unhex(f[2])}});if(out.empty())std::cout<<"N\n";else{auto& e=out.front();std::cout<<"S|"<<e.code<<'|'<<Hex(e.name)<<'|'<<Hex(e.template_url)<<'|'<<Hex(e.home)<<'|'<<Hex(e.domain)<<'\n';}}
}
