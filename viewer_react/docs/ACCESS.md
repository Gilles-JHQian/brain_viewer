# Phase Overlap Viewer — Private Access (HPC)

The viewer runs as a Slurm job on the lab GPU node. It is **not** on the public internet.

All commands below assume you are in the viewer directory:

```bash
cd viewer/phase_overlap
```

## Start / stop the server (on HPC)

```bash
# Start (max 30 days on coganlab-gpu partition)
sbatch scripts/serve.sh

# Check status
squeue -u ns458 -n phase_overlap_web

# Stop
scancel <jobid>
```

## What the SSH tunnel command means

```bash
ssh -L 8081:dcc-coganlab-gpu-ferc-s-aa32-29:8081 ns458@dcc-login.oit.duke.edu
```

| Part | Meaning |
|------|---------|
| `ssh` | Secure shell — connect to Duke HPC login node |
| `-L 8081:...:8081` | **Port forward**: traffic to your laptop port 8081 is sent through HPC to the compute node port 8081 |
| `dcc-coganlab-gpu-ferc-s-aa32-29` | The machine where the viewer job is running |
| `ns458@dcc-login.oit.duke.edu` | Your HPC username + login server |

After the tunnel is open, open **http://localhost:8081/** in your browser (same as if the server were running locally).

---

## Windows (PowerShell)

1. Connect to **Duke VPN** if off-campus.
2. Open **PowerShell**.
3. Run (leave the window open):

```powershell
ssh -L 8081:dcc-coganlab-gpu-ferc-s-aa32-29:8081 ns458@dcc-login.oit.duke.edu
```

4. Enter your HPC password when prompted.
5. Open browser: **http://localhost:8081/**

If `ssh` is not found: Settings → Apps → Optional features → add **OpenSSH Client**.

### Windows (PuTTY alternative)

1. Session → Host: `dcc-login.oit.duke.edu`, user `ns458`
2. Connection → SSH → Tunnels:
   - Source port: `8081`
   - Destination: `dcc-coganlab-gpu-ferc-s-aa32-29:8081`
   - Click **Add**
3. Open session, then browser: **http://localhost:8081/**

---

## Mac / Linux (recommended)

**Option A — one command (ProxyJump, works best on Mac):**

```bash
ssh -N -L 8081:127.0.0.1:8081 -J ns458@dcc-login.oit.duke.edu ns458@dcc-coganlab-gpu-ferc-s-aa32-29
```

**Option B — helper script** (run from repo clone on your laptop):

```bash
cd viewer/phase_overlap
bash scripts/connect_tunnel.sh
```

Then open **http://localhost:8081/**

**Option C — if you use Cursor connected to HPC:** dev server may still be on port **5173** via Cursor port forwarding → **http://localhost:5173/**

---

## Mac / Linux (older method — may fail)

```bash
ssh -L 8081:dcc-coganlab-gpu-ferc-s-aa32-29:8081 ns458@dcc-login.oit.duke.edu
```

If you see `channel open failed` or browser won't load, use **ProxyJump (Option A)** above.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Connection refused on localhost:8081 | Check job is running: `squeue -u ns458 -n phase_overlap_web` |
| SSH hangs / timeout | Connect Duke VPN first |
| Port 8081 already in use | Use `-L 9090:...:8081` and open http://localhost:9090/ |
| Still shows 40 subjects / 2903 electrodes | You may be hitting a **local old server**, not HPC. Open http://localhost:8081/data/manifest.json — must show `"n_electrodes": 5240`. Kill any local `python -m http.server` on Windows. |
| Node name changed after resubmit | Read new node from `logs/phase_overlap_web_<jobid>.out` (repo root `logs/`) |

Server job logs: `../../logs/phase_overlap_web_*.out` (relative to this directory).
