#!/usr/bin/env python3
"""
Generate iframe HTML for embedding Ozen viewer with audio in Quarto/Jupyter.

Usage:
    python create-iframe.py audio.wav
    python create-iframe.py audio.wav --overlays pitch,formants,hnr
    python create-iframe.py samples/audio.wav --viewer-url ./ozen-web/viewer.html
    python create-iframe.py audio.wav --overlays pitch,formants --height 800
    python create-iframe.py audio.wav --overlays pitch,formants --height 80%

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

def create_embedded_viewer(audio_path, overlays="pitch,formants", viewer_url="./ozen-web/viewer.html", height=600):
    """
    Create iframe HTML with audio path.

    Args:
        audio_path: Path to audio file
        overlays: Comma-separated list of overlays (default: "pitch,formants")
        viewer_url: Path to viewer.html (default: "./ozen-web/viewer.html")
        height: Iframe height - int (pixels) or str (e.g., "80%") (default: 600)

    Returns:
        HTML string for iframe
    """
    audio_file = Path(audio_path)

    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Calculate relative path from viewer to audio
    audio_relative = calculate_relative_path(audio_path, viewer_url)

    # URL encode the path (keep slashes for readability)
    encoded_path = quote(audio_relative, safe='/')

    # Format height - convert int to string, keep strings as-is
    height_str = str(height)

    # Create iframe with data-external="1" to prevent Quarto from embedding it as data URL
    iframe = f'''<iframe
  data-external="1"
  src="{viewer_url}?audio={encoded_path}&overlays={overlays}"
  width="100%"
  height="{height_str}"
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>'''

    return iframe

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create-iframe.py <audio-file> [--overlays pitch,formants] [--viewer-url ./ozen-web/viewer.html] [--height 600]")
        print("\nExamples:")
        print("  python create-iframe.py audio.wav --overlays pitch,formants,hnr --height 800")
        print("  python create-iframe.py audio.wav --overlays pitch,formants --height 80%")
        sys.exit(1)

    audio_path = sys.argv[1]
    overlays = "pitch,formants"
    viewer_url = "./ozen-web/viewer.html"
    height = 600

    # Parse optional arguments
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--overlays" and i + 1 < len(sys.argv):
            overlays = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--viewer-url" and i + 1 < len(sys.argv):
            viewer_url = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--height" and i + 1 < len(sys.argv):
            # Height can be numeric (pixels) or string (percentage)
            height_arg = sys.argv[i + 1]
            # Try to convert to int if numeric, otherwise keep as string
            try:
                height = int(height_arg)
            except ValueError:
                height = height_arg
            i += 2
        else:
            print(f"Unknown argument: {sys.argv[i]}", file=sys.stderr)
            sys.exit(1)

    try:
        html = create_embedded_viewer(audio_path, overlays, viewer_url, height)
        print(html)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
