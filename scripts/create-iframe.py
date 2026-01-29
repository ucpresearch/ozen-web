#!/usr/bin/env python3
"""
Generate iframe HTML for embedding Ozen viewer with audio in Quarto/Jupyter.

Usage:
    python create-iframe.py audio.wav
    python create-iframe.py audio.wav --overlays pitch,formants,hnr
    python create-iframe.py samples/audio.wav --viewer-url ./ozen-web/viewer.html

The script calculates the correct relative path from the viewer to the audio file.

IMPORTANT: To view the generated HTML, serve it over HTTP:
    python -m http.server 8000
    # Or use: python scripts/serve-quarto.py

Browsers block file:// iframes for security.
"""

import sys
from pathlib import Path
from urllib.parse import quote

def calculate_relative_path(audio_path, viewer_url):
    """
    Calculate the relative path from the viewer's directory to the audio file.

    Args:
        audio_path: Path to audio file (relative to current directory)
        viewer_url: Path to viewer.html (e.g., "./ozen-web/viewer.html")

    Returns:
        Relative path from viewer's directory to audio file
    """
    # Parse paths
    audio_file = Path(audio_path).resolve()
    viewer_file = Path(viewer_url).resolve()
    viewer_dir = viewer_file.parent

    # Calculate relative path from viewer's directory to audio
    try:
        rel_path = audio_file.relative_to(viewer_dir)
        return str(rel_path)
    except ValueError:
        # Not in same tree, need to go up
        # Calculate relative path using standard algorithm
        audio_parts = audio_file.parts
        viewer_parts = viewer_dir.parts

        # Find common ancestor
        common_length = 0
        for a, b in zip(audio_parts, viewer_parts):
            if a == b:
                common_length += 1
            else:
                break

        # Build path: go up from viewer_dir, then down to audio
        ups = len(viewer_parts) - common_length
        downs = audio_parts[common_length:]

        path_parts = ['..'] * ups + list(downs)
        return '/'.join(path_parts)

def create_embedded_viewer(audio_path, overlays="pitch,formants", viewer_url="./ozen-web/viewer.html"):
    """Create iframe HTML with audio path."""
    audio_file = Path(audio_path)

    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Calculate relative path from viewer to audio
    audio_relative = calculate_relative_path(audio_path, viewer_url)

    # URL encode the path
    encoded_path = quote(audio_relative, safe='')

    # Create iframe
    iframe = f'''<iframe
  src="{viewer_url}?audio={encoded_path}&overlays={overlays}"
  width="100%"
  height="600"
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>'''

    return iframe

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create-iframe.py <audio-file> [--overlays pitch,formants] [--viewer-url ./ozen-web/viewer.html]")
        print("\nExample: python create-iframe.py audio.wav --overlays pitch,formants,hnr")
        sys.exit(1)

    audio_path = sys.argv[1]
    overlays = "pitch,formants"
    viewer_url = "./ozen-web/viewer.html"

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
