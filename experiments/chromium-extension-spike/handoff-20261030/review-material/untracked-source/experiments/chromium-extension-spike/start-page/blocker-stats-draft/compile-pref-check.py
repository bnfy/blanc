from pathlib import Path
import hashlib, json, subprocess

home = Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
here = Path(__file__).resolve().parent
evidence = home / 'evidence/blocker-weekly-pref-20261028'
evidence.mkdir(parents=True, exist_ok=True)
src = Path('<local-home>/Projects/BlancChromium158/src')
out = src / 'out/BlancPrototype'
reference = home / 'repo/experiments/chromium-extension-spike/evidence/favorite-account-storage-20261028'
clang = src / 'third_party/llvm-build/Release+Asserts/bin/clang++'
sdk = out / 'sdk/xcode_links/MacOSX27.0.sdk'
flags = [str(clang), '-std=c++23', '--target=arm64-apple-macos', '-mmacos-version-min=13.0',
         '-isysroot', str(sdk), '-nostdinc++', '-isystem', str(src/'third_party/libc++/src/include'),
         '-isystem', str(src/'third_party/libc++abi/src/include'), '-I', str(src),
         '-I', str(src/'base/allocator/partition_allocator/src'), '-I', str(out/'gen/base/allocator/partition_allocator/src'),
         '-I', str(src/'buildtools/third_party/libc++'), '-I', str(out/'gen'),
         '-I', str(src/'third_party/icu/source/common'), '-I', str(src/'third_party/icu/source/i18n'),
         '-I', str(src/'third_party/perfetto/include'), '-I', str(out/'gen/third_party/perfetto'),
         '-I', str(out/'gen/third_party/perfetto/build_config'),
         '-I', str(src/'third_party/abseil-cpp'), '-I', str(here),
         '-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE',
         '-D_LIBCPP_DISABLE_VISIBILITY_ANNOTATIONS', '-D_LIBCXXABI_DISABLE_VISIBILITY_ANNOTATIONS',
         '-DDCHECK_ALWAYS_ON=1', '-DNDEBUG', '-fno-exceptions', '-fno-rtti', '-c']
for name in ['weekly_pref_store.cc', 'weekly_pref_check.cc', 'browser_weekly_stats.cc']:
    obj = evidence / (name + '.o')
    command = flags + [str(here/name), '-o', str(obj)]
    result = subprocess.run(command, cwd=out, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (evidence/(name+'.compile.log')).write_text(result.stdout)
    if result.returncode:
        print(name, 'compile failed', result.returncode, result.stdout[-6000:]); raise SystemExit(result.returncode)
command = json.loads((reference/'standalone-link15-command.json').read_text())['argv']
command[7:8] = [str(evidence/'weekly_pref_store.cc.o'), str(evidence/'weekly_pref_check.cc.o')]
command[-1] = str(evidence/'weekly-pref-check')
(evidence/'link-command.json').write_text(json.dumps({'cwd':str(out),'argv':command},indent=2)+'\n')
result = subprocess.run(command, cwd=out, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
(evidence/'link.log').write_text(result.stdout)
if result.returncode:
    print('link failed', result.returncode, result.stdout[-6000:]); raise SystemExit(result.returncode)
paths = [here/'browser_weekly_stats.h', here/'browser_weekly_stats.cc', here/'weekly_pref_store.cc', here/'weekly_pref_check.cc', evidence/'weekly-pref-check']
(evidence/'hashes.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},indent=2)+'\n')
print('standalone reducer compiled and linked; run separately')
