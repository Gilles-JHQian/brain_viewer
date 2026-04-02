#!/usr/bin/env bash
#
# start_viewer.sh — Launch the Brain Viewer locally.
#
# Usage:
#   1. Copy the entire 'viewer/' folder and the generated 'brain_viewer_data/'
#      directory to your local machine.
#   2. Run this script from inside the viewer/ directory:
#        cd viewer
#        bash start_viewer.sh
#   3. Open http://localhost:8080 in your browser.
#
# The script will:
#   - Create a symlink 'data' → the brain_viewer_data directory
#   - Start a Python HTTP server on port 8080
#   - Open the browser automatically (macOS/Linux)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${1:-8080}"

# -------------------------------------------------------------------
# Locate the data directory
# -------------------------------------------------------------------

# Remove broken symlinks first
if [ -L "data" ] && [ ! -e "data" ]; then
    echo "[WARN] Removing broken symlink 'data' -> $(readlink data)"
    rm -f data
fi

if [ -d "data" ] && [ -f "data/metadata.json" ]; then
    echo "[OK] 'data/' directory found with metadata.json."
elif [ -d "../brain_viewer_data" ] && [ -f "../brain_viewer_data/metadata.json" ]; then
    echo "[INFO] Found ../brain_viewer_data — creating symlink 'data'"
    rm -f data 2>/dev/null
    ln -s ../brain_viewer_data data
elif [ -d "brain_viewer_data" ] && [ -f "brain_viewer_data/metadata.json" ]; then
    echo "[INFO] Found brain_viewer_data in current dir — creating symlink 'data'"
    rm -f data 2>/dev/null
    ln -s brain_viewer_data data
else
    echo ""
    echo "============================================================"
    echo " ERROR: Cannot find the data directory."
    echo ""
    echo " Please download brain_viewer_data/ from the HPC server:"
    echo ""
    echo "   rsync -avz user@hpc:/path/to/brain_viewer_data/ \\"
    echo "         ./brain_viewer_data/"
    echo ""
    echo " Then place it next to this viewer/ folder:"
    echo ""
    echo "   your_folder/"
    echo "     ├── viewer/               (this folder)"
    echo "     │   ├── index.html"
    echo "     │   └── start_viewer.sh"
    echo "     └── brain_viewer_data/"
    echo "         ├── metadata.json"
    echo "         ├── brain_mesh.json"
    echo "         ├── electrodes.json"
    echo "         ├── roi_atlas.json"
    echo "         ├── sig/"
    echo "         └── diff/"
    echo "============================================================"
    echo ""
    exit 1
fi

# Verify key files
if [ ! -f "data/metadata.json" ]; then
    echo "[WARN] data/metadata.json not found — viewer may not load correctly."
fi
if [ ! -f "data/brain_mesh.json" ]; then
    echo "[WARN] data/brain_mesh.json not found."
fi
if [ ! -f "data/electrodes.json" ]; then
    echo "[WARN] data/electrodes.json not found."
fi

# -------------------------------------------------------------------
# Start HTTP server
# -------------------------------------------------------------------
echo ""
echo "Starting HTTP server on port ${PORT}..."
echo "Open http://localhost:${PORT} in your browser."
echo "Press Ctrl+C to stop."
echo ""

# Try to open browser automatically
if command -v xdg-open &>/dev/null; then
    (sleep 1 && xdg-open "http://localhost:${PORT}") &
elif command -v open &>/dev/null; then
    (sleep 1 && open "http://localhost:${PORT}") &
fi

python3 -m http.server "$PORT" 2>/dev/null || python -m http.server "$PORT"
