import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from phase_overlap_animation import (
    LOAD_KEYS,
    PHASES,
    build_subject_phase_animation_bundle,
)
from phase_overlap_geometry import apply_coordinate_pipeline
from phase_overlap_kde import build_roi_mean_sources

VIEWER_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = VIEWER_ROOT.parent.parent
DEFAULT_DATA_DIR = VIEWER_ROOT / "public" / "data"


PHASES = ("encoding", "maintenance", "probe", "response")
LOADS = ("load3", "load5", "load7", "load9")
LOAD_CUTOFFS = {"load3": 2.8, "load5": 4.6, "load7": 6.7, "load9": 8.7}
STRICT_WINDOWS = {
    "encoding": (0.0, 1.0),
    "maintenance": (0.0, 3.5),
    "probe": (0.0, 0.8),
    "response": (0.0, 2.0),
}


def normalize_roi(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["roi"] = df["roi"].fillna("Unknown").astype(str)
    df.loc[df["roi"].eq("INS"), "roi"] = "Insula"
    df.loc[df["roi"].isin(["PrG", "PoG", "Subcentral"]), "roi"] = "SMC"
    df.loc[df["roi"].eq("HG"), "roi"] = "STG"

    if {"label", "y"}.issubset(df.columns):
        insula = df["roi"].eq("Insula")
        label = df["label"].fillna("").astype(str)
        y = pd.to_numeric(df["y"], errors="coerce")
        aic = insula & (
            label.str.contains("G_insular_short", regex=False)
            | label.str.contains("S_circular_insula_ant", regex=False)
            | (label.str.contains("S_circular_insula_sup", regex=False) & (y > 0))
            | (label.str.contains("S_circular_insula_inf", regex=False) & (y > 0))
        )
        pic = insula & (
            label.str.contains("G_Ins_lg_and_S_cent_ins", regex=False)
            | (label.str.contains("S_circular_insula_sup", regex=False) & (y <= 0))
            | (label.str.contains("S_circular_insula_inf", regex=False) & (y <= 0))
        )
        df.loc[aic, "roi"] = "AIC"
        df.loc[pic, "roi"] = "PIC"
    return df


def in_phase_window(df: pd.DataFrame, encoding_mode: str) -> pd.Series:
    phase = df["phase"].str.lower()
    time = pd.to_numeric(df["time"], errors="coerce")
    mask = pd.Series(False, index=df.index)
    for phase_name, (start, end) in STRICT_WINDOWS.items():
        if phase_name == "encoding" and encoding_mode == "full_load":
            desc = df["description"].astype(str)
            end_by_load = desc.map(LOAD_CUTOFFS).fillna(end)
            mask |= phase.eq(phase_name) & time.between(start, end_by_load)
        else:
            mask |= phase.eq(phase_name) & time.between(start, end)
    return mask


def region_id_for_flags(flags: dict[str, bool], include_response: bool) -> str:
    active = [phase for phase in PHASES if flags.get(phase, False)]
    if not include_response:
        active = [phase for phase in active if phase != "response"]
    return "_".join(active) if active else "none"


def region_label(region_id: str) -> str:
    if region_id == "none":
        return "No selected phase"
    return " ∩ ".join(part.capitalize() for part in region_id.split("_"))


def load_hga(input_root: Path, task: str, reference: str, subjects: list[str] | None = None) -> pd.DataFrame:
    root = input_root / f"{task}({reference})"
    paths = sorted(root.glob("sub-*/HGA/*_time.csv"))
    if not paths:
        paths = sorted(root.glob("**/*_time.csv"))
    if not paths:
        raise FileNotFoundError(f"No HGA *_time.csv files found under {root}")
    if subjects:
        subject_set = set(subjects)
        paths = [
            path
            for path in paths
            if any(sub in part for part in path.parts for sub in subject_set)
        ]
        if not paths:
            raise FileNotFoundError(f"No HGA files found for subjects: {', '.join(subjects)}")
    frames = [pd.read_csv(path) for path in paths]
    return pd.concat(frames, ignore_index=True)


def compute_hga_by_load(df: pd.DataFrame) -> pd.DataFrame:
    eligible = df[df["mask"] & df["in_window"]].copy()
    grouped = (
        eligible.groupby(["electrode_id", "description"], observed=True)["value"]
        .mean()
        .unstack(fill_value=np.nan)
    )
    grouped = grouped.reindex(columns=list(LOADS))
    grouped["hga_mean_all"] = grouped.mean(axis=1, skipna=True)
    return grouped


def compute_hga_size_scale(hga_by_load: pd.DataFrame) -> dict:
    values = []
    for load in LOADS:
        if load in hga_by_load.columns:
            values.extend(hga_by_load[load].dropna().abs().tolist())
    if not values:
        return {"vmin": 0.0, "vmax": 1.0, "method": "p95_abs_masked"}
    abs_values = np.asarray(values, dtype=np.float64)
    vmax = float(np.percentile(abs_values, 95))
    if vmax <= 0:
        vmax = float(abs_values.max()) if len(abs_values) else 1.0
    if vmax <= 0:
        vmax = 1.0
    return {"vmin": 0.0, "vmax": vmax, "method": "p95_abs_masked"}


def build_payload(
    df: pd.DataFrame,
    encoding_mode: str,
    include_response: bool,
    max_trace_points: int,
    recon_dir: Path | None,
    subjects: list[str] | None,
) -> dict:
    df = normalize_roi(df)
    df["phase"] = df["phase"].astype(str).str.lower()
    df["electrode_id"] = df["subject"].astype(str) + "|" + df["channel"].astype(str)
    df["mask"] = df["mask"].astype(bool)
    df["in_window"] = in_phase_window(df, encoding_mode)

    active_df = df[df["in_window"] & df["mask"]].copy()
    phase_flags = (
        active_df.groupby(["electrode_id", "phase"], observed=True)
        .size()
        .unstack(fill_value=0)
        .reindex(columns=PHASES, fill_value=0)
        .gt(0)
    )

    hga_by_load = compute_hga_by_load(df)

    meta_cols = ["electrode_id", "subject", "channel", "roi", "label", "hemi", "x", "y", "z"]
    meta = (
        df.sort_values(["subject", "channel"])
        .drop_duplicates("electrode_id")
        .reindex(columns=meta_cols)
        .copy()
    )
    meta = meta[meta["x"].notna() & meta["y"].notna() & meta["z"].notna()].copy()

    translation = None
    if recon_dir is not None:
        meta, translation = apply_coordinate_pipeline(meta, recon_dir)

    electrodes = []
    region_members: dict[str, list[str]] = {}
    for row in meta.itertuples(index=False):
        flags = {
            phase: bool(phase_flags.loc[row.electrode_id, phase])
            if row.electrode_id in phase_flags.index
            else False
            for phase in PHASES
        }
        active_phases = [phase for phase in PHASES if flags[phase]]
        rid = region_id_for_flags(flags, include_response=include_response)
        region_members.setdefault(rid, []).append(row.electrode_id)

        electrode = {
            "id": row.electrode_id,
            "subject": row.subject,
            "channel": row.channel,
            "roi": row.roi,
            "label": row.label if pd.notna(row.label) else "Unknown",
            "hemi": row.hemi if pd.notna(row.hemi) else "",
            "x": float(row.x),
            "y": float(row.y),
            "z": float(row.z),
            "active_phases": active_phases,
            "phase_flags": flags,
        }

        if recon_dir is not None:
            electrode.update({
                "x_native": float(row.x_native),
                "y_native": float(row.y_native),
                "z_native": float(row.z_native),
                "projected_to_pial": bool(row.projected_to_pial),
                "snap_distance_mm": None if pd.isna(row.snap_distance_mm) else float(row.snap_distance_mm),
            })

        if row.electrode_id in hga_by_load.index:
            load_values = hga_by_load.loc[row.electrode_id]
            hga_load_payload = {
                load: None if pd.isna(load_values.get(load)) else float(load_values.get(load))
                for load in LOADS
            }
            mean_all = load_values.get("hga_mean_all")
            electrode["hga_by_load"] = hga_load_payload
            electrode["hga_mean_all"] = None if pd.isna(mean_all) else float(mean_all)
        else:
            electrode["hga_by_load"] = {load: None for load in LOADS}
            electrode["hga_mean_all"] = None

        electrodes.append(electrode)

    regions = []
    for rid, ids in sorted(region_members.items(), key=lambda item: (-len(item[1]), item[0])):
        if rid == "none":
            continue
        active = rid.split("_")
        regions.append({
            "id": rid,
            "label": region_label(rid),
            "phases_on": active,
            "phases_off": [phase for phase in PHASES if phase not in active],
            "electrode_ids": sorted(ids),
            "count": len(ids),
        })

    traces = build_traces(df, {item["id"] for item in electrodes}, max_trace_points=max_trace_points)
    exported_subjects = sorted({item["subject"] for item in electrodes})
    metadata = {
        "source": "HGA CSV",
        "encoding_mode": encoding_mode,
        "include_response": include_response,
        "n_electrodes": len(electrodes),
        "phases": list(PHASES),
        "loads": list(LOADS),
        "subjects": exported_subjects if subjects is None else subjects,
        "hga_size_scale": compute_hga_size_scale(hga_by_load),
    }
    if recon_dir is not None and translation is not None:
        metadata["coordinate_space"] = "cvs_avg35_inMNI152"
        metadata["translation"] = [float(x) for x in translation.tolist()]
        metadata["recon_dir"] = str(recon_dir)

    return {
        "metadata": metadata,
        "electrodes": electrodes,
        "regions": regions,
        "traces": traces,
    }


def downsample_trace(trace: pd.DataFrame, max_points: int) -> pd.DataFrame:
    if len(trace) <= max_points:
        return trace
    idx = np.linspace(0, len(trace) - 1, max_points).round().astype(int)
    return trace.iloc[np.unique(idx)]


def build_traces(df: pd.DataFrame, electrode_ids: set[str], max_trace_points: int) -> dict:
    traces = {}
    trace_df = df[df["electrode_id"].isin(electrode_ids)].copy()
    grouped = trace_df.groupby(["electrode_id", "phase", "description", "time"], observed=True)["value"].mean().reset_index()
    for (electrode_id, phase), phase_df in grouped.groupby(["electrode_id", "phase"], observed=True):
        traces.setdefault(electrode_id, {})
        traces[electrode_id].setdefault(phase, {})
        for load, load_df in phase_df.groupby("description", observed=True):
            load_df = load_df.sort_values("time")
            load_df = downsample_trace(load_df, max_points=max_trace_points)
            traces[electrode_id][phase][str(load)] = {
                "time": [float(x) for x in load_df["time"].to_numpy()],
                "value": [None if pd.isna(x) else float(x) for x in load_df["value"].to_numpy()],
            }
    return traces


def split_traces_by_subject(traces: dict, electrodes: list[dict]) -> dict[str, dict]:
    subject_by_electrode = {item["id"]: item["subject"] for item in electrodes}
    by_subject: dict[str, dict] = {}
    for electrode_id, phase_traces in traces.items():
        subject = subject_by_electrode.get(electrode_id)
        if subject is None:
            continue
        by_subject.setdefault(subject, {})[electrode_id] = phase_traces
    return by_subject


def write_split_layout(payload: dict, output_dir: Path) -> None:
    metadata = payload["metadata"]
    electrodes = payload["electrodes"]
    regions = payload.get("regions", [])
    traces = payload["traces"]
    subjects = metadata["subjects"]
    traces_by_subject = split_traces_by_subject(traces, electrodes)

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "traces").mkdir(exist_ok=True)
    (output_dir / "animation").mkdir(exist_ok=True)
    (output_dir / "kde" / "roi").mkdir(parents=True, exist_ok=True)

    manifest = {
        "version": 2,
        "layout": "split",
        "metadata": metadata,
        "files": {
            "electrodes": "electrodes.json",
            "traces": {subject: f"traces/{subject}.json" for subject in subjects},
            "animation": {
                subject: {
                    phase: f"animation/{subject}/{phase}.json"
                    for phase in PHASES
                }
                for subject in subjects
            },
            "kde_roi_mean": {
                subject: f"kde/roi/{subject}/mean.json"
                for subject in subjects
            },
        },
        "animation_loads": list(LOAD_KEYS),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (output_dir / "electrodes.json").write_text(
        json.dumps({"electrodes": electrodes, "regions": regions}, indent=2),
        encoding="utf-8",
    )

    electrodes_by_subject = {}
    for electrode in electrodes:
        electrodes_by_subject.setdefault(electrode["subject"], []).append(electrode)

    for subject in subjects:
        subject_traces = traces_by_subject.get(subject, {})
        (output_dir / "traces" / f"{subject}.json").write_text(
            json.dumps({"subject": subject, "traces": subject_traces}, indent=2),
            encoding="utf-8",
        )

        subject_electrodes = electrodes_by_subject.get(subject, [])
        electrode_ids = [item["id"] for item in subject_electrodes]
        animation_dir = output_dir / "animation" / subject
        animation_dir.mkdir(parents=True, exist_ok=True)
        for phase in PHASES:
            bundle = build_subject_phase_animation_bundle(electrode_ids, subject_traces, phase)
            (animation_dir / f"{phase}.json").write_text(json.dumps(bundle, indent=2), encoding="utf-8")

        kde_dir = output_dir / "kde" / "roi" / subject
        kde_dir.mkdir(parents=True, exist_ok=True)
        (kde_dir / "mean.json").write_text(
            json.dumps({"subject": subject, **build_roi_mean_sources(subject_electrodes)}, indent=2),
            encoding="utf-8",
        )


def write_monolith_layout(payload: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Build phase-overlap JSON for the HGA viewer.")
    parser.add_argument("--input_root", default=PROJECT_ROOT / "results", type=Path)
    parser.add_argument("--task", default="Sternberg")
    parser.add_argument("--reference", default="bipolar")
    parser.add_argument("--encoding_mode", choices=["strict", "full_load"], default="strict")
    parser.add_argument("--include_response", action="store_true")
    parser.add_argument("--max_trace_points", type=int, default=160)
    parser.add_argument("--subjects", nargs="*", default=None, help="Optional subject IDs, e.g. D0041 D0094")
    parser.add_argument(
        "--recon_dir",
        default=Path("/cwork/ns458/ECoG_Recon"),
        type=Path,
        help="FreeSurfer subjects dir for translation and pial projection",
    )
    parser.add_argument(
        "--layout",
        choices=["split", "monolith"],
        default="split",
        help="split: manifest + per-subject files; monolith: single phase_overlap.json",
    )
    parser.add_argument(
        "--output_dir",
        default=DEFAULT_DATA_DIR,
        type=Path,
        help="Output directory for split layout (manifest.json, electrodes.json, ...)",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_DATA_DIR / "phase_overlap.json",
        type=Path,
        help="Output path for monolith layout",
    )
    args = parser.parse_args()

    df = load_hga(args.input_root, args.task, args.reference, subjects=args.subjects)
    payload = build_payload(
        df,
        encoding_mode=args.encoding_mode,
        include_response=args.include_response,
        max_trace_points=args.max_trace_points,
        recon_dir=args.recon_dir,
        subjects=args.subjects,
    )
    projected = sum(1 for item in payload["electrodes"] if item.get("projected_to_pial"))
    if args.layout == "split":
        write_split_layout(payload, args.output_dir)
        print(
            f"Saved split layout to {args.output_dir} | electrodes={payload['metadata']['n_electrodes']} "
            f"| subjects={len(payload['metadata']['subjects'])} | regions={len(payload.get('regions', []))} "
            f"| projected={projected}"
        )
    else:
        write_monolith_layout(payload, args.output)
        print(
            f"Saved {args.output} | electrodes={payload['metadata']['n_electrodes']} "
            f"| regions={len(payload.get('regions', []))} | projected={projected}"
        )


if __name__ == "__main__":
    main()
