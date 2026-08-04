#!/usr/bin/env python3
"""Build React-viewer assets (manifest.json + brain GLB) from an existing
brain_viewer_data/ output tree.

This does NOT recompute HGA. It indexes the per-phase JSONs already produced by
prepare_data.py and emits the Sternberg-fork-compatible manifest, plus converts the
fsaverage pial mesh (brain_mesh.json) into a binary glTF (.glb) with a numpy-only
writer (no trimesh dependency).

Usage:
    # With no args it uses the in-repo defaults (see DEFAULT_* below):
    python build_viewer_assets.py

    # Or override any path explicitly:
    python build_viewer_assets.py \
        --data-dir   /path/to/brain_viewer_data \
        --assets-dir /path/to/viewer_react/public/assets \
        --manifest   /path/to/viewer_react/public/data/manifest.json
"""
import argparse
import json
import os
import struct

import numpy as np

# Primary phases shown in the Venn + waveform strip. "Cue" exists in the data but is
# intentionally excluded from the default view; add it here to surface it (the frontend
# is config-driven, so listing a phase is all that's required).
PRIMARY_PHASES = ["Stimulus", "Delay", "Response"]
DEFAULT_VENN_PHASES = ["Stimulus", "Delay", "Response"]

# Default paths, resolved from this script's location so the tool runs with no args
# from any cwd. Layout: <lexical_access>/brain_viewer/build_viewer_assets.py with the
# data tree at <lexical_access>/brain_viewer_data and the React viewer's served files
# under brain_viewer/viewer_react/public/{assets,data}.
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)  # lexical_access/
DEFAULT_DATA_DIR = os.path.join(REPO_ROOT, "brain_viewer_data")
DEFAULT_VIEWER_PUBLIC = os.path.join(HERE, "viewer_react", "public")
DEFAULT_ASSETS_DIR = os.path.join(DEFAULT_VIEWER_PUBLIC, "assets")
DEFAULT_MANIFEST = os.path.join(DEFAULT_VIEWER_PUBLIC, "data", "manifest.json")
DEFAULT_CONFIG = os.path.join(HERE, "prepare_dataset_config.json")


# --------------------------------------------------------------------------- GLB
def _pad(buf: bytes, fill: bytes = b"\x00") -> bytes:
    rem = (-len(buf)) % 4
    return buf + fill * rem


