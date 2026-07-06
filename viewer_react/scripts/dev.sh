#!/usr/bin/env bash
# One-step launcher for the brain_viewer React app on the HPC.
#
#   bash scripts/dev.sh
#
# Sets up Node, installs deps if needed, regenerates the viewer data assets if
# missing, starts the Vite dev server, and prints the SSH tunnel command to run
# from your laptop.
#
# Env overrides:
#   PORT=5173                      dev server port
#   BRAIN_VIEWER_DATA=/path        location of the generated brain_viewer_data tree
#   NODE_BIN=/path/to/node/bin     Node install (if the default below is wrong)
set -euo pipefail

# --- paths (script lives in viewer_react/scripts/) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="$(dirname "$SCRIPT_DIR")"                 # .../viewer_react
REPO_DIR="$(dirname "$VIEWER_DIR")"                   # .../brain_viewer
LEX_DIR="$(dirname "$REPO_DIR")"                      # .../lexical_access
DATA_DIR="${BRAIN_VIEWER_DATA:-$LEX_DIR/brain_viewer_data}"
PORT="${PORT:-5173}"

# --- put Node on PATH (HPC module install -> module system -> system node) ---
NODE_BIN="${NODE_BIN:-/opt/apps/rhel8/node-v18.14.2-linux-x64/bin}"
if [ -x "$NODE_BIN/node" ]; then
  export PATH="$NODE_BIN:$PATH"
elif command -v module >/dev/null 2>&1; then
  module load Node.js/18.14.2 || true
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: node/npm not found. Set NODE_BIN=/path/to/node/bin and retry." >&2
  exit 1
fi
echo "Using node $(node --version) / npm $(npm --version)"

cd "$VIEWER_DIR"

# --- dependencies ---
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run)…"
  npm ci
fi

# --- data assets (gitignored; regenerate if missing) ---
MANIFEST="public/data/manifest.json"
GLB="public/assets/brain_fsaverage.glb"
if [ ! -f "$MANIFEST" ] || [ ! -f "$GLB" ]; then
  echo "Viewer assets missing — generating from $DATA_DIR …"
  if [ ! -d "$DATA_DIR" ]; then
    echo "ERROR: data dir not found: $DATA_DIR  (set BRAIN_VIEWER_DATA=/path)" >&2
    exit 1
  fi
  PY="$(command -v python3 || command -v python || true)"
  # build_viewer_assets.py needs numpy; fall back to the conda env if the default lacks it.
  if [ -z "$PY" ] || ! "$PY" -c 'import numpy' >/dev/null 2>&1; then
    CONDA_PY="$HOME/cogan_lab/jq81/miniconda3/envs/Lexical_NoDelay/bin/python"
    if [ -x "$CONDA_PY" ] && "$CONDA_PY" -c 'import numpy' >/dev/null 2>&1; then
      PY="$CONDA_PY"
    else
      echo "ERROR: need a python with numpy to build assets (e.g. 'conda activate Lexical_NoDelay')." >&2
      exit 1
    fi
  fi
  "$PY" "$REPO_DIR/build_viewer_assets.py" \
    --data-dir "$DATA_DIR" \
    --assets-dir public/assets \
    --manifest "$MANIFEST"
fi

# --- per-variant data symlinks (point public/data at the big data tree) ---
for ref in car bipolar; do
  if [ -d "$DATA_DIR/$ref" ] && [ ! -e "public/data/$ref" ]; then
    ln -sfn "$DATA_DIR/$ref" "public/data/$ref"
  fi
done

# --- Uniqueness Point task (2nd entry in the top-bar task switcher; see
#     src/constants/tasks.js dataBase='/data_up'). Served from its own bundle,
#     which already carries its manifest (built by build_viewer_assets.py).
#     The fsaverage brain GLB in public/assets is shared, so it is not re-linked. ---
UP_DATA_DIR="${BRAIN_VIEWER_DATA_UP:-$LEX_DIR/brain_viewer_data_up}"
if [ -d "$UP_DATA_DIR" ]; then
  mkdir -p public/data_up
  [ -f "$UP_DATA_DIR/manifest.json" ] && ln -sfn "$UP_DATA_DIR/manifest.json" public/data_up/manifest.json
  for ref in car bipolar; do
    if [ -d "$UP_DATA_DIR/$ref" ]; then
      ln -sfn "$UP_DATA_DIR/$ref" "public/data_up/$ref"
    fi
  done
fi

# --- tunnel hint ---
HOST="$(hostname -f 2>/dev/null || hostname)"
cat <<EOF

──────────────────────────────────────────────────────────────
 Starting Vite dev server on port $PORT
 Node: $HOST

 From your laptop, open an SSH tunnel, then browse http://localhost:$PORT :
   ssh -N -L $PORT:$HOST:$PORT <you>@<login-host>

 (If this is the login node, you can instead use localhost:)
   ssh -N -L $PORT:localhost:$PORT <you>@$HOST
──────────────────────────────────────────────────────────────

EOF

exec npm run dev -- --port "$PORT" --strictPort
