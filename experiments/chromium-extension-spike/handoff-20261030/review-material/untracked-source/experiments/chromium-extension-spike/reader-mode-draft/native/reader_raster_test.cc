#include "reader_raster.h"

#include <cassert>
#include <cstdint>
#include <iostream>
#include <random>
#include <vector>
using blanc::reader::IsReaderRasterContentType;
using blanc::reader::ReadRasterDimensions;
using blanc::reader::ReaderRasterWithinLimits;
using blanc::reader::kReaderMaxTotalPixels;

std::vector<uint8_t> Png(uint32_t w, uint32_t h) {
  std::vector<uint8_t> b = {137,80,78,71,13,10,26,10,0,0,0,13,'I','H','D','R',0,0,0,0,0,0,0,0};
  for(int i=0;i<4;i++){b[16+i]=static_cast<uint8_t>(w>>(24-i*8));b[20+i]=static_cast<uint8_t>(h>>(24-i*8));}return b;
}
void Size(const std::vector<uint8_t>& b,uint32_t w,uint32_t h){auto d=ReadRasterDimensions(b);assert(d&&d->width==w&&d->height==h);}
int main(){
  Size(Png(640,480),640,480);
  std::vector<uint8_t> gif={'G','I','F','8','9','a',0x80,0x02,0xe0,0x01};Size(gif,640,480);
  std::vector<uint8_t> jpg={0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,7,8,1,0xe0,2,0x80};Size(jpg,640,480);
  std::vector<uint8_t> x(30);x[0]='R';x[1]='I';x[2]='F';x[3]='F';x[8]='W';x[9]='E';x[10]='B';x[11]='P';x[12]='V';x[13]='P';x[14]='8';x[15]='X';x[24]=0x7f;x[25]=0x02;x[27]=0xdf;x[28]=1;Size(x,640,480);
  auto lossless=x;lossless[15]='L';lossless[20]=0x2f;lossless[21]=0x7f;lossless[22]=0xc2;lossless[23]=0x77;lossless[24]=0;Size(lossless,640,480);
  auto lossy=x;lossy[15]=' ';lossy[23]=0x9d;lossy[24]=1;lossy[25]=0x2a;lossy[26]=0x80;lossy[27]=2;lossy[28]=0xe0;lossy[29]=1;Size(lossy,640,480);
  auto malformed=jpg;malformed[10]=0;malformed[11]=6;assert(!ReadRasterDimensions(malformed));
  auto badpng=Png(1,1);badpng[12]='X';assert(!ReadRasterDimensions(badpng));
  assert(!ReadRasterDimensions(std::vector<uint8_t>{'<','s','v','g','>',' ',' ',' ',' ',' '}));
  assert(!ReaderRasterWithinLimits(Png(0,10),0));assert(ReaderRasterWithinLimits(Png(4096,4096),0));
  assert(!ReaderRasterWithinLimits(Png(4097,4096),0));assert(ReaderRasterWithinLimits(Png(4096,4096),16*1024*1024));
  assert(!ReaderRasterWithinLimits(Png(4096,4096),16*1024*1024+1));assert(!ReaderRasterWithinLimits(Png(1,1),kReaderMaxTotalPixels));
  assert(!ReaderRasterWithinLimits(Png(0xffffffffu,0xffffffffu),0));auto oversized=Png(1,1);oversized.resize(5*1024*1024+1);assert(!ReaderRasterWithinLimits(oversized,0));
  assert(IsReaderRasterContentType(" IMAGE/PNG ; charset=binary"));assert(IsReaderRasterContentType("image/jpeg"));assert(IsReaderRasterContentType("image/webp"));assert(IsReaderRasterContentType("image/gif"));assert(!IsReaderRasterContentType("image/svg+xml"));assert(!IsReaderRasterContentType("image/avif"));assert(!IsReaderRasterContentType(std::string(100,'x')));
  std::mt19937 rng(123);for(int trial=0;trial<3000;trial++){std::vector<uint8_t> b(trial%40);for(auto& c:b)c=static_cast<uint8_t>(rng());(void)ReadRasterDimensions(b);(void)ReaderRasterWithinLimits(b,0);}
  for(const auto& sample:{Png(640,480),gif,jpg,x,lossless,lossy})for(size_t n=0;n<sample.size();n++){std::vector<uint8_t> cut(sample.begin(),sample.begin()+n);(void)ReadRasterDimensions(cut);}
  std::cout<<"PASS: PNG GIF JPEG and WebP preflight, bounds, MIME, malformed and truncated inputs\n";
}
