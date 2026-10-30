#include "reader_raster.h"
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>
int main(){std::string line;while(std::getline(std::cin,line)){if(line.size()%2){std::cout<<"error\n";continue;}std::vector<uint8_t>b;bool valid=true;for(size_t i=0;i<line.size();i+=2){auto hex=[](char c)->int{if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;return -1;};int a=hex(line[i]),z=hex(line[i+1]);if(a<0||z<0){valid=false;break;}b.push_back(static_cast<uint8_t>(a*16+z));}if(!valid){std::cout<<"error\n";continue;}auto d=blanc::reader::ReadRasterDimensions(b);if(!d)std::cout<<"null\n";else std::cout<<d->width<<","<<d->height<<"\n";}}
