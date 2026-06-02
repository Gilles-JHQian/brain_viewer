#!/usr/bin/env python3
"""Quick QA summary for phase_overlap exports (monolith or split layout)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

VIEWER_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = VIEWER_ROOT / "public" / "data"


def summarize_electrodes(electrodes: list[dict], meta: dict, label: str) -> None:
    projected = [e for e in electrodes if e.get("projected_to_pial")]
    native = [e for e in electrodes if e.get("projected_to_pial") is False]
    snap_distances = [e["snap_distance_mm"] for e in projected if e.get("snap_distance_mm") is not None]
    null_hga = sum(
        1
        for e in electrodes
        if all(v is None for v in e.get("hga_by_load", {}).values())
    )

    print(f"=== {label} ===")
    print(f"Subjects: {meta.get('subjects')}")
    print(f"Electrodes: {len(electrodes)}")
    print(f"Projected to pial: {len(projected)}")
    print(f"Kept native coords: {len(native)}")
    if snap_distances:
        snap_distances = sorted(snap_distances)
        mid = len(snap_distances) // 2
        median = snap_distances[mid]
        p95 = snap_distances[int(0.95 * (len(snap_distances) - 1))]
        outliers = sum(1 for d in snap_distances if d > 15)
        print(f"Snap distance mm: median={median:.2f}, p95={p95:.2f}, >15mm={outliers}")
    print(f"HGA scale: {meta.get('hga_size_scale')}")
    print(f"Null hga_by_load electrodes: {null_hga}")
    for roi in sorted({e.get('roi') for e in native}):
        count = sum(1 for e in native if e.get("roi") == roi)
        print(f"  native roi {roi}: {count}")


def qa_split_layout(data_dir: Path) -> None:
    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    electrodes_payload = json.loads((data_dir / "electrodes.json").read_text(encoding="utf-8"))
    meta = manifest["metadata"]
    electrodes = electrodes_payload["electrodes"]
    summarize_electrodes(electrodes, meta, f"Split layout: {data_dir}")

    subjects = meta.get("subjects") or []
    print(f"Manifest version: {manifest.get('version')} | layout: {manifest.get('layout')}")
    for subject in subjects:
        trace_path = data_dir / manifest["files"]["traces"][subject]
        trace_payload = json.loads(trace_path.read_text(encoding="utf-8"))
        n_traces = len(trace_payload.get("traces") or {})
        print(f"  traces/{subject}.json: {n_traces} electrodes")

        for phase in meta.get("phases") or []:
            anim_path = data_dir / manifest["files"]["animation"][subject][phase]
            anim_payload = json.loads(anim_path.read_text(encoding="utf-8"))
            bundle = anim_payload["bundles"]["all"]
            print(
                f"  animation/{subject}/{phase}.json: "
                f"{len(bundle.get('times') or [])} frames, "
                f"{len(bundle.get('electrode_ids') or [])} electrodes"
            )

        kde_path = data_dir / manifest["files"]["kde_roi_mean"][subject]
        kde_payload = json.loads(kde_path.read_text(encoding="utf-8"))
        print(f"  kde/roi/{subject}/mean.json: {len(kde_payload.get('sources') or [])} ROI sources")


def qa_monolith(path: Path) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    summarize_electrodes(payload["electrodes"], payload["metadata"], f"Monolith: {path}")


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DATA_DIR)
    if target.is_dir() and (target / "manifest.json").exists():
        qa_split_layout(target)
        return
    if target.is_file():
        qa_monolith(target)
        return
    manifest = target / "manifest.json"
    monolith = target / "phase_overlap.json"
    if manifest.exists():
        qa_split_layout(target)
    elif monolith.exists():
        qa_monolith(monolith)
    else:
        raise FileNotFoundError(f"No manifest.json or phase_overlap.json under {target}")


if __name__ == "__main__":
    main()
