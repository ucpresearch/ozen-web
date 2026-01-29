#!/usr/bin/env python3
"""
Generate self-contained iframe HTML with embedded audio for Jupyter/Quarto.

Usage:
    python create-data-url.py audio.wav
    python create-data-url.py audio.wav --overlays pitch,formants,hnr
    python create-data-url.py audio.wav --overlays all --viewer-url https://mysite.com/viewer.html

IMPORTANT: To view the generated HTML locally, you must serve it over HTTP:
    python -m http.server 8000
    # Or use: python scripts/serve-quarto.py

Browsers block file:// iframes for security, so double-clicking the HTML won't work.
"""

import base64
import sys
from urllib.parse import quote
from pathlib import Path

def create_embedded_viewer(audio_path, overlays="pitch,formants", viewer_url="./ozen-web/viewer.html"):
    """Create self-contained iframe HTML with embedded audio."""
    audio_file = Path(audio_path)

    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Check file size
    size_mb = audio_file.stat().st_size / (1024 * 1024)
    if size_mb > 1.5:
        print(f"Warning: File is {size_mb:.1f}MB. Data URLs are limited to ~1.5MB.", file=sys.stderr)
        print("Consider using a remote URL instead.", file=sys.stderr)

    # Read and encode
    with open(audio_file, 'rb') as f:
        audio_data = f.read()

    b64 = base64.b64encode(audio_data).decode('ascii')
    data_url = f"data:audio/wav;base64,{b64}"

    # URL encode
    encoded = quote(data_url, safe='')

    # Create iframe
    iframe = f'''<iframe
  src="{viewer_url}?audio={encoded}&overlays={overlays}"
  width="100%"
  height="600"
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>'''

    return iframe

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create-data-url.py <audio-file> [--overlays pitch,formants] [--viewer-url ./ozen-web/viewer.html]")
        sys.exit(1)

    audio_path = sys.argv[1]
    overlays = "pitch,formants"
    viewer_url = "viewer.html"

    # Parse optional arguments
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--overlays" and i + 1 < len(sys.argv):
            overlays = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--viewer-url" and i + 1 < len(sys.argv):
            viewer_url = sys.argv[i + 1]
            i += 2
        else:
            print(f"Unknown argument: {sys.argv[i]}", file=sys.stderr)
            sys.exit(1)

    try:
        html = create_embedded_viewer(audio_path, overlays, viewer_url)
        print(html)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
