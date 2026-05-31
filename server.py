import errno
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SlideshowHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve():
    for port in range(8765, 8786):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), SlideshowHandler)
            break
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    else:
        raise RuntimeError("No open port found between 8765 and 8785")

    print(f"Video Wizard Slideshow Generator: http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    serve()
