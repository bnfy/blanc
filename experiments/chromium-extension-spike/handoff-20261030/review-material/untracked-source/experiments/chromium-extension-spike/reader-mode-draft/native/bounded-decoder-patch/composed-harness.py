#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,subprocess
p=Path(__file__).resolve().parent;native=p.parent
out=[p/'composed-harness.cc',p/'composed-harness',p/'composed-harness.log',p/'composed-harness-result.json']
if any(x.exists() for x in out):raise SystemExit('existing outputs preserved')
g=(p/'guard-harness.cc').read_text();pre=g.split('SkBitmap WebImage::FromDataBounded',1)[0];pre=pre.replace('struct WebData {};','struct WebData { WebData()=default; explicit WebData(int){} };');pre='#include "reader_image_budget.h"\n'+pre
blink='SkBitmap WebImage::FromDataBounded'+g.split('SkBitmap WebImage::FromDataBounded',1)[1].split('SkBitmap WebImage::DecodeSVG',1)[0] if 'SkBitmap WebImage::DecodeSVG' in g else 'SkBitmap WebImage::FromDataBounded'+g.split('SkBitmap WebImage::FromDataBounded',1)[1].split('} // namespace blink',1)[0]
s=(p/'candidate/services/data_decoder/image_decoder_impl.cc').read_text();service='void ImageDecoderImpl::DecodeImageBounded('+s.split('void ImageDecoderImpl::DecodeImageBounded(',1)[1].split('void ImageDecoderImpl::DecodeAnimation(',1)[0]
middle=r'''
} // namespace blink
namespace mojo_base { struct BigBuffer { const std::vector<uint8_t>& bytes; size_t size()const{return bytes.size();} }; }
namespace base { int as_byte_span(const mojo_base::BigBuffer&){return 1;} }
struct Callback { SkBitmap* result; void Run(SkBitmap value){*result=value;} };
namespace data_decoder { using DecodeImageBoundedCallback=Callback; struct ImageDecoderImpl { void DecodeImageBounded(mojo_base::BigBuffer,uint32_t,DecodeImageBoundedCallback); };
'''
post=r'''
} // namespace data_decoder
std::vector<uint8_t> Png(uint32_t w,uint32_t h){std::vector<uint8_t>b={137,80,78,71,13,10,26,10,0,0,0,13,'I','H','D','R',0,0,0,0,0,0,0,0};for(int i=0;i<4;i++){b[16+i]=static_cast<uint8_t>(w>>(24-i*8));b[20+i]=static_cast<uint8_t>(h>>(24-i*8));}return b;}
int main(){using blanc::reader::ReaderImageBudget;ReaderImageBudget::Time now{};ReaderImageBudget budget(3);data_decoder::ImageDecoderImpl service;SkBitmap result{};
 auto a=budget.Begin(0,now);auto input=budget.BeginDecode(a.token,now,Png(10,10));assert(input&&input->max_pixels==100);
 state={};state.original={11,10};service.DecodeImageBounded({*input->bytes},input->max_pixels,{&result});assert(result.drawsNothing()&&state.decodes==0);budget.Reject(a.token);assert(budget.reserved_pixels()==0);
 auto b=budget.Begin(1,now);input=budget.BeginDecode(b.token,now,Png(10,10));assert(input&&input->max_pixels==100);state={};service.DecodeImageBounded({*input->bytes},input->max_pixels,{&result});assert(!result.drawsNothing()&&state.decodes==1);assert(budget.Commit(b.token,now,result.width(),result.height(),100));assert(budget.pixels()==100);
 auto c=budget.Begin(2,now);input=budget.BeginDecode(c.token,now,Png(10,10));assert(input&&input->max_pixels==100);assert(!budget.Commit(c.token,now,11,10,100));assert(budget.pixels()==100&&budget.reserved_pixels()==0);
}
'''
out[0].write_text(pre+blink+middle+service+post)
compiler='<local-home>/Projects/BlancChromium158/src/third_party/llvm-build/Release+Asserts/bin/clang++';sdk='/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX27.2.sdk'
cmd=[compiler,'-std=c++20','-isysroot',sdk,'-stdlib=libc++','-Wall','-Wextra','-Werror','-I',str(native),str(out[0]),str(native/'reader_image_budget.cc'),str(native/'reader_raster.cc'),'-o',str(out[1])]
b=subprocess.run(cmd,capture_output=True,text=True);r=subprocess.run([str(out[1])],capture_output=True,text=True) if b.returncode==0 else None
out[2].write_text(b.stdout+b.stderr+(r.stdout+r.stderr if r else ''));sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest();result={'compileExit':b.returncode,'runExit':r.returncode if r else None,'candidatePatchSha256':sha(p/'candidate.patch'),'budgetSourceSha256':sha(native/'reader_image_budget.cc'),'budgetHeaderSha256':sha(native/'reader_image_budget.h'),'testSourceSha256':sha(out[0]),'scope':'real draft budget and exact proposed methods, fake Chromium decoder and service interfaces; no actual decoding, Mojo, browser or transport'};out[3].write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if r and r.returncode==0 else 1)
