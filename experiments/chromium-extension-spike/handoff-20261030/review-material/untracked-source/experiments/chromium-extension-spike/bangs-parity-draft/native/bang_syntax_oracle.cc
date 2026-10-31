#include "bang_syntax.h"
#include <cassert>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
using namespace blanc::bangs::draft;
std::u16string DecodeHex(const std::string& s) {
  assert(s.size()%4==0);std::u16string result;
  for(size_t i=0;i<s.size();i+=4)result.push_back(static_cast<char16_t>(std::stoul(s.substr(i,4),nullptr,16)));
  return result;
}
std::string Hex(std::u16string_view s) {
  std::ostringstream out;out<<std::hex<<std::setfill('0');
  for(auto c:s)out<<std::setw(4)<<static_cast<unsigned>(c);
  return out.str();
}
int main() {
  std::string line;
  while(std::getline(std::cin,line)) {
    auto first=line.find('\t');assert(first!=std::string::npos);
    if(line.substr(0,first)=="P") {
      auto result=ParseBang(DecodeHex(line.substr(first+1)));
      if(!result)std::cout<<"N\n";
      else std::cout<<"S|"<<result->code<<'|'<<(result->at_start?'S':'E')<<'|'<<Hex(result->query)<<'\n';
    } else {
      auto second=line.find('\t',first+1);assert(second!=std::string::npos);
      auto result=EncodeBangQuery(DecodeHex(line.substr(second+1)),std::stoi(line.substr(first+1,second-first-1)));
      if(!result)std::cout<<"E\n";else std::cout<<"S|"<<Hex(*result)<<'\n';
    }
  }
}
