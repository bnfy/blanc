"""Loopback-only real HTTP/3 WebTransport fixture; requires aioquic==1.2.0."""
import asyncio
import json
import sys
from aioquic.asyncio import QuicConnectionProtocol, serve
from aioquic.h3.connection import H3_ALPN, H3Connection
from aioquic.h3.events import HeadersReceived, DatagramReceived
from aioquic.quic.configuration import QuicConfiguration
from aioquic.quic.events import ProtocolNegotiated

class Protocol(QuicConnectionProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.http = None
        self.accepted = set()

    def quic_event_received(self, event):
        if isinstance(event, ProtocolNegotiated):
            self.http = H3Connection(self._quic, enable_webtransport=True)
            print(json.dumps({'event': 'alpn', 'value': event.alpn_protocol}), flush=True)
        if self.http:
            for item in self.http.handle_event(event):
                if isinstance(item, HeadersReceived):
                    headers = dict(item.headers)
                    valid = (headers.get(b':method') == b'CONNECT' and
                             headers.get(b':protocol') == b'webtransport' and
                             headers.get(b':path') == b'/transport' and
                             headers.get(b':authority', b'').split(b':')[0] in
                             (b'page.blanc-fixture.test', b'000491b06a.com'))
                    print(json.dumps({'event': 'connect', 'headers': {
                        k.decode(): v.decode() for k, v in item.headers}, 'accepted': valid}), flush=True)
                    self.http.send_headers(item.stream_id, [
                        (b':status', b'200' if valid else b'404'),
                        (b'sec-webtransport-http3-draft', b'draft02')], end_stream=not valid)
                    if valid:
                        self.accepted.add(item.stream_id)
                elif isinstance(item, DatagramReceived) and item.stream_id in self.accepted:
                    if item.data == b'blanc-http3-proof':
                        self.http.send_datagram(item.stream_id, item.data)
                        print(json.dumps({'event': 'echo', 'value': item.data.decode()}), flush=True)
            self.transmit()

async def main():
    config = QuicConfiguration(is_client=False, alpn_protocols=H3_ALPN, max_datagram_frame_size=65536)
    config.load_cert_chain(sys.argv[1], sys.argv[2])
    server = await serve('127.0.0.1', int(sys.argv[3]), configuration=config, create_protocol=Protocol)
    print(json.dumps({'event': 'ready'}), flush=True)
    try:
        await asyncio.Future()
    finally:
        server.close()

asyncio.run(main())
