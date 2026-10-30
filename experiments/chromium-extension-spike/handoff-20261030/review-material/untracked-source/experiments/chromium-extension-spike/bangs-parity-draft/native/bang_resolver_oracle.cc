#include "bang_resolver.h"
#include <cassert>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
using namespace blanc::bangs::draft;
std::u16string Unhex(const std::string& s){assert(s.size()%4==0);std::u16string v;for(size_t i=0;i<s.size();i+=4)v.push_back(static_cast<char16_t>(std::stoul(s.substr(i,4),nullptr,16)));return v;}
std::string Hex(std::u16string_view s){std::ostringstream o;o<<std::hex<<std::setfill('0');for(auto c:s)o<<std::setw(4)<<static_cast<unsigned>(c);return o.str();}
std::vector<std::string> Split(const std::string& s,char sep){std::vector<std::string> v;size_t b=0;for(;;){auto e=s.find(sep,b);v.push_back(s.substr(b,e-b));if(e==std::string::npos)break;b=e+1;}return v;}
int main(){std::vector<BangEntry> catalog,custom;std::string line;while(std::getline(std::cin,line)){
 auto f=Split(line,'\t');assert(!f.empty());
 if(f[0]=="C"||f[0]=="U"){assert(f.size()==7);auto aliases=Split(f[2],',');if(f[2].empty())aliases.clear();BangEntry e{f[1],aliases,Unhex(f[3]),Unhex(f[4]),Unhex(f[5]),std::stoi(f[6])};(f[0]=="C"?catalog:custom).push_back(std::move(e));continue;}
 assert(f[0]=="R"&&f.size()==3);auto r=ResolveBang(Unhex(f[2]),f[1]=="1",custom,catalog);
 switch(r.status){case ResolveStatus::kNotBang:std::cout<<"N\n";break;case ResolveStatus::kDisabled:std::cout<<"D\n";break;case ResolveStatus::kUnknown:std::cout<<"U\n";break;case ResolveStatus::kInvalidEncoding:std::cout<<"E\n";break;case ResolveStatus::kResolved:std::cout<<"S|"<<r.code<<'|'<<Hex(r.name)<<'|'<<Hex(r.query)<<'|'<<Hex(r.url)<<'\n';break;}
}}
