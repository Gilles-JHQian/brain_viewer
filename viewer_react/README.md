# HGA Phase Overlap Viewer

Interactive local Web App for exploring High Gamma phase-overlap electrodes in the Neighborhood Sternberg project.

**Self-contained module:** export (`export/`), scripts (`scripts/`), frontend (`src/`), and docs (`docs/`) all live in this directory. The only external input is Sternberg HGA packaged under `../../results/` (via `--input_root`).

Quick start:

```bash
cd viewer/phase_overlap
conda activate ieeg
npm install
npm run dev          # local UI
sbatch scripts/build_data.sh   # export JSON from results/
sbatch scripts/serve.sh          # HPC static host (see docs/ACCESS.md)
```

## What this viewer shows

- **Phase overlap Venn selector** — pick 2–3 phases (Encoding, Maintenance, Probe, Response) and toggle overlap regions.
- **3D brain view** — electrodes on the `cvs_avg35_inMNI152` average pial mesh (`public/assets/cvs_avg35_pial.glb`), with **Electrodes** or **KDE projection** display modes.
- **Electrode sizing** — sphere radius scales with per-load mean HGA (masked, in-window significant values).
- **KDE projection** — Gaussian kernel density of HGA on the pial surface (same method as [`notebooks/HGA_condition.ipynb`](../../notebooks/HGA_condition.ipynb)); hides individual spheres for a cleaner map. Updates dynamically during phase animation.
- **ROI filter** — bar chart sorted by count; click to show/hide ROIs; deselect all / show all.
- **Detail panel** — region counts, electrode list with search, single-electrode drill-down.
- **Four-phase HGA waveforms** — mean ± SEM across the current selection (or single electrode when clicked); auto-scaled y-axis.
- **Brain animation** — per-phase Play/Pause drives a “GIF-like” 3D animation: causal 200 ms sliding-window mean HGA → sphere radius, with 40 ms Gaussian temporal smoothing and selection-specific p95 scale.

## Data flow

The app loads **split layout** data when present:

```text
public/data/manifest.json
public/data/electrodes.json
public/data/traces/{subject}.json          # lazy-loaded per selected subject
public/data/animation/{subject}/{phase}.json  # lazy-loaded on Play
public/data/kde/roi/{subject}/mean.json
```

Startup only fetches `manifest.json` + `electrodes.json` (~200 KB for a large cohort). Traces and animation bundles load on demand.

If `manifest.json` is absent, the app falls back to monolith:

```text
public/data/phase_overlap.json
```

Then mock:

```text
public/data/phase_overlap_mock.json
```

Real data is **not** committed (generated locally). Use the export commands below.

## Scalability (70-subject architecture)

| Layer | What happens |
|-------|----------------|
| Export | Split JSON + precomputed animation per subject/phase/load |
| Startup | manifest + electrodes only |
| Traces | Lazy fetch for selected subjects (LRU cache, max 8) |
| Play | Fetch precomputed animation, merge in Web Worker |
| KDE | Electrode KDE if ≤200 electrodes; otherwise **ROI aggregate KDE** (~20 kernels) |
| Rendering | InstancedMesh for large electrode counts; virtualized electrode table |

## Build real data

All export tooling lives under this directory:

```text
export/          # Python: compute_phase_overlap.py, phase_overlap_*.py, export_average_brain_mesh.py
scripts/         # build_data.sh, qa_export.py, serve.sh, export_brain_mesh.sh, connect_tunnel.sh
public/data/     # generated JSON (not committed)
```

### Validation export (2 subjects)

Current validation pair: **D0041 + D0094**.

```bash
conda activate ieeg
cd viewer/phase_overlap
python export/compute_phase_overlap.py \
  --input_root ../../results \
  --task Sternberg \
  --reference bipolar \
  --encoding_mode strict \
  --include_response \
  --recon_dir /cwork/ns458/ECoG_Recon \
  --subjects D0041 D0094 \
  --layout split \
  --output_dir public/data

python scripts/qa_export.py public/data
```

Or submit the full-cohort Slurm job:

```bash
cd viewer/phase_overlap
sbatch scripts/build_data.sh
```

### Full cohort export

```bash
conda activate ieeg
cd viewer/phase_overlap
python export/compute_phase_overlap.py \
  --input_root ../../results \
  --task Sternberg \
  --reference bipolar \
  --encoding_mode strict \
  --include_response \
  --recon_dir /cwork/ns458/ECoG_Recon \
  --layout split \
  --output_dir public/data
```

### Legacy monolith export

```bash
python export/compute_phase_overlap.py \
  ... \
  --layout monolith \
  --output public/data/phase_overlap.json
```

## Coordinate and HGA rules

Export pipeline ([`export/compute_phase_overlap.py`](export/compute_phase_overlap.py) + [`export/phase_overlap_geometry.py`](export/phase_overlap_geometry.py)):