def write_glb(path: str, vertices: np.ndarray, faces: np.ndarray) -> dict:
    """Write a minimal binary glTF (POSITION + indices, single mesh)."""
    vertices = np.ascontiguousarray(vertices, dtype=np.float32)
    indices = np.ascontiguousarray(np.asarray(faces).reshape(-1), dtype=np.uint32)

    v_bytes = vertices.tobytes()
    i_bytes = indices.tobytes()
    v_pad = _pad(v_bytes)
    bin_blob = v_pad + _pad(i_bytes)

    vmin = vertices.min(axis=0).tolist()
    vmax = vertices.max(axis=0).tolist()

    gltf = {
        "asset": {"version": "2.0", "generator": "brain_viewer/build_viewer_assets"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "brain"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}]}],
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(v_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(v_pad), "byteLength": len(i_bytes), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": int(len(vertices)),
             "type": "VEC3", "min": vmin, "max": vmax},
            {"bufferView": 1, "componentType": 5125, "count": int(len(indices)),
             "type": "SCALAR"},
        ],
    }

    json_blob = _pad(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))          # header
        fh.write(struct.pack("<II", len(json_blob), 0x4E4F534A))     # JSON chunk
        fh.write(json_blob)
        fh.write(struct.pack("<II", len(bin_blob), 0x004E4942))      # BIN chunk
        fh.write(bin_blob)

    return {"n_vertices": int(len(vertices)), "n_faces": int(len(indices) // 3),
            "bounds": {"min": vmin, "max": vmax}}


def build_brain_glb(data_dir: str, assets_dir: str) -> dict:
    mesh = json.load(open(os.path.join(data_dir, "brain_mesh.json")))
    parts_v, parts_f = [], []
    offset = 0
    for hemi in ("lh", "rh"):
        h = mesh.get(hemi)
        if not h or not h.get("vertices"):
            continue
        v = np.asarray(h["vertices"], dtype=np.float32)
        f = np.asarray(h["faces"], dtype=np.int64) + offset
        parts_v.append(v)
        parts_f.append(f)
        offset += len(v)
    vertices = np.vstack(parts_v)
    faces = np.vstack(parts_f)
    center = vertices.mean(axis=0).tolist()

    os.makedirs(assets_dir, exist_ok=True)
    glb_path = os.path.join(assets_dir, "brain_fsaverage.glb")
    info = write_glb(glb_path, vertices, faces)

    meta = {
        "surf": "pial",
        "coordinate_space": "fsaverage_RAS_mm",
        "center": center,
        "hemi_split_x": center[0],
        **info,
    }
    with open(os.path.join(assets_dir, "brain_fsaverage.meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print(f"  GLB: {glb_path}  ({info['n_vertices']} verts, {info['n_faces']} faces)")
    print(f"  center={[round(c, 3) for c in center]}")
    return meta


# ---------------------------------------------------------------------- manifest
def _variant_key(ref, datatype, *parts):
    return "|".join([ref, datatype, *parts])


def _exists(*path_parts):
    return os.path.isfile(os.path.join(*path_parts))


def _phase_time_ranges(data_dir, references, conditions, phases):
    """Read the actual {min,max} time window per phase from the first available
    zscore phase file (drives trace clipping + animation extent on the client)."""
    ranges = {}
    for phase in phases:
        for ref in references:
            for cond in conditions:
                fp = os.path.join(data_dir, ref, "zscore", f"{phase}_{cond}.json")
                if os.path.isfile(fp):
                    times = json.load(open(fp)).get("times") or []
                    if times:
                        ranges[phase] = {"min": float(times[0]), "max": float(times[-1])}
                    break
            if phase in ranges:
                break
    return ranges


def _rerp_time_ranges(data_dir, references, conditions, predictors):
    """Read the actual {min,max} time window per RERP predictor from the first
    available rerp file (each predictor is its own event-locked window, so this
    drives the panel x-axis without colliding with the phase keys)."""
    ranges = {}
    for predictor in predictors:
        for ref in references:
            for cond in conditions:
                fp = os.path.join(data_dir, ref, "rerp", f"{predictor}_{cond}.json")
                if os.path.isfile(fp):
                    times = json.load(open(fp)).get("times") or []
                    if times:
                        ranges[predictor] = {"min": float(times[0]), "max": float(times[-1])}
                    break
            if predictor in ranges:
                break
    return ranges


def build_manifest(data_dir, references, conditions, diff_types, phases,
                   brain_meta, rerp_config=None, mesh_rel="assets/brain_fsaverage.glb"):
    """Enumerate every available (ref x datatype x ...) variant -> per-phase files."""
    variants = {}
    subjects, rois = set(), set()
    rerp_config = rerp_config or {}
    rerp_predictors = rerp_config.get("predictors", [])
    rerp_labels = rerp_config.get("labels", {})

    for ref in references:
        ref_dir = os.path.join(data_dir, ref)
        if not os.path.isdir(ref_dir):
            continue

        # subjects / rois from this reference's electrode catalog
        el_path = os.path.join(ref_dir, "electrodes.json")
        if os.path.isfile(el_path):
            el = json.load(open(el_path))
            subjects.update(el.get("subjects", []))
            rois.update(el.get("rois", []))

        # --- zscore variants: ref|zscore|<condition> ---
        for cond in conditions:
            phase_files = {p: f"{ref}/zscore/{p}_{cond}.json" for p in phases
                           if _exists(ref_dir, "zscore", f"{p}_{cond}.json")}
            if phase_files:
                variants[_variant_key(ref, "zscore", cond)] = {
                    "reference": ref, "datatype": "zscore", "condition": cond,
                    "phaseFiles": phase_files,
                }

        # --- diff variants: ref|diff|<type>|<direction>[|<condition>] ---
        for dtype, spec in diff_types.items():
            dirs = spec.get("directions", [])
            needs_cond = spec.get("needs_condition", False)
            cond_list = conditions if needs_cond else [None]
            for direction in dirs:
                for cond in cond_list:
                    suffix = f"_{cond}" if cond else ""
                    phase_files = {
                        p: f"{ref}/diff/{dtype}/{direction}_{p}{suffix}.json"
                        for p in phases
                        if _exists(ref_dir, "diff", dtype, f"{direction}_{p}{suffix}.json")
                    }
                    if not phase_files:
                        continue
                    parts = [dtype, direction] + ([cond] if cond else [])
                    variants[_variant_key(ref, "diff", *parts)] = {
                        "reference": ref, "datatype": "diff", "diff_type": dtype,
                        "direction": direction, "condition": cond,
                        "phaseFiles": phase_files,
                    }

        # --- rerp variants: ref|rerp|<predictor>|<condition> ---
        # A RERP kernel has no phase axis; the predictor occupies the phase-file slot
        # (single-entry phaseFiles keyed by the predictor). Sparse predictor x condition
        # combos are skipped by the same _exists gate as diffs.
        for predictor in rerp_predictors:
            for cond in conditions:
                fname = f"{predictor}_{cond}.json"
                if not _exists(ref_dir, "rerp", fname):
                    continue
                variants[_variant_key(ref, "rerp", predictor, cond)] = {
                    "reference": ref, "datatype": "rerp",
                    "rerp_predictor": predictor, "condition": cond,
                    "phaseFiles": {predictor: f"{ref}/rerp/{fname}"},
                }

    has_rerp = any(v["datatype"] == "rerp" for v in variants.values())
    datatypes = ["zscore", "diff"] + (["rerp"] if has_rerp else [])

    default_variant = _variant_key(references[0], "zscore", conditions[0])
    if default_variant not in variants and variants:
        default_variant = next(iter(variants))

    manifest = {
        "version": "brainviewer-1",
        "layout": "variant",
        "metadata": {
            "phases": phases,
            "phase_time_ranges": _phase_time_ranges(data_dir, references, conditions, phases),
            "default_venn_phases": [p for p in DEFAULT_VENN_PHASES if p in phases],
            "references": references,
            "datatypes": datatypes,
            "conditions": conditions,
            "diff_types": diff_types,
            "rerp_predictors": rerp_predictors,
            "rerp_labels": rerp_labels,
            "rerp_time_ranges": _rerp_time_ranges(data_dir, references, conditions, rerp_predictors),
            "subjects": sorted(subjects),
            "rois": sorted(rois),
            "coordinate_space": brain_meta.get("coordinate_space"),
            "brain_center": brain_meta.get("center"),
            "hemi_split_x": brain_meta.get("hemi_split_x"),
            "default_variant": default_variant,
        },
        "files": {
            "brainMesh": mesh_rel,
            "electrodes": {ref: f"{ref}/electrodes.json" for ref in references
                           if _exists(data_dir, ref, "electrodes.json")},
        },
        "variants": variants,
    }
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default=DEFAULT_DATA_DIR,
                    help="existing brain_viewer_data dir (default: %(default)s)")
    ap.add_argument("--assets-dir", default=DEFAULT_ASSETS_DIR,
                    help="viewer public/assets dir for the GLB (default: %(default)s)")
    ap.add_argument("--manifest", default=DEFAULT_MANIFEST,
                    help="output manifest.json path (default: %(default)s)")
    ap.add_argument("--config", default=DEFAULT_CONFIG,
                    help="prepare_dataset_config.json (default: %(default)s)")
    ap.add_argument("--phases", nargs="+", default=PRIMARY_PHASES)
    args = ap.parse_args()

    cfg = json.load(open(args.config)).get("data", {})
    references = cfg.get("references", ["car", "bipolar"])
    conditions = cfg.get("conditions", ["Decision", "Passive", "Repeat"])
    diff_types = cfg.get("diff_types", {})
    rerp_config = cfg.get("rerp", {})

    print("Building brain GLB ...")
    brain_meta = build_brain_glb(args.data_dir, args.assets_dir)

    print("Building manifest ...")
    manifest = build_manifest(args.data_dir, references, conditions, diff_types,
                              args.phases, brain_meta, rerp_config=rerp_config)
    os.makedirs(os.path.dirname(args.manifest), exist_ok=True)
    with open(args.manifest, "w") as fh:
        json.dump(manifest, fh)

    md = manifest["metadata"]
    print(f"  manifest: {args.manifest}")
    print(f"  phases={md['phases']}  default_venn={md['default_venn_phases']}")
    print(f"  variants: {len(manifest['variants'])}  default={md['default_variant']}")
    print(f"  subjects={len(md['subjects'])}  rois={len(md['rois'])}  refs={md['references']}")


if __name__ == "__main__":
    main()
