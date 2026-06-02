#!/bin/bash
# Run on YOUR Mac/laptop (not on HPC).
# Opens SSH tunnel → browser: http://localhost:8081/
#
# Prerequisites: Duke VPN (if off-campus), HPC account

LOGIN="dcc-login.oit.duke.edu"
USER="${HPC_USER:-ns458}"
COMPUTE_NODE="dcc-coganlab-gpu-ferc-s-aa32-29"
LOCAL_PORT=8081
REMOTE_PORT=8081

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
