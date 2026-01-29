#!/usr/bin/env python3
"""
Simple HTTP server for viewing Quarto documents with embedded Ozen viewer.

Browsers block file:// iframes for security, so Quarto documents with
embedded viewer iframes must be served over HTTP.

Usage:
    python serve-quarto.py [directory] [port]

Default: Serves current directory on port 8000
"""

import sys
import http.server
import socketserver
from pathlib import Path

def serve(directory='.', port=8000):
    """Start a simple HTTP server."""
    path = Path(directory).resolve()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(path), **kwargs)

    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"Serving {path} at http://localhost:{port}")
        print(f"Open your Quarto document at: http://localhost:{port}/your-document.html")
        print("Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    directory = sys.argv[1] if len(sys.argv) > 1 else '.'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
    serve(directory, port)
