# Servidor local sin caché para desarrollo: python tools/serve.py [puerto]   (sirve la carpeta del proyecto)
import http.server, os, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')   # el navegador siempre pide la versión actual (modelos, index.html...)
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8000), H).serve_forever()
