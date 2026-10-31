#!/usr/bin/env python3
"""Round-trip the generated literals for every byte value, then compile them."""
import codecs, os, re, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
with tempfile.TemporaryDirectory() as tmp:
    blobs = {'a.bin': bytes(range(256)) * 3, 'pages/b.js': b'x??=y "q" \\n 7\x00' + b'1' * 40000, 'c.css': b''}
    for name, data in blobs.items():
        os.makedirs(os.path.dirname(os.path.join(tmp, 'root', name)), exist_ok=True)
        open(os.path.join(tmp, 'root', name), 'wb').write(data)
    open(os.path.join(tmp, 'served.txt'), 'w').write('\n'.join(blobs) + '\n')
    out = os.path.join(tmp, 'out.cc')
    subprocess.run([sys.executable, os.path.join(here, 'embed.py'), '--served', os.path.join(tmp, 'served.txt'),
                    '--root', os.path.join(tmp, 'root'), '--output', out], check=True)
    text = open(out).read()
    for index, (name, data) in enumerate(blobs.items()):
        body = re.search(r'constexpr char kData%d\[\] =\n(.*?);\nconstexpr size_t kSize%d = (\d+);' % (index, index), text, re.S)
        decoded = codecs.escape_decode(''.join(re.findall(r'"((?:[^"\\]|\\.)*)"', body.group(1))).encode('latin-1'))[0]
        assert decoded == data and int(body.group(2)) == len(data), name
    # The literals must also mean the same bytes to a C++ compiler.
    harness = os.path.join(tmp, 'h.cc')
    data_only = text.split('struct Asset')[0].replace('#include "blanc/island_resources/island_resources.h"', '')
    open(harness, 'w').write('#include <cstdio>\n#include <cstddef>\n' + data_only.replace('namespace {', '') +
        '}\nint main(){' + ''.join('fwrite(blanc::island_resources::kData%d,1,blanc::island_resources::kSize%d,stdout);' % (i, i) for i in range(len(blobs))) + '}\n')
    exe = os.path.join(tmp, 'h')
    subprocess.run(['c++', '-std=c++20', '-Wall', '-Werror', '-Wno-trigraphs', harness, '-o', exe], check=True)
    assert subprocess.run([exe], capture_output=True, check=True).stdout == b''.join(blobs.values())
print('embed round-trip: passed')
