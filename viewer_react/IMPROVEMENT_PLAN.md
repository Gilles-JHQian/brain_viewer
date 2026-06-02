# Phase Overlap Viewer — Improvement Plan

Last updated: 2026-05-26

This document tracks the agreed step-by-step improvements for the HGA Phase Overlap Viewer (`viewer/phase_overlap/`).

## Scope

### In scope
- Selection title shortening
- Detail panel layout (fill vertical space)
- Waveform panel height
- Empty-state guidance
- Subject dropdown UX (flip direction, 0-electrode subjects)
- Brain default view discoverability
- Animation cache keyed by selection (avoid full wipe)
- Minor polish (phase width ratios, README)
- Scale testing prep (20 → 51 → 69 subjects)

### Explicitly out of scope (for now)
- **Do not change** `KDE_ELECTRODE_MODE_MAX` in `src/constants/brain.js`
- **Do not** add Response to the default Venn phase set
- Four-phase synchronized playback (defer until Phase 9 evaluation)

---

## Phase 0 — Baseline cleanup (~0.5 day)

**Goal:** Consolidate local changes so each later phase can be verified independently.

| Task | Description |
|------|-------------|
| 0.1 | Inventory uncommitted viewer changes (subject dropdown, Detail panel electrode list removal, flexible plot height, scrubber layout, etc.) |
| 0.2 | Commit UI-only changes separately (exclude large `public/data/traces/`, `animation/`, `kde/`) |
| 0.3 | Smoke checklist: startup → Venn select → subject filter → Play → click electrode |

**Acceptance:** `npm run build` passes; 20-subject cohort basic flow works.

---

## Phase 1 — Selection title shortening (~0.5 day)

**Problem:** Multi-region Venn selection produces unreadably long titles in Detail panel and waveform header.

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Add `formatSelectionSummary()` → e.g. `4 regions · 323 electrodes · load 3` | `src/utils/selectionSummary.js` (new) |
| 1.2 | Detail panel: short `h2`; full region list in chips / list below | `DetailPanel.jsx`, `useSelectionPipeline.js` |
| 1.3 | Waveform panel: same short title format; single-electrode mode unchanged | `WaveformPanel.jsx` |
| 1.4 | Long labels via `title` tooltip on hover | components + `styles.css` |

**Acceptance:** 3–4 region selections stay readable; full text available on hover.

---

## Phase 2 — Detail panel layout (~0.5–1 day)

**Problem:** After removing the electrode list, the right panel has large empty space below the ROI chart.

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Flex column: summary fixed at top, ROI filter fills remaining height | `DetailPanel.jsx`, `styles.css` |
| 2.2 | ROI bar chart container `flex: 1` with scroll | `RoiBarChart.jsx`, `styles.css` |
| 2.3 | Optional compact stats row (enabled ROIs / total) | `DetailPanel.jsx` |

**Acceptance:** ROI chart uses vertical space; many ROIs scroll without hiding summary.

---

## Phase 3 — Waveform panel height (~0.5 day)

**Problem:** Bottom row is only `minmax(196px, 24vh)` — four phases + controls feel cramped.

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Increase third grid row to ~`minmax(240px, 30vh)` | `styles.css` |
| 3.2 | Verify ResizeObserver plot sizing at taller panels | `PhaseWaveformPlot.jsx` |
| 3.3 | Tune x-axis ticks/margins if Encoding labels overlap | `StaticPhasePlot.jsx` |

**Acceptance:** Waveform row visibly taller; plots stretch; x-axis labels acceptable.

---

## Phase 4 — Empty-state guidance (~0.5 day)

**Problem:** Deselect all subjects or ROIs leaves blank views with no explanation.

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | `selectedSubjects.size === 0` → empty state on brain + waveform | `BrainViewer.jsx`, `WaveformPanel.jsx` |
| 4.2 | `enabledRois.size === 0` → prompt to enable ROIs | same |
| 4.3 | Matching empty copy in Detail panel | `DetailPanel.jsx` |
| 4.4 | Disable Play when selection is empty | `WaveformPanel.jsx`, `PhaseAnimationControls.jsx` |

**Acceptance:** Clear messages when nothing is selected; no silent blank UI.

---

## Phase 5 — Subject dropdown UX (~0.5 day)

