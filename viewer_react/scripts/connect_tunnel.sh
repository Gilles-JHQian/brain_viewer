#!/bin/bash
# Run on YOUR Mac/laptop (not on HPC).
# Opens an SSH tunnel to the Vite dev server started by scripts/dev.sh,
# then browse: http://localhost:5174/
#
# Prerequisites: Duke VPN (if off-campus), HPC account
#
# The compute node changes every allocation. dev.sh prints the current node
# (and the exact tunnel command). Override the defaults if yours differ:
#   COMPUTE_NODE=dcc-... LOCAL_PORT=5174 HPC_USER=jq81 bash connect_tunnel.sh

LOGIN="dcc-login.oit.duke.edu"
USER="${HPC_USER:-jq81}"
COMPUTE_NODE="${COMPUTE_NODE:-dcc-core-ferc-u-ab25-3-6}"
LOCAL_PORT="${LOCAL_PORT:-5174}"
REMOTE_PORT="${REMOTE_PORT:-5174}"

echo "Opening tunnel: localhost:${LOCAL_PORT} -> ${COMPUTE_NODE}:${REMOTE_PORT}"
echo "After connected, open: http://localhost:${LOCAL_PORT}/"
echo "Verify data: http://localhost:${LOCAL_PORT}/data/manifest.json  (n_electrodes should be 5240)"
echo "Press Ctrl+C to close."
echo ""

# ProxyJump is more reliable on Mac than forwarding via login hostname resolution.
exec ssh -N \
  -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
  -J "${USER}@${LOGIN}" \
  "${USER}@${COMPUTE_NODE}"
