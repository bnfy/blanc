from http.server import HTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import os
root=Path('/private/tmp/blanc-l8-acceptance');(root/'server.pid').write_text(str(os.getpid()))
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  content=('<!doctype html><title>L8 second-Mac '+self.path+'</title><h1>Signed Preview L8 acceptance</h1><input id="text" aria-label="L8 test text"><a href="/b">Second page</a>').encode()
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
HTTPServer(('127.0.0.1',9944),Handler).serve_forever()
