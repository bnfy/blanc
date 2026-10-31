#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,subprocess
p=Path(__file__).resolve().parent
outputs=[p/'service-harness.cc',p/'service-harness',p/'service-harness.log',p/'service-harness-result.json']
if any(x.exists() for x in outputs):raise SystemExit('existing results preserved')
s=(p/'candidate/services/data_decoder/image_decoder_impl.cc').read_text()
method='void ImageDecoderImpl::DecodeImageBounded('+s.split('void ImageDecoderImpl::DecodeImageBounded(',1)[1].split('void ImageDecoderImpl::DecodeAnimation(',1)[0]
pre=r'''
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <utility>
struct SkBitmap { int marker=0; };
namespace mojo_base { struct BigBuffer { size_t n; size_t size()const{return n;} }; }
namespace base { int as_byte_span(const mojo_base::BigBuffer&){return 1;} }
int decodes=0;
namespace blink { struct WebData { explicit WebData(int){} }; struct WebImage { static SkBitmap FromDataBounded(WebData,uint32_t){++decodes;return {1};} }; }
struct Callback { SkBitmap* result; void Run(SkBitmap value){*result=value;} };
namespace data_decoder { using DecodeImageBoundedCallback=Callback; struct ImageDecoderImpl { void DecodeImageBounded(mojo_base::BigBuffer,uint32_t,DecodeImageBoundedCallback); };
'''
post=r'''
}
int main(){ data_decoder::ImageDecoderImpl d; SkBitmap result{};
 auto call=[&](size_t bytes,uint32_t pixels){decodes=0;result.marker=-1;d.DecodeImageBounded({bytes},pixels,{&result});};
 call(0,1);assert(result.marker==0&&!decodes);
 call(5*1024*1024+1,1);assert(result.marker==0&&!decodes);
 call(1,0);assert(result.marker==0&&!decodes);
 call(1,16*1024*1024+1);assert(result.marker==0&&!decodes);
 call(5*1024*1024,16*1024*1024);assert(result.marker==1&&decodes==1);
 call(1,1);assert(result.marker==1&&decodes==1);
}
'''
outputs[0].write_text(pre+method+post)
compiler='<local-home>/Projects/BlancChromium158/src/third_party/llvm-build/Release+Asserts/bin/clang++';sdk='/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX27.2.sdk'
cmd=[compiler,'-std=c++20','-isysroot',sdk,'-stdlib=libc++','-Wall','-Wextra','-Werror',str(outputs[0]),'-o',str(outputs[1])]
b=subprocess.run(cmd,capture_output=True,text=True);r=subprocess.run([str(outputs[1])],capture_output=True,text=True) if b.returncode==0 else None
outputs[2].write_text(b.stdout+b.stderr+(r.stdout+r.stderr if r else ''));sha=lambda b:hashlib.sha256(b).hexdigest()
result={'compileExit':b.returncode,'runExit':r.returncode if r else None,'methodSha256':sha(method.encode()),'candidatePatchSha256':sha((p/'candidate.patch').read_bytes()),'testSourceSha256':sha(outputs[0].read_bytes()),'scope':'exact candidate service method against fake BigBuffer, callback and decoder; no actual Mojo, Blink or browser'}
outputs[3].write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if r and r.returncode==0 else 1)
