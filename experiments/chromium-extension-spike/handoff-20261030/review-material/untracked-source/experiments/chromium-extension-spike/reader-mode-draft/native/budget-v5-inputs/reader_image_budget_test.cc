#include "reader_image_budget.h"
#include "reader_raster.h"
#include <cassert>
#include <chrono>
#include <iostream>
#include <vector>
using blanc::reader::ReaderImageBudget;
using K=ReaderImageBudget::AdmissionKind;
std::vector<uint8_t> Image(uint32_t w,uint32_t h){std::vector<uint8_t>b={137,80,78,71,13,10,26,10,0,0,0,13,'I','H','D','R',0,0,0,0,0,0,0,0};for(int i=0;i<4;i++){b[16+i]=static_cast<uint8_t>(w>>(24-i*8));b[20+i]=static_cast<uint8_t>(h>>(24-i*8));}return b;}
bool Commit(ReaderImageBudget& b,uint64_t token,ReaderImageBudget::Time now,const std::vector<uint8_t>& raw,uint32_t w,uint32_t h,size_t size){if(!b.BeginDecode(token,now,raw))return false;return b.Commit(token,now,w,h,size);}
int main(){using namespace std::chrono_literals;const ReaderImageBudget::Time now{};const auto small=Image(10,10),large=Image(4096,4096);
 {ReaderImageBudget b(2);assert(b.Begin(2,now).kind==K::kDenied);auto a=b.Begin(0,now);assert(a.kind==K::kStart);assert(b.Begin(0,now).kind==K::kDenied);assert(Commit(b,a.token,now+1s,small,10,10,100));assert(b.Begin(0,now).kind==K::kCached);assert(b.bytes()==100&&b.pixels()==100);assert(!Commit(b,a.token,now,small,10,10,100));}
 {ReaderImageBudget b(10);auto a=b.Begin(0,now),c=b.Begin(1,now),d=b.Begin(2,now);assert(b.active()==3);assert(b.Begin(3,now).kind==K::kDenied);b.Reject(c.token);assert(b.Begin(3,now).kind==K::kStart);assert(!Commit(b,a.token,now+8s,small,10,10,100));assert(b.active()==2);(void)d;}
 {ReaderImageBudget b(1);for(int i=0;i<30;i++){auto a=b.Begin(0,now);assert(a.kind==K::kStart);b.Reject(a.token);}assert(b.attempts()==30);assert(b.Begin(0,now).kind==K::kDenied);}
 {ReaderImageBudget b(5);for(int i=0;i<4;i++){auto a=b.Begin(i,now);assert(Commit(b,a.token,now+1s,small,10,10,5*1024*1024));}assert(b.bytes()==20*1024*1024);assert(b.Begin(4,now).kind==K::kDenied);assert(b.Begin(0,now).kind==K::kCached);}
 {ReaderImageBudget b(3);for(int i=0;i<2;i++){auto a=b.Begin(i,now);assert(Commit(b,a.token,now+1s,large,4096,4096,10));}auto a=b.Begin(2,now);assert(!Commit(b,a.token,now+1s,small,10,10,10));assert(b.pixels()==blanc::reader::kReaderMaxTotalPixels);}
 {ReaderImageBudget b(2);auto a=b.Begin(0,now);assert(Commit(b,a.token,now+1s,small,4096,4096,10));assert(b.pixels()==16*1024*1024);auto c=b.Begin(1,now);assert(!Commit(b,c.token,now+1s,small,4097,4096,10));}
 {ReaderImageBudget b(2);auto a=b.Begin(0,now),c=b.Begin(1,now);auto cancelled=b.Close();assert(cancelled.size()==2&&cancelled[0]==a.token&&cancelled[1]==c.token);assert(!Commit(b,a.token,now,small,10,10,1));assert(b.Begin(0,now).kind==K::kDenied);assert(b.Close().empty());}
 {ReaderImageBudget b(1);auto a=b.Begin(0,now);assert(!Commit(b,a.token,now,small,0,10,1));auto c=b.Begin(0,now);assert(!Commit(b,c.token,now,small,10,10,0));auto d=b.Begin(0,now);assert(!Commit(b,d.token,now,std::vector<uint8_t>{},10,10,10));}
 {ReaderImageBudget b(101);assert(b.Begin(0,now).kind==K::kDenied);}
 {ReaderImageBudget b(1);auto a=b.Begin(0,now);assert(!b.Commit(a.token,now,10,10,1));auto c=b.Begin(0,now);auto mutable_copy=small;auto bytes=b.BeginDecode(c.token,now,mutable_copy);assert(bytes&&*bytes==small);mutable_copy[0]=0;assert(*bytes==small);assert(!b.BeginDecode(c.token,now,small));assert(b.Commit(c.token,now+1s,10,10,1));}
 {ReaderImageBudget b(1);auto a=b.Begin(0,now);auto source=small;auto address=reinterpret_cast<uintptr_t>(source.data());auto bytes=b.BeginDecode(a.token,now,std::move(source));assert(bytes&&reinterpret_cast<uintptr_t>(bytes->data())!=address&&*bytes==small);assert(b.Commit(a.token,now,10,10,100));b.ForgetCached(0);assert(b.bytes()==100&&b.pixels()==100);assert(b.Begin(0,now).kind==K::kStart);}
 {ReaderImageBudget b(3);auto a=b.Begin(0,now),c=b.Begin(1,now),d=b.Begin(2,now);assert(b.BeginDecode(a.token,now,large));assert(b.BeginDecode(c.token,now,large));assert(b.reserved_pixels()==blanc::reader::kReaderMaxTotalPixels);assert(!b.BeginDecode(d.token,now,small));assert(b.Commit(a.token,now,4096,4096,1));assert(b.Commit(c.token,now,4096,4096,1));assert(b.reserved_pixels()==0);}
 {ReaderImageBudget b(4);auto a=b.Begin(0,now),c=b.Begin(1,now);assert(b.BeginDecode(a.token,now,large));assert(b.BeginDecode(c.token,now,large));b.Reject(a.token);assert(b.reserved_pixels()==16*1024*1024);auto d=b.Begin(2,now),e=b.Begin(3,now);assert(b.BeginDecode(d.token,now,small));assert(b.BeginDecode(e.token,now,small));assert(!b.Commit(d.token,now,4096,4096,10));assert(b.reserved_pixels()==16*1024*1024+100);assert(b.Close().size()==2);assert(b.reserved_pixels()==0);}
 {ReaderImageBudget b(1);auto a=b.Begin(0,now);assert(b.BeginDecode(a.token,now,small));assert(b.reserved_pixels()==100);assert(!b.Commit(a.token,now+8s,10,10,1));assert(b.reserved_pixels()==0);}
 {ReaderImageBudget b(1);auto a=b.Begin(0,now);auto bytes=b.BeginDecode(a.token,now+7s,small);assert(bytes);assert(!b.Commit(a.token,now+8s,10,10,1));}
 std::cout<<"PASS: per-reader image concurrency, attempts, limits, timeout, cache and close accounting\n";
}