1. Read electrode coordinates from HGA CSV (fsaverage space).
2. Add the same `translation` vector used in [`notebooks/HGA.ipynb`](../../notebooks/HGA.ipynb).
3. Project **cortical** (`ctx_*`) and **Intersection** contacts to the nearest `cvs_avg35_inMNI152` pial vertex via hemisphere-specific KD-trees.
4. Keep **subcortical** contacts (Hipp, Amygdala, Thalamus, Putamen, ventricles, etc.) at translated native coordinates (`projected_to_pial: false`).
5. Compute `hga_by_load` as mean `value` where `mask=True`, `in_window=True`, and `description=load3/5/7/9`.
6. `hga_mean_all` is the mean across available loads; the viewer uses it when Load = All.

## Waveform display windows

Plot x-axis ranges (seconds relative to phase onset):

| Phase | Range |
|-------|-------|
| Encoding | −1 to load cutoff (up to ~8.7 s) |
| Maintenance | −1 to 3.5 |
| Probe | −1 to 2.0 |
| Response | −1 to 2.0 |

Statistical `in_window` masks in the export pipeline may use shorter strict windows (e.g. Probe 0–0.8 s for significance); the viewer plots the wider epoch for context.

## Brain animation

Parameters (in `src/constants/animation.js`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `ANIM_WINDOW_SEC` | 0.2 | Causal window [t, t + 200 ms] |
| `ANIM_STEP_SEC` | 0.02 | Frame step (≈ real-time playback) |
| `ANIM_GAUSSIAN_SIGMA_SEC` | 0.04 | Causal Gaussian smooth on the animation time series |

Static electrode size uses export `hga_size_scale` (cohort p95). During animation, size uses a **selection + phase p95** computed from all smoothed sliding-window values so the dynamic range fills the radius range without per-frame rescaling.

## Brain KDE projection

Matches the notebook KDE cell in [`notebooks/HGA_condition.ipynb`](../../notebooks/HGA_condition.ipynb) (Gaussian-weighted HGA on pial vertices).

| Parameter | Value |
|-----------|-------|
| Bandwidth | 8 mm |
| Max distance | 15 mm |
| Weights | \|HGA\| normalized to [0, 1] per visible selection |
| Colormap | vlag positive half; vmin=0, vmax=p95; fixed scale during animation |
| Overlay opacity | 0.9 |

Implementation: [`src/brainKde.js`](src/brainKde.js). Large selections (>200 electrodes) use **ROI aggregate KDE** automatically ([`src/utils/roiKdeSources.js`](src/utils/roiKdeSources.js)).

**View modes** (3D panel):

- **Electrodes** — colored/sized spheres (default).
- **KDE projection** — gray cortex + heatmap overlay; no electrode spheres. Requires `cvs_avg35_pial.glb`.

HGA weights follow the same source as sphere sizing: sliding-window live HGA while a phase is playing, otherwise per-load mean HGA (`resolveHgaMean`).

## Run locally

```bash
cd viewer/phase_overlap
npm install
npm run dev
```

Then open the URL printed by Vite, usually `http://localhost:5174`.

Production build:

```bash
npm run build
npm run preview
```

The 3D panel loads a static average brain mesh from `public/assets/cvs_avg35_pial.glb` (no recon path required at runtime).

## Average brain mesh

Regenerate from this directory:

```bash
conda activate ieeg
cd viewer/phase_overlap
python export/export_average_brain_mesh.py \
  --recon_dir /cwork/ns458/ECoG_Recon \
  --subject cvs_avg35_inMNI152 \
  --output public/assets/cvs_avg35_pial.glb
```

Or:

```bash
cd viewer/phase_overlap
sbatch scripts/export_brain_mesh.sh
```

## UI tips

- **Product tour** — on first visit (after data loads), a guided highlight tour auto-starts and walks through Load, Venn/phases, subjects, brain controls, ROI filter, and waveform Play. Use **Next** / **Back**, **Exit tour** (in the tour footer), **Esc**, or the popover **×** to skip; completion is stored in `localStorage` (`phase_overlap_tour_v2_completed`). Click **Tour** in the top bar anytime to replay. To test first-visit behavior again: `localStorage.removeItem('phase_overlap_tour_v2_completed')` then refresh.
- **Venn** — click regions to toggle; union of selected components defines the electrode set.
- **3D** — default shows selected electrodes only; use **Show all electrodes** for context. **View → KDE projection** for surface density (no spheres). **Hemisphere** filters left/right/both.
- **Waveforms** — aggregate mean ± SEM; click an electrode for single-electrode traces. Phases without trace data show an empty state (no mock fallback when real JSON is loaded).
- **Animation** — one phase plays at a time; updates sphere size (Electrodes mode) or KDE heatmap (KDE mode). Changing Venn, ROI, or Load stops playback.

## Next improvements

- Venn diagram refinements.
- Hippocampus mesh overlay.
- UpSet-style selector for complete four-phase overlap visualization.
- KDE colorbar legend (p10–p80 range).
