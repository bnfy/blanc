from pathlib import Path
import json, subprocess
h=Path(__file__).resolve().parent
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
fixtures=preview/'evidence/start-page-sunrise-20261029/disk-fixture1';assert not fixtures.exists();fixtures.mkdir()
for name,text in {'invalid.json':'{bad','array.json':'[]','wrong.json':'{"blanc":{"prototype":{"launch_sunrise":"yes"}}}',
                  'absent.json':'{}','false.json':'{"blanc":{"prototype":{"launch_sunrise":false}}}',
                  'true.json':'{"blanc":{"prototype":{"launch_sunrise":true}}}'}.items(): (fixtures/name).write_text(text)
with (fixtures/'oversized.json').open('wb') as f: f.truncate(16*1024*1024+1)
obj=h/'disk-test.o';exe=h/'disk-test';assert not obj.exists() and not exe.exists()
clang=src/'third_party/llvm-build/Release+Asserts/bin/clang++';sdk=out/'sdk/xcode_links/MacOSX27.0.sdk'
flags=[str(clang),'-std=c++23','--target=arm64-apple-macos','-mmacos-version-min=13.0','-isysroot',str(sdk),'-nostdinc++',
       '-isystem',str(src/'third_party/libc++/src/include'),'-isystem',str(src/'third_party/libc++abi/src/include'),
       '-I',str(h/'overlay'),'-I',str(src),'-I',str(src/'base/allocator/partition_allocator/src'),
       '-I',str(out/'gen/base/allocator/partition_allocator/src'),'-I',str(src/'buildtools/third_party/libc++'),'-I',str(out/'gen'),
       '-I',str(src/'third_party/icu/source/common'),'-I',str(src/'third_party/icu/source/i18n'),
       '-I',str(src/'third_party/perfetto/include'),'-I',str(out/'gen/third_party/perfetto'),
       '-I',str(out/'gen/third_party/perfetto/build_config'),'-I',str(src/'third_party/abseil-cpp'),
       '-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE','-D_LIBCPP_DISABLE_VISIBILITY_ANNOTATIONS',
       '-D_LIBCXXABI_DISABLE_VISIBILITY_ANNOTATIONS','-DDCHECK_ALWAYS_ON=1','-DNDEBUG','-fno-exceptions','-fno-rtti','-c',str(h/'disk-test.cc'),'-o',str(obj)]
def run(name,args):
    r=subprocess.run(args,cwd=out,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (h/(name+'.log')).write_text(r.stdout);print(name,'exit',r.returncode);print(r.stdout[-3000:]);
    if r.returncode:raise SystemExit(r.returncode)
run('disk-compile',flags)
ref=preview/'repo/experiments/chromium-extension-spike/evidence/favorite-account-storage-20261028/standalone-link15-command.json'
link=json.loads(ref.read_text())['argv'];link[7:8]=[str(obj)];link[-1]=str(exe)
(h/'disk-commands.json').write_text(json.dumps({'cwd':str(out),'compile':flags,'link':link,'run':[str(exe),str(fixtures)]},indent=2)+'\n')
run('disk-link',link);run('disk-run',[str(exe),str(fixtures)])
