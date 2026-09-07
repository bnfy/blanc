#!/usr/bin/env python3
"""Test the native output monitor against an isolated PipeWire Pulse server.
Only generated audio enters this server. Captured PCM is inspected in memory.
No access to the desktop user's microphone or active audio session is needed.
"""
import array
import json
import math
import os
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tempfile
import time

helper = str(Path(sys.argv[1]).resolve())
pulse_binary = sys.argv[2] if len(sys.argv) > 2 else None
children = []
with tempfile.TemporaryDirectory(prefix='blanc-audio-test-') as root:
    env = dict(os.environ, XDG_RUNTIME_DIR=root, PIPEWIRE_RUNTIME_DIR=root,
               PULSE_SERVER='unix:' + root + '/pulse/native')
    def start(args, **kwargs):
        process = subprocess.Popen(args, env=env, stderr=subprocess.PIPE,
                                   stdout=subprocess.DEVNULL, **kwargs)
        children.append(process)
        return process
    def pactl(*args):
        return subprocess.check_output(['pactl', *args], env=env, text=True, stderr=subprocess.PIPE).strip()
    try:
        if pulse_binary:
            libraries = list((Path(pulse_binary).parent.parent / 'lib').glob('*/pulseaudio'))
            library = libraries[0]
            modules = list((Path(pulse_binary).parent.parent / 'lib').glob('pulse-*/modules'))[0]
            env['LD_LIBRARY_PATH'] = str(library) + ':' + str(library.parent) + ':' + str(modules)
            env['PULSE_RUNTIME_PATH'] = root + '/pulse'
            Path(env['PULSE_RUNTIME_PATH']).mkdir()
            start([pulse_binary, '-n', '--daemonize=no', '--exit-idle-time=-1', '--use-pid-file=no',
                   '--load=module-native-protocol-unix socket=' + root + '/pulse/native',
                   '--dl-search-path=' + str(modules)])
        else:
            start(['pipewire'])
            start(['pipewire-pulse'])
            start(['wireplumber'])
        deadline = time.monotonic() + 10
        while True:
            try:
                server = pactl('info')
                break
            except subprocess.CalledProcessError:
                if time.monotonic() > deadline:
                    raise RuntimeError('Isolated Pulse server did not start: ' + '; '.join(process.stderr.read(2048).decode() for process in children if process.poll() is not None))
                time.sleep(0.1)
        pactl('load-module', 'module-null-sink', 'sink_name=blanc_output', 'rate=48000', 'channels=2')
        pactl('load-module', 'module-null-sink', 'sink_name=blanc_fake_mic', 'rate=48000', 'channels=2')
        pactl('set-default-sink', 'blanc_output')
        pactl('set-default-source', 'blanc_fake_mic.monitor')
        # Distinct tones identify output vs default recording source. No real
        # microphone is connected to this isolated graph.
        players = []
        for sink, hz in [('blanc_output', 440), ('blanc_fake_mic', 997)]:
            data = array.array('f', [0.3 * math.sin(2 * math.pi * hz * i / 48000)
                                    for i in range(48000 * 5) for _ in range(2)])
            if sys.byteorder != 'little':
                data.byteswap()
            tone = Path(root) / (sink + '.f32')
            tone.write_bytes(data.tobytes())  # generated fixture, never recorded audio
            with tone.open('rb') as source:
                players.append(start(['pacat', '--playback', '--format=float32le', '--rate=48000',
                                      '--channels=2', '--device=' + sink], stdin=source))
        capture = subprocess.Popen([helper], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        children.append(capture)
        pcm = bytearray()
        deadline = time.monotonic() + 8
        while len(pcm) < 48000 * 8 * 2 and time.monotonic() < deadline:
            readable, _, _ = select.select([capture.stdout], [], [], 0.25)
            if readable:
                chunk = os.read(capture.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError('Monitor exited: ' + capture.stderr.read().decode())
                pcm.extend(chunk)
        if len(pcm) < 48000 * 8:
            raise RuntimeError('Monitor produced too few audio samples')
        samples = array.array('f')
        samples.frombytes(pcm[:len(pcm) - len(pcm) % 8])
        if sys.byteorder != 'little':
            samples.byteswap()
        left = samples[::2]
        def amplitude(hz):
            n = len(left)
            real = sum(x * math.cos(2 * math.pi * hz * i / 48000) for i, x in enumerate(left))
            imag = sum(x * math.sin(2 * math.pi * hz * i / 48000) for i, x in enumerate(left))
            return 2 * math.hypot(real, imag) / n
        output = amplitude(440)
        microphone = amplitude(997)
        if output < 0.05 or microphone > output * 0.05:
            raise RuntimeError(f'Wrong source or silence: output={output:.5f}, fake mic={microphone:.5f}')
        pactl('set-default-sink', 'blanc_fake_mic')
        # Drain so a full stdout pipe cannot delay the source-change callback.
        deadline = time.monotonic() + 3
        while capture.poll() is None and time.monotonic() < deadline:
            readable, _, _ = select.select([capture.stdout], [], [], 0.05)
            if readable:
                os.read(capture.stdout.fileno(), 65536)
        if capture.poll() != 1:
            raise RuntimeError('Monitor did not stop after the output changed')
        print(json.dumps({'backend': next(line for line in server.splitlines() if line.startswith('Server Name:')),
                          'architecture': os.uname().machine, 'sampleRate': 48000, 'channels': 2,
                          'outputToneAmplitude': round(output, 5), 'otherSourceAmplitude': round(microphone, 5),
                          'stoppedOnOutputChange': True, 'desktopCaptureTested': False}))
    finally:
        for process in reversed(children):
            if process.poll() is None:
                process.terminate()
        for process in children:
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