| Task | Description | Files |
|------|-------------|-------|
| 5.1 | Auto flip dropdown up/down based on available space | `SubjectDropdown.jsx`, `styles.css` |
| 5.2 | Filter or gray out 0-electrode subjects (e.g. D0033) | export and/or `usePhaseOverlapData.js`, `SubjectDropdown.jsx` |
| 5.3 | Label `(0 electrodes)`; optionally exclude from default selection | same |

**Acceptance:** Dropdown not clipped; empty subjects no longer confusing.

---

## Phase 6 — Brain default discoverability (~0.5 day)

**Problem:** Default KDE mode hides electrodes; users may not discover click-to-drill-down.

| Task | Description | Files |
|------|-------------|-------|
| 6.1 | Default view → `Electrodes` (KDE remains switchable) | `constants/brain.js` |
| 6.2 | Alternative (if preferred later): faint electrode markers in KDE mode | `BrainViewer.jsx` |
| 6.3 | Help tooltip: mention click electrode for single-electrode traces | `BrainViewer.jsx` |

**Acceptance:** First load shows electrodes; click populates Detail electrode card; KDE still available.

---

## Phase 7 — Animation cache optimization (~1 day)

**Problem:** Any filter change clears the entire animation cache; every Play re-fetches and merges.

| Task | Description | Files |
|------|-------------|-------|
| 7.1 | Cache key: `phase + load + subjectsKey + electrodeSetKey` | `useAnimationPlayback.js` |
| 7.2 | Store cache as Map or keyed object | same |
| 7.3 | Invalidate only affected entries, not full clear | same |
| 7.4 | Optional: prefetch animation for stable selection | same |

**Acceptance:** ROI-only changes reuse cache; subject/load changes refresh correctly.

---

## Phase 8 — Minor polish (~0.5–1 day)

| Task | Description | Files |
|------|-------------|-------|
| 8.1 | Tune `PHASE_WIDTH_RATIOS` (narrow Encoding slightly, widen Probe/Response) | `constants/phases.js` |
| 8.2 | Update README (no search, subject dropdown, split layout) | `README.md` |
| 8.3 | Unify empty / loading copy | panel components |

**Acceptance:** Docs match UI; four waveform columns more balanced.

---

## Phase 9 — Scale testing (as needed)

**Goal:** Validate 20 → 51 → 69 subjects without changing `KDE_ELECTRODE_MODE_MAX`.

| Task | Description |
|------|-------------|
| 9.1 | Update cohort in `viewer/phase_overlap/scripts/build_data.sh` |
| 9.2 | Record: startup load, trace lazy load, first Play, KDE preparing map, frame rate |
| 9.3 | Decide follow-ups (sync play, resizable waveform height, etc.) based on metrics |

---

## Recommended implementation order

```
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
         └─ readability ─┘ └─ layout ─┘ └─ UX ─┘ └─ perf ─┘
```

| Batch | Phases | Rationale |
|-------|--------|-----------|
| **A** | 0 + 1 + 2 | Readability + right panel whitespace |
| **B** | 3 + 4 | Waveform usability + empty states |
| **C** | 5 + 6 + 8 | Subject / brain polish + docs |
| **D** | 7 | Performance before scaling cohort |
| **E** | 9 | Expand subject count and benchmark |

---

## Deferred — KDE projection depth / sulcal shading

See **[KDE_PROJECTION_DEPTH_ANALYSIS.md](./KDE_PROJECTION_DEPTH_ANALYSIS.md)** for root-cause analysis of why KDE mode loses sulcal/gyral depth (unlit overlay, binary alpha, KDE smoothing, colormap/background). Implementation tracked separately when prioritized.

---

## Progress tracker

| Phase | Status | Notes |
|-------|--------|-------|
| 0 | done | Committed in 08a2183 |
| 1 | done | Short selection titles + tooltips |
| 2 | done | ROI filter fills panel; scrollable chart |
| 3 | done | Waveform row 30vh; adaptive x-axis ticks |
| 4 | done | Empty states for no subjects / ROIs / selection |
| 5 | pending | |
| 6 | pending | |
| 7 | pending | |
| 8 | pending | |
| 9 | pending | |

Update the **Status** column as each phase completes (`pending` → `in progress` → `done`).
