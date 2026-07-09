#!/usr/bin/env python3
"""
Brain Viewer Data Preparation Script

Generates JSON data files from HGA analysis results for the interactive
brain viewer. Run this on the HPC cluster, then download the output
directory to your local machine.

Usage:
    conda activate Lexical_NoDelay
    python prepare_data.py [--output-dir OUTPUT_DIR] [--config CONFIG_JSON]

Author: Assistant
Date: 2026-03-04
"""

import os
import sys
import json
import math
import argparse
import warnings
import copy
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple

from mne.surface import read_surface
from nibabel.freesurfer import read_annot
import mne
import h5py
import re
from mne_bids import BIDSPath
from tqdm import tqdm

warnings.filterwarnings("ignore")

# =============================================================================
# Configuration handling
# =============================================================================
SCRIPT_DIR = os.path.dirname(__file__)
DEFAULT_CONFIG_PATH = os.path.join(SCRIPT_DIR, "prepare_dataset_config.json")
CONFIG: Dict[str, object] = {}
CONFIG_PATH: Optional[str] = None


def _default_config() -> dict:
    return {
        "paths": {
            "bids_root": "/cwork/jq81/cogan_lab_box/CoganLab/BIDS-1.0_LexicalDecRepNoDelay/BIDS",
            "subjects_dir": "/hpc/home/jq81/cogan_lab/jq81/freesurfer/subjects",
            "recon_dir": "/cwork/jq81/cogan_lab_box/ECoG_Recon",
            "derivatives_root": None,
            "statistics_root": None,
            "stim_properties_path": "stim_properties.json",
        },
        "data": {
            "task": "LexicalNoDelay",
            "band": "highgamma",
            "references": ["car", "bipolar"],
            "phases": ["Cue", "Stimulus", "Delay", "Response"],
            "conditions": ["Decision", "Passive", "Repeat"],
            "diff_types": {
                "condition": {
                    "directions": ["DecRep", "RepDec"],
                    "needs_condition": False,
                    "condition_map": {
                        "DecRep": ["Decision", "Repeat"],
                        "RepDec": ["Repeat", "Decision"],
                    },
                },
                "lexicality": {
                    "directions": ["NwWd", "WdNw"],
                    "needs_condition": True,
                    "stim_type_map": {
                        "NwWd": ["Nonword", "Word"],
                        "WdNw": ["Word", "Nonword"],
                    },
                    # Used for statistics file lookup (backend still calls it stimType)
                    "stats_rec_type": "stimType",
                },
                "neighborhood": {
                    "directions": ["HdLd", "LdHd"],
                    "needs_condition": True,
                    "stats_rec_type": "neighborhood",
                    "neighborhood_map": {
                        "HdLd": ["High", "Low"],
                        "LdHd": ["Low", "High"],
                    },
                },
            },
        },
        "mesh_decimate_target": 50000,
    }


DEFAULT_CONFIG_TEMPLATE = _default_config()


def _deep_update(base: dict, updates: dict) -> dict:
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_update(base[key], value)
        else:
            base[key] = value
    return base


def _resolve_path(path_value: Optional[str]) -> Optional[str]:
    if path_value in (None, ""):
        return None
    expanded = os.path.expanduser(os.path.expandvars(path_value))
    if os.path.isabs(expanded):
        return expanded
    return os.path.abspath(os.path.join(SCRIPT_DIR, expanded))


def load_config(config_path: Optional[str] = None) -> dict:
    config = copy.deepcopy(DEFAULT_CONFIG_TEMPLATE)
    path = config_path or DEFAULT_CONFIG_PATH
    used_path = os.path.abspath(path) if path else None
    if path and os.path.exists(path):
        try:
            with open(path, "r") as f:
                overrides = json.load(f)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Failed to parse config file {path}: {exc}") from exc
        _deep_update(config, overrides)
        # An explicit ``data.diff_types`` in the config file REPLACES the default
        # set rather than deep-merging with it, so ``{}`` disables all diff
        # export (e.g. HGA-only datasets such as UniquenessPoint).
        override_data = overrides.get("data")
        if isinstance(override_data, dict) and "diff_types" in override_data:
            config.setdefault("data", {})["diff_types"] = override_data["diff_types"]
    else:
        if path:
            warnings.warn(f"Config file {path} not found. Falling back to defaults.")
    paths = config.get("paths", {})
    for key in list(paths.keys()):
        paths[key] = _resolve_path(paths[key])
    config["paths"] = paths
    config["_source_path"] = used_path if (path and os.path.exists(path)) else None
    return config


def apply_config(config: dict):
    global CONFIG, CONFIG_PATH
    global BIDS_ROOT, SUBJECTS_DIR, RECON_DIR, A2009S_CSV, FS_COLOR_LUT
    global TASK, BAND, REFERENCE, REFERENCES, PHASES, CONDITIONS, DIFF_TYPES
    global DERIVATIVES_ROOT, STATISTICS_ROOT, STIM_PROPERTIES_PATH, MESH_DECIMATE_TARGET

    CONFIG = config
    CONFIG_PATH = config.get("_source_path")

    defaults = DEFAULT_CONFIG_TEMPLATE
    paths = config.get("paths", {})
    data_cfg = config.get("data", {})
    default_paths = defaults.get("paths", {})
    default_data = defaults.get("data", {})

    bids_root_value = paths.get("bids_root") or default_paths["bids_root"]
    subjects_value = paths.get("subjects_dir") or os.environ.get("SUBJECTS_DIR") or default_paths["subjects_dir"]
    recon_value = paths.get("recon_dir") or os.environ.get("RECON_DIR") or default_paths["recon_dir"]
    derivatives_value = paths.get("derivatives_root")
    statistics_value = paths.get("statistics_root")
    stim_props_value = paths.get("stim_properties_path") or default_paths["stim_properties_path"]

    BIDS_ROOT = _resolve_path(bids_root_value)
    SUBJECTS_DIR = _resolve_path(subjects_value)
    RECON_DIR = _resolve_path(recon_value)
    DERIVATIVES_ROOT = _resolve_path(derivatives_value) if derivatives_value else None
    STATISTICS_ROOT = _resolve_path(statistics_value) if statistics_value else None

    TASK = data_cfg.get("task", default_data["task"])
    BAND = data_cfg.get("band", default_data["band"])
    # Support both old "reference" (single) and new "references" (list)
    if "references" in data_cfg:
        REFERENCES = data_cfg["references"]
    elif "reference" in data_cfg:
        REFERENCES = [data_cfg["reference"]]
    elif "references" in default_data:
        REFERENCES = default_data["references"]
    else:
        REFERENCES = [default_data.get("reference", "car")]
    REFERENCE = REFERENCES[0]  # initial default
    PHASES = data_cfg.get("phases", default_data["phases"])
    CONDITIONS = data_cfg.get("conditions", default_data["conditions"])
    DIFF_TYPES = data_cfg.get("diff_types", default_data["diff_types"])

    if DERIVATIVES_ROOT is None:
        DERIVATIVES_ROOT = os.path.join(BIDS_ROOT, f"derivatives/epoch({REFERENCE})")
    if STATISTICS_ROOT is None:
        STATISTICS_ROOT = os.path.join(BIDS_ROOT, "derivatives/statistics")

    A2009S_CSV = os.path.join(BIDS_ROOT, "code", "a2009s.csv")
    FS_COLOR_LUT = os.path.join(BIDS_ROOT, "code", "FreeSurferColorLUT.txt")
    STIM_PROPERTIES_PATH = _resolve_path(stim_props_value) or os.path.join(SCRIPT_DIR, "stim_properties.json")
    MESH_DECIMATE_TARGET = int(config.get("mesh_decimate_target", defaults["mesh_decimate_target"]))


apply_config(load_config())


def set_reference(ref: str):
    """Switch the active reference and update dependent globals."""
    global REFERENCE, DERIVATIVES_ROOT
    REFERENCE = ref
    DERIVATIVES_ROOT = os.path.join(BIDS_ROOT, f"derivatives/epoch({REFERENCE})")


# =============================================================================
# JSON encoder for numpy types
# =============================================================================
def _sanitize_value(v):
    """Replace NaN/Inf floats with None recursively."""
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    elif isinstance(v, list):
        return [_sanitize_value(x) for x in v]
    elif isinstance(v, dict):
        return {k: _sanitize_value(val) for k, val in v.items()}
    return v


class NumpyEncoder(json.JSONEncoder):
    """JSON encoder that handles numpy types, sanitising NaN/Inf → null."""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            v = float(obj)
            if math.isnan(v) or math.isinf(v):
                return None
            return round(v, 6)
        elif isinstance(obj, np.ndarray):
            return _sanitize_value(obj.tolist())
        elif isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)


def save_json(data: dict, filepath: str, compact: bool = True):
    """Save data as JSON file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        if compact:
            json.dump(data, f, cls=NumpyEncoder, separators=(',', ':'))
        else:
            json.dump(data, f, cls=NumpyEncoder, indent=2)
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"  Saved: {filepath} ({size_mb:.2f} MB)")


# =============================================================================
# 1. Brain mesh extraction
# =============================================================================
def prepare_brain_mesh(output_dir: str):
    """
    Extract fsaverage pial surface mesh and export as JSON.
    
    Reads lh.pial and rh.pial from FreeSurfer fsaverage,
    decimates to reduce size, maps annotation colors to decimated
    vertices via nearest-neighbour, and saves as JSON with vertices (mm),
    face indices, and per-vertex ROI colors.
    """
    print("\n=== Preparing brain mesh ===")
    
    from scipy.spatial import cKDTree
    
    mesh_data = {}
    
    for hemi in ["lh", "rh"]:
        surf_path = os.path.join(SUBJECTS_DIR, "fsaverage", "surf", f"{hemi}.pial")
        annot_path = os.path.join(
            SUBJECTS_DIR, "fsaverage", "label", f"{hemi}.aparc.a2009s.annot"
        )
        print(f"  Loading {surf_path}")
        
        # read_surface returns vertices in surface RAS (mm) and face indices
        verts, faces = read_surface(surf_path)
        
        print(f"  Original: {verts.shape[0]} vertices, {faces.shape[0]} faces")
        
        # Load annotation for original mesh
        labels_orig, ctab_orig, names_orig = read_annot(annot_path)
        # names_orig is list of bytes; decode
        names_orig = [n.decode() if isinstance(n, bytes) else n for n in names_orig]
        
        # Decimate if needed
        if verts.shape[0] > MESH_DECIMATE_TARGET:
            verts_dec, faces_dec = _decimate_mesh(verts, faces, MESH_DECIMATE_TARGET)
            print(f"  Decimated: {verts_dec.shape[0]} vertices, {faces_dec.shape[0]} faces")
            
            # Map annotation labels to decimated vertices via nearest neighbour
            print("  Mapping annotation labels to decimated mesh...")
            tree = cKDTree(verts)
            _, nearest_idx = tree.query(verts_dec)
            labels_dec = labels_orig[nearest_idx]
        else:
            verts_dec, faces_dec = verts, faces
            labels_dec = labels_orig
        
        # Round to reduce JSON size (0.1mm precision is plenty)
        verts_dec = np.round(verts_dec, 1)
        
        # Build per-vertex RGB colors from annotation
        # ctab columns: R, G, B, A, label_id
        vertex_colors = np.full((verts_dec.shape[0], 3), 232, dtype=np.uint8)  # default gray
        for label_idx in range(len(names_orig)):
            mask = labels_dec == label_idx
            if np.any(mask) and names_orig[label_idx] != "Unknown":
                r, g, b = int(ctab_orig[label_idx, 0]), int(ctab_orig[label_idx, 1]), int(ctab_orig[label_idx, 2])
                vertex_colors[mask] = [r, g, b]
        
        n_colored = int(np.sum(labels_dec > 0))
        print(f"  Colored {n_colored}/{verts_dec.shape[0]} vertices with annotation labels")
        
        mesh_data[hemi] = {
            "vertices": verts_dec.tolist(),
            "faces": faces_dec.tolist(),
            "vertex_colors": vertex_colors.tolist(),
            "n_vertices": int(verts_dec.shape[0]),
            "n_faces": int(faces_dec.shape[0]),
        }
    
    save_json(mesh_data, os.path.join(output_dir, "brain_mesh.json"))


def _decimate_mesh(verts: np.ndarray, faces: np.ndarray, target: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Decimate a mesh to approximately `target` vertices using PyVista.
    """
    try:
        import pyvista as pv
        
        # Build PyVista mesh
        # faces need to be in VTK format: [n_verts, v0, v1, v2, ...]
        n_faces = faces.shape[0]
        vtk_faces = np.column_stack([
            np.full(n_faces, 3, dtype=np.int64),
            faces
        ]).ravel()
        
        mesh = pv.PolyData(verts, vtk_faces)
        
        # Compute decimation ratio
        ratio = 1.0 - (target / verts.shape[0])
        ratio = max(0.0, min(ratio, 0.95))
        
        # Decimate
        decimated = mesh.decimate(ratio)
        
        # Extract vertices and faces
        new_verts = np.array(decimated.points)
        new_faces = decimated.faces.reshape(-1, 4)[:, 1:]  # Remove the '3' prefix
        
        return new_verts, new_faces
        
    except Exception as e:
        print(f"  Warning: Decimation failed ({e}), using original mesh")
        return verts, faces


# =============================================================================
# 2. ROI atlas with annotation-based vertex labels
# =============================================================================
def prepare_roi_atlas(output_dir: str):
    """
    Extract ROI atlas data including:
    - Gross label to atlas label mapping (from a2009s.csv)
    - FreeSurfer color lookup table
    - Per-vertex annotation labels for brain surface coloring
    """
    print("\n=== Preparing ROI atlas ===")
    
    # Load gross label to atlas label mapping (skip comment lines)
    a2009s_df = pd.read_csv(A2009S_CSV, comment='#').dropna(subset=['gross_label', 'atlas_label'])
    
    # Build gross_label -> list of atlas_labels mapping
    gross_to_atlas = {}
    atlas_to_gross = {}
    for _, row in a2009s_df.iterrows():
        gross = row["gross_label"]
        atlas = row["atlas_label"]
        if gross not in gross_to_atlas:
            gross_to_atlas[gross] = []
        gross_to_atlas[gross].append(atlas)
        atlas_to_gross[atlas] = gross
    
    # Parse FreeSurfer color LUT for ROI colors
    fs_colors = _parse_freesurfer_lut(FS_COLOR_LUT)
    
    # Load annotation files for per-vertex ROI labels
    annot_data = {}
    for hemi in ["lh", "rh"]:
        annot_path = os.path.join(
            SUBJECTS_DIR, "fsaverage", "label", f"{hemi}.aparc.a2009s.annot"
        )
        labels, ctab, names = read_annot(annot_path)
        
        # Decode names if bytes
        names = [n.decode('utf-8') if isinstance(n, bytes) else str(n) for n in names]
        
        # Build color table: name -> [R, G, B, A]
        label_colors = {}
        for i, name in enumerate(names):
            full_name = f"ctx_{hemi}_{name}"
            label_colors[full_name] = ctab[i, :4].tolist()  # R, G, B, A
        
        annot_data[hemi] = {
            "labels": labels.tolist(),  # Per-vertex label index
            "names": [f"ctx_{hemi}_{n}" for n in names],  # Full atlas label names
            "colors": label_colors,
        }
    
    # Define colors for gross ROI labels (used for electrode visualization)
    gross_roi_colors = _define_gross_roi_colors()
    
    atlas_data = {
        "gross_to_atlas": gross_to_atlas,
        "atlas_to_gross": atlas_to_gross,
        "gross_roi_colors": gross_roi_colors,
        "fs_colors": fs_colors,
        "annotations": annot_data,
    }
    
    save_json(atlas_data, os.path.join(output_dir, "roi_atlas.json"))


def _parse_freesurfer_lut(lut_path: str) -> Dict[str, List[int]]:
    """Parse FreeSurfer color LUT file into {label_name: [R, G, B, A]} dict."""
    colors = {}
    with open(lut_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            if len(parts) >= 5:
                try:
                    name = parts[1]
                    r, g, b, a = int(parts[2]), int(parts[3]), int(parts[4]), int(parts[5]) if len(parts) > 5 else 255
                    colors[name] = [r, g, b, a]
                except (ValueError, IndexError):
                    continue
    return colors


def _define_gross_roi_colors() -> Dict[str, List[int]]:
    """
    Define distinct colors for gross ROI labels.
    These are used for electrode sphere coloring in the 3D viewer.
    """
    return {
        # Temporal
        "STG": [228, 26, 28],       # Red
        "MTG": [255, 127, 0],       # Orange
        "ITG": [255, 191, 0],       # Gold
        "HG": [227, 66, 52],        # Vermillion
        "STS": [251, 154, 153],     # Light red
        "TP": [253, 191, 111],      # Light orange
        # Frontal
        "IFG": [55, 126, 184],      # Blue
        "MFG": [77, 175, 74],       # Green
        "SFG": [152, 78, 163],      # Purple
        "PrCG": [166, 206, 227],    # Light blue
        # Parietal
        "SMG": [31, 120, 180],      # Dark blue
        "AG": [106, 61, 154],       # Dark purple
        "SPG": [202, 178, 214],     # Light purple
        "PoCG": [178, 223, 138],    # Light green
        # Central / Other cortical
        "Insula": [255, 255, 51],   # Yellow
        "OFC": [177, 89, 40],       # Brown
        "GRect": [190, 174, 212],   # Lavender
        "Subcentral": [141, 211, 199],  # Teal
        "Cingulate": [188, 128, 189],   # Mauve
        "Precuneus": [204, 235, 197],   # Pale green
        "Cuneus": [255, 237, 111],      # Pale yellow
        "Occipital": [190, 186, 218],   # Periwinkle
        "Lingual": [251, 128, 114],     # Salmon
        "Fusiform": [128, 177, 211],    # Steel blue
        "Paracentral": [253, 180, 98],  # Peach
        "Parahippocampal": [179, 222, 105], # Lime
        # Non-cortical / special
        "Unknown": [180, 180, 180],     # Gray
        "White-Matter": [200, 200, 200],# Light gray
        "Intersection": [120, 120, 120],# Dark gray
    }


# =============================================================================
# 3. Electrode metadata extraction
# =============================================================================
def prepare_electrodes(output_dir: str):
    """
    Extract electrode metadata from all subjects' parcellation CSV files.
    
    Exports electrode name, subject, channel, MNI position, fsaverage position,
    ROI label, hemisphere, and atlas label for each electrode.
    """
    print("\n=== Preparing electrode metadata ===")
    
    parcellation_root = os.path.join(BIDS_ROOT, "derivatives", "parcellation")
    
    # Discover all subjects
    subjects = sorted([
        d.replace("sub-", "") 
        for d in os.listdir(parcellation_root) 
        if d.startswith("sub-")
    ])
    print(f"  Found {len(subjects)} subjects: {subjects}")
    
    # Load a2009s mapping for gross label lookup (skip comment lines)
    a2009s_df = pd.read_csv(A2009S_CSV, comment='#').dropna(subset=['gross_label', 'atlas_label'])
    atlas_to_gross = {}
    for _, row in a2009s_df.iterrows():
        atlas_to_gross[row["atlas_label"]] = row["gross_label"]
    
    all_electrodes = []
    recon_dir = RECON_DIR
    
    for subject in tqdm(subjects, desc="Loading electrode metadata"):
        parc_path = os.path.join(
            parcellation_root, f"sub-{subject}", REFERENCE,
            f"sub-{subject}_proc-3mm_aparc2009s.csv"
        )
        
        if not os.path.exists(parc_path):
            print(f"  Warning: No parcellation file for {subject}")
            continue
        
        parc_df = pd.read_csv(parc_path)
        
        for _, row in parc_df.iterrows():
            ch_name = str(row["name"])  # e.g., "D0024_LOF1"
            
            # Parse channel name
            if "_" in ch_name:
                ch_subject, ch_channel = ch_name.split("_", 1)
            else:
                ch_subject = subject
                ch_channel = ch_name
            
            # MNI coordinates (meters)
            x_mni = float(row["x"]) if pd.notna(row["x"]) else None
            y_mni = float(row["y"]) if pd.notna(row["y"]) else None
            z_mni = float(row["z"]) if pd.notna(row["z"]) else None
            
            # ROI and hemisphere (derive from x coordinate)
            roi = str(row["roi"]) if pd.notna(row.get("roi")) else "Unknown"
            if x_mni is not None:
                hemi = "L" if x_mni <= 0 else "R"
            else:
                hemi = str(row["hemi"]) if pd.notna(row.get("hemi")) else "Unknown"
            
            # Atlas label (center column)
            atlas_label = str(row["center"]) if pd.notna(row.get("center")) else "Unknown"
            
            # Gross label with hemisphere
            gross_label = atlas_to_gross.get(atlas_label, roi)
            
            # fsaverage positions will be computed via talairach transform below
            electrode = {
                "name": f"{subject}_{ch_channel}",
                "subject": subject,
                "channel": ch_channel,
                "x_mni": round(x_mni, 8) if x_mni is not None else None,
                "y_mni": round(y_mni, 8) if y_mni is not None else None,
                "z_mni": round(z_mni, 8) if z_mni is not None else None,
                "x_fs": None,
                "y_fs": None,
                "z_fs": None,
                "roi": roi,
                "hemi": hemi,
                "atlas_label": atlas_label,
            }
            all_electrodes.append(electrode)
    
    # Compute fsaverage positions using FreeSurfer talairach transform
    print("  Computing fsaverage positions via talairach transform...")
    _compute_and_attach_fsaverage_positions(all_electrodes, recon_dir)
    n_with_fs = sum(1 for e in all_electrodes if e["x_fs"] is not None)
    print(f"  Fsaverage positions computed for {n_with_fs}/{len(all_electrodes)} electrodes")
    
    # Compute summary statistics
    subjects_list = sorted(set(e["subject"] for e in all_electrodes))
    rois_list = sorted(set(e["roi"] for e in all_electrodes))
    roi_counts = {}
    for e in all_electrodes:
        roi_counts[e["roi"]] = roi_counts.get(e["roi"], 0) + 1
    subject_counts = {}
    for e in all_electrodes:
        subject_counts[e["subject"]] = subject_counts.get(e["subject"], 0) + 1
    
    electrodes_data = {
        "electrodes": all_electrodes,
        "subjects": subjects_list,
        "rois": rois_list,
        "roi_counts": roi_counts,
        "subject_counts": subject_counts,
        "n_total": len(all_electrodes),
    }
    
    save_json(electrodes_data, os.path.join(output_dir, "electrodes.json"), compact=True)
    print(f"  Total: {len(all_electrodes)} electrodes from {len(subjects_list)} subjects")


def _compute_and_attach_fsaverage_positions(electrodes: List[dict], recon_dir: str):
    """
    Compute fsaverage MRI space positions for all electrodes using MNE transforms.
    
    For each subject, tries to load the talairach.xfm from the FreeSurfer recon
    directory (recon_dir/{sub_id}/mri/transforms/talairach.xfm). If the transform
    is available, applies it to convert subject-native ACPC coordinates to
    fsaverage surface RAS coordinates.
    
    For subjects without FreeSurfer reconstructions, falls back to a naive
    approximation (ACPC meters * 1000 -> mm), which is reasonable but not exact.
    
    Attaches x_fs, y_fs, z_fs (mm) to each electrode dict.
    """
    import re
    from ieeg.viz.mri import force2frame
    
    # Group by subject
    by_subject = {}
    for i, e in enumerate(electrodes):
        subj = e["subject"]
        if subj not in by_subject:
            by_subject[subj] = []
        by_subject[subj].append((i, e))
    
    n_transformed = 0
    n_fallback = 0
    fallback_subjects = []
    
    for subject, elec_list in by_subject.items():
        # Convert subject ID format (D0024 -> D24) for FreeSurfer lookup
        sub_id = re.sub(r'^D0+', 'D', subject)
        
        # Try to load the talairach transform
        trans = None
        try:
            to_fsaverage = mne.read_talxfm(sub_id, recon_dir)
            trans = mne.transforms.Transform(
                fro='head', to='mri', trans=to_fsaverage['trans']
            )
        except Exception:
            pass  # Will use fallback below
        
        if trans is not None:
            # --- Proper transform via talairach.xfm ---
            ch_pos = {}
            idx_map = {}
            for idx, elec in elec_list:
                if elec["x_mni"] is not None:
                    ch_pos[elec["channel"]] = np.array([
                        elec["x_mni"], elec["y_mni"], elec["z_mni"]
                    ])
                    idx_map[elec["channel"]] = idx
            
            if ch_pos:
                try:
                    montage = mne.channels.make_dig_montage(
                        ch_pos=ch_pos, coord_frame='head'
                    )
                    force2frame(montage, trans.from_str)
                    montage.apply_trans(trans)
                    
                    transformed_pos = montage.get_positions()['ch_pos']
                    for ch_name, idx in idx_map.items():
                        if ch_name in transformed_pos:
                            pos_mm = transformed_pos[ch_name] * 1000
                            electrodes[idx]["x_fs"] = round(float(pos_mm[0]), 2)
                            electrodes[idx]["y_fs"] = round(float(pos_mm[1]), 2)
                            electrodes[idx]["z_fs"] = round(float(pos_mm[2]), 2)
                            n_transformed += 1
                except Exception as e:
                    warnings.warn(f"Transform failed for {subject}: {e}")
                    # Fall through to fallback for this subject's electrodes
                    trans = None  # Force fallback below
        
        if trans is None:
            # --- Fallback: naive ACPC meters -> mm ---
            # This approximates fsaverage surface RAS when no talairach.xfm
            # is available. For fsaverage, c_ras=[0,0,0] so MNI mm ≈ surface RAS.
            fallback_subjects.append(subject)
            for idx, elec in elec_list:
                if elec["x_mni"] is not None:
                    elec["x_fs"] = round(elec["x_mni"] * 1000, 2)
                    elec["y_fs"] = round(elec["y_mni"] * 1000, 2)
                    elec["z_fs"] = round(elec["z_mni"] * 1000, 2)
                    n_fallback += 1
    
    print(f"    {n_transformed} electrodes transformed via talairach.xfm")
    print(f"    {n_fallback} electrodes using ACPC->mm fallback (no recon available)")
    if fallback_subjects:
        print(f"    Subjects without talairach.xfm ({len(fallback_subjects)}): {fallback_subjects}")


# =============================================================================
# 4. Epoch loading helpers
# =============================================================================
_ERROR_TAGS = {'RESP_ERR', 'LATE_RESP'}


def _discover_subjects() -> List[str]:
    """Discover available subjects in the derivatives directory."""
    subjects = []
    if os.path.exists(DERIVATIVES_ROOT):
        for item in os.listdir(DERIVATIVES_ROOT):
            if item.startswith('sub-'):
                subjects.append(item.replace('sub-', ''))
    return sorted(subjects)


def _load_zscore_epoch(subject: str, phase: str, condition: str):
    """
    Load a zscore epoch for a single subject/phase/condition.
    Returns mne.Epochs or None. Filters error trials.
    """
    bids_path = BIDSPath(
        root=DERIVATIVES_ROOT,
        subject=subject,
        datatype='epoch(band)(zscore)',
        task=TASK,
        processing=phase,
        description=condition,
        suffix=BAND,
        check=False,
    )
    matches = bids_path.match()
    if not matches:
        return None
    try:
        epoch = mne.read_epochs(matches[0].fpath, verbose=False)
        # Filter error trials
        if (epoch.metadata is not None
                and 'resp_annotation' in epoch.metadata.columns):
            keep = epoch.metadata['resp_annotation'].apply(
                lambda x: not _ERROR_TAGS.intersection(x)
                if isinstance(x, (list, tuple, set)) else True
            )
            epoch = epoch[keep.values]
        if len(epoch) == 0:
            return None
        return epoch
    except Exception as e:
        warnings.warn(f"Could not load zscore epoch {subject}/{phase}/{condition}: {e}")
        return None


def _load_statistics_sig(subject: str, phase: str, condition: Optional[str] = None,
                         direction: Optional[str] = None,
                         diff_type: Optional[str] = None) -> Optional[List[str]]:
    """
    Load sig_ch_names from a statistics H5 file.
    Returns a list of significant channel names, or None.
    """
    h5_path = _get_statistics_h5_path(subject, phase, condition, direction, diff_type)
    if h5_path is None or not os.path.exists(h5_path):
        return None
    try:
        with h5py.File(h5_path, 'r') as f:
            if 'sig_ch_names' in f:
                return [
                    n.decode('utf-8') if isinstance(n, bytes) else str(n)
                    for n in f['sig_ch_names'][:]
                ]
    except Exception as e:
        warnings.warn(f"Could not load statistics from {h5_path}: {e}")
    return None


def _load_statistics_mask(subject: str, phase: str, condition: Optional[str] = None,
                          direction: Optional[str] = None,
                          diff_type: Optional[str] = None
                          ) -> Optional[Tuple[List[str], np.ndarray, Optional[np.ndarray]]]:
    """
    Load mask, ch_names and (when present) the mask time axis from a statistics
    H5 file. Returns (ch_names, mask, times) or None. ``times`` is None when the
    file does not store a time axis (older statistics).
    """
    h5_path = _get_statistics_h5_path(subject, phase, condition, direction, diff_type)
    if h5_path is None or not os.path.exists(h5_path):
        return None
    try:
        with h5py.File(h5_path, 'r') as f:
            ch_names = [
                n.decode('utf-8') if isinstance(n, bytes) else str(n)
                for n in f['ch_names'][:]
            ]
            mask = f['mask'][:]
            stat_times = f['times'][:] if 'times' in f else None
            return ch_names, mask, stat_times
    except Exception as e:
        warnings.warn(f"Could not load statistics mask from {h5_path}: {e}")
    return None


def _get_statistics_h5_path(subject: str, phase: str,
                            condition: Optional[str] = None,
                            direction: Optional[str] = None,
                            diff_type: Optional[str] = None) -> Optional[str]:
    """Construct the path to a statistics H5 file."""
    if diff_type is None:
        # Non-diff: statistics/sub-{subject}/car/...
        stat_dir = os.path.join(STATISTICS_ROOT, f'sub-{subject}', REFERENCE)
        filename = f'sub-{subject}_task-{TASK}_proc-{phase}_desc-{condition}_{BAND}.h5'
    else:
        stat_dir = os.path.join(STATISTICS_ROOT, f'sub-{subject}', f'{REFERENCE}(diff)')
        # Map frontend diff_type name to backend recording type
        rec_type = DIFF_TYPES[diff_type].get('stats_rec_type', diff_type)
        if diff_type == 'condition':
            filename = (f'sub-{subject}_task-{TASK}_proc-{phase}'
                        f'_space-{direction}_rec-condition_{BAND}.h5')
        else:
            filename = (f'sub-{subject}_task-{TASK}_proc-{phase}'
                        f'_space-{direction}_rec-{rec_type}'
                        f'_desc-{condition}_{BAND}.h5')
    return os.path.join(stat_dir, filename)


def _build_sig_channels(subjects: List[str], all_ch_names: List[str],
                        phase: str, condition: Optional[str] = None,
                        direction: Optional[str] = None,
                        diff_type: Optional[str] = None) -> List[str]:
    """
    Build a list of significant channel names by loading statistics
    for each subject and collecting sig_ch_names.
    """
    sig_set = set()
    seen_subjects = set()
    for ch in all_ch_names:
        subj = ch.split('_', 1)[0]
        if subj in seen_subjects:
            continue
        seen_subjects.add(subj)
        sig_names = _load_statistics_sig(subj, phase, condition, direction, diff_type)
        if sig_names:
            sig_set.update(sig_names)
    return sorted(sig_set)


def _build_sig_mask(all_ch_names: List[str], n_times: int,
                    phase: str, condition: Optional[str] = None,
                    direction: Optional[str] = None,
                    diff_type: Optional[str] = None,
                    times: Optional[np.ndarray] = None) -> Optional[np.ndarray]:
    """
    Build a significance mask aligned with all_ch_names.
    Returns (n_electrodes, n_times) mask, or None if no stats available.

    Each statistics H5 mask is aligned onto the full epoch time axis using the
    file's own stored ``times``: newer statistics store a full-length,
    epoch-aligned mask (offset 0), while older statistics store a mask cropped
    to a per-phase window, whose ``times`` place it at the correct offset. When
    a file stores no time axis, the legacy per-phase ``stat_windows`` fallback
    is used (Cue/Stimulus: [0, 0.75], Response: [-0.5, 0.5]).
    """
    n_electrodes = len(all_ch_names)
    combined_mask = np.zeros((n_electrodes, n_times), dtype=np.int64)
    any_loaded = False

    # Legacy fallback windows, used only when a statistics H5 file has no
    # stored time axis to align against.
    stat_windows = {
        'Cue':      (0.0, 0.75),
        'Stimulus': (0.0, 0.75),
        'Delay':    (0.0, 0.5),
        'Response': (-0.5, 0.5),
    }

    # Group channels by subject
    subject_channels = {}
    for i, ch in enumerate(all_ch_names):
        subj = ch.split('_', 1)[0]
        if subj not in subject_channels:
            subject_channels[subj] = []
        subject_channels[subj].append((ch, i))

    for subj, ch_list in subject_channels.items():
        result = _load_statistics_mask(subj, phase, condition, direction, diff_type)
        if result is None:
            continue
        h5_ch_names, h5_mask, stat_times = result
        h5_ch_to_idx = {name: idx for idx, name in enumerate(h5_ch_names)}

        # Align this file's mask onto the full epoch time axis:
        #  - if the file stores its own time axis, align precisely by it;
        #  - else a full-length mask (mask_len == n_times) is already epoch-aligned
        #    (offset 0) — this covers the diff statistics, which store a full mask
        #    but no time axis;
        #  - else (a genuinely cropped mask with no time axis) fall back to the
        #    legacy per-phase window.
        mask_len = h5_mask.shape[1]
        offset = 0
        if times is not None and stat_times is not None and len(stat_times):
            offset = int(np.searchsorted(times, float(stat_times[0])))
        elif times is not None and mask_len < n_times and phase in stat_windows:
            offset = int(np.searchsorted(times, stat_windows[phase][0]))
        offset = max(0, offset)

        for ch_name, global_idx in ch_list:
            if ch_name in h5_ch_to_idx:
                h5_idx = h5_ch_to_idx[ch_name]
                end = min(offset + mask_len, n_times)
                n_copy = end - offset
                combined_mask[global_idx, offset:end] = h5_mask[h5_idx, :n_copy]
                any_loaded = True

    return combined_mask if any_loaded else None


def _load_stim_properties() -> dict:
    """Load stim_properties.json which maps tokens to lexicality/neighborhood."""
    with open(STIM_PROPERTIES_PATH, 'r') as f:
        return json.load(f)


def _prefix_ch_names(ch_names: List[str], subject: str) -> List[str]:
    """Prefix channel names with subject ID if not already prefixed."""
    out = []
    for ch in ch_names:
        if ch.startswith(f"{subject}_"):
            out.append(ch)
        else:
            out.append(f"{subject}_{ch}")
    return out


# =============================================================================
# 4a. HGA zscore data export
# =============================================================================
def prepare_hga_zscore_data(output_dir: str):
    """
    Export HGA zscore data for all phase/condition combinations.
    Loads epochs directly, computes per-electrode mean and trial-level SEM,
    and includes significance info from statistics H5 files.
    """
    print("\n=== Preparing HGA zscore data ===")

    zscore_dir = os.path.join(output_dir, "zscore")
    os.makedirs(zscore_dir, exist_ok=True)

    subjects = _discover_subjects()
    print(f"  Found {len(subjects)} subjects")

    for phase in PHASES:
        for condition in CONDITIONS:
            print(f"  Processing zscore {phase}/{condition}...")

            all_means = []
            all_sems = []
            all_n_trials = []
            all_ch_names = []
            times = None
            sfreq = None

            for subject in tqdm(subjects, desc=f'    {phase}/{condition}', leave=False):
                epoch = _load_zscore_epoch(subject, phase, condition)
                if epoch is None:
                    continue

                epoch_data = epoch._data  # (n_trials, n_ch, n_times)
                n_trials = epoch_data.shape[0]

                # Compute mean and SEM across trials
                data_mean = np.nanmean(epoch_data, axis=0)  # (n_ch, n_times)
                data_std = np.nanstd(epoch_data, axis=0, ddof=1)  # (n_ch, n_times)
                data_sem = data_std / np.sqrt(n_trials)  # (n_ch, n_times)

                if times is None:
                    times = epoch.times
                    sfreq = epoch.info['sfreq']

                ch_names = _prefix_ch_names(epoch.ch_names, subject)

                all_means.append(data_mean)
                all_sems.append(data_sem)
                all_n_trials.extend([n_trials] * len(ch_names))
                all_ch_names.extend(ch_names)

            if not all_means:
                print(f"    Warning: No data for {phase}/{condition}")
                continue

            concat_mean = np.concatenate(all_means, axis=0)
            concat_sem = np.concatenate(all_sems, axis=0)
            n_electrodes = concat_mean.shape[0]
            n_times = concat_mean.shape[1]

            # Load significance from statistics
            sig_channels = _build_sig_channels(
                subjects, all_ch_names, phase, condition=condition
            )
            mask = _build_sig_mask(
                all_ch_names, n_times, phase, condition=condition,
                times=times
            )

            zscore_data = {
                "phase": phase,
                "condition": condition,
                "times": np.round(times, 4).tolist(),
                "sfreq": float(sfreq),
                "channel_names": all_ch_names,
                "n_electrodes": n_electrodes,
                "n_times": n_times,
                "data": _compress_array(concat_mean),
                "trial_sem": _compress_array(concat_sem),
                "n_trials": all_n_trials,
                "sig_channels": sig_channels,
                "mask": mask.tolist() if mask is not None else None,
            }

            filename = f"{phase}_{condition}.json"
            save_json(zscore_data, os.path.join(zscore_dir, filename))

    print(f"  Zscore data export complete")


# =============================================================================
# 4b. HGA diff data export (computed from zscore epochs)
# =============================================================================
def prepare_hga_diff_data(output_dir: str):
    """
    Export HGA difference data computed from zscore epochs.
    Supports condition, lexicality, and neighborhood diff types.
    """
    print("\n=== Preparing HGA diff data ===")

    diff_dir = os.path.join(output_dir, "diff")
    os.makedirs(diff_dir, exist_ok=True)

    subjects = _discover_subjects()
    stim_props = _load_stim_properties()

    for diff_type, config in DIFF_TYPES.items():
        print(f"  Processing diff type: {diff_type}")
        type_dir = os.path.join(diff_dir, diff_type)
        os.makedirs(type_dir, exist_ok=True)

        # Dispatch by the trial-splitting map present in the config, so several
        # diff types can share one code path when they have the same shape. The
        # UP task's lexicality / lexicalityEarly / lexicalityLate all split trials
        # by Word vs Nonword and differ only in which precomputed significance
        # statistics they read (via ``stats_rec_type``); passing ``diff_type``
        # through keeps their output folder, JSON ``diff_type`` field and stats
        # lookup aligned.
        if 'condition_map' in config:
            _prepare_condition_diff(subjects, config, type_dir, diff_type)
        elif 'stim_type_map' in config:
            _prepare_lexicality_diff(subjects, config, type_dir, diff_type)
        elif 'neighborhood_map' in config:
            _prepare_neighborhood_diff(subjects, config, stim_props, type_dir, diff_type)
        else:
            print(f"    Warning: unknown diff-type shape for '{diff_type}', skipping")

    print(f"  Diff data export complete")


def _prepare_condition_diff(subjects: List[str], config: dict, type_dir: str,
                            diff_type: str = 'condition'):
    """
    Condition diff: compute from zscore epochs of two conditions.
    No condition dimension — just phase × direction.

    A ``phases`` key in the diff-type config restricts the exported phases
    (defaults to all configured PHASES).
    """
    for phase in config.get("phases", PHASES):
        for direction in config["directions"]:
            act_cond, bsl_cond = config["condition_map"][direction]
            print(f"    {phase}/{direction} ({act_cond} vs {bsl_cond})")

            all_data_act = []
            all_data_bsl = []
            all_sem_act = []
            all_sem_bsl = []
            all_n_act = []
            all_n_bsl = []
            all_ch_names = []
            times = None
            sfreq = None

            for subject in tqdm(subjects, desc=f'      {direction}', leave=False):
                epoch_act = _load_zscore_epoch(subject, phase, act_cond)
                epoch_bsl = _load_zscore_epoch(subject, phase, bsl_cond)
                if epoch_act is None or epoch_bsl is None:
                    continue

                # Use intersection of channels
                ch_act = set(epoch_act.ch_names)
                ch_bsl = set(epoch_bsl.ch_names)
                common_ch = sorted(ch_act & ch_bsl)
                if not common_ch:
                    continue

                act_idx = [epoch_act.ch_names.index(c) for c in common_ch]
                bsl_idx = [epoch_bsl.ch_names.index(c) for c in common_ch]

                act_data = epoch_act._data[:, act_idx, :]  # (n_trials, n_ch, n_times)
                bsl_data = epoch_bsl._data[:, bsl_idx, :]

                n_act = act_data.shape[0]
                n_bsl = bsl_data.shape[0]

                mean_act = np.nanmean(act_data, axis=0)
                mean_bsl = np.nanmean(bsl_data, axis=0)
                sem_act = np.nanstd(act_data, axis=0, ddof=1) / np.sqrt(n_act)
                sem_bsl = np.nanstd(bsl_data, axis=0, ddof=1) / np.sqrt(n_bsl)

                if times is None:
                    times = epoch_act.times
                    sfreq = epoch_act.info['sfreq']

                ch_names = _prefix_ch_names(common_ch, subject)

                all_data_act.append(mean_act)
                all_data_bsl.append(mean_bsl)
                all_sem_act.append(sem_act)
                all_sem_bsl.append(sem_bsl)
                all_n_act.extend([n_act] * len(common_ch))
                all_n_bsl.extend([n_bsl] * len(common_ch))
                all_ch_names.extend(ch_names)

            if not all_data_act:
                continue

            concat_act = np.concatenate(all_data_act, axis=0)
            concat_bsl = np.concatenate(all_data_bsl, axis=0)
            concat_diff = concat_act - concat_bsl
            concat_sem_act = np.concatenate(all_sem_act, axis=0)
            concat_sem_bsl = np.concatenate(all_sem_bsl, axis=0)
            concat_sem_diff = np.sqrt(concat_sem_act**2 + concat_sem_bsl**2)
            n_electrodes = concat_act.shape[0]
            n_times = concat_act.shape[1]

            sig_channels = _build_sig_channels(
                subjects, all_ch_names, phase,
                direction=direction, diff_type=diff_type
            )
            mask = _build_sig_mask(
                all_ch_names, n_times, phase,
                direction=direction, diff_type=diff_type,
                times=times
            )

            diff_data = {
                "phase": phase,
                "condition": None,
                "diff_type": diff_type,
                "direction": direction,
                "times": np.round(times, 4).tolist(),
                "sfreq": float(sfreq),
                "channel_names": all_ch_names,
                "n_electrodes": n_electrodes,
                "n_times": n_times,
                "data_act": _compress_array(concat_act),
                "data_bsl": _compress_array(concat_bsl),
                "data_diff": _compress_array(concat_diff),
                "trial_sem_act": _compress_array(concat_sem_act),
                "trial_sem_bsl": _compress_array(concat_sem_bsl),
                "trial_sem_diff": _compress_array(concat_sem_diff),
                "n_trials_act": all_n_act,
                "n_trials_bsl": all_n_bsl,
                "sig_channels": sig_channels,
                "mask": mask.tolist() if mask is not None else None,
            }

            filename = f"{direction}_{phase}.json"
            save_json(diff_data, os.path.join(type_dir, filename))


def _prepare_lexicality_diff(subjects: List[str], config: dict, type_dir: str,
                             diff_type: str = 'lexicality'):
    """
    Lexicality diff: split zscore trials by stim_type (Word/Nonword),
    compute group means and difference. Has condition dimension.

    Shared by every diff type whose config carries a ``stim_type_map`` — the UP
    task defines ``lexicality``, ``lexicalityEarly`` and ``lexicalityLate`` this
    way. The Word-vs-Nonword waveforms are identical across them; they differ
    only in which precomputed significance statistics are read, selected by the
    diff type's ``stats_rec_type`` (see ``_get_statistics_h5_path``). ``diff_type``
    therefore drives the stats lookup and the ``diff_type`` field written to each
    JSON.

    A ``phases`` key in the diff-type config restricts which phases are exported
    (e.g. lexicality is undefined pre-stimulus, so UP omits Cue). Defaults to all
    configured PHASES.
    """
    for phase in config.get("phases", PHASES):
        for condition in CONDITIONS:
            for direction in config["directions"]:
                act_stim, bsl_stim = config["stim_type_map"][direction]
                print(f"    {phase}/{condition}/{direction} ({act_stim} vs {bsl_stim})")

                all_data_act = []
                all_data_bsl = []
                all_sem_act = []
                all_sem_bsl = []
                all_n_act = []
                all_n_bsl = []
                all_ch_names = []
                times = None
                sfreq = None

                for subject in tqdm(subjects, desc=f'      {direction}', leave=False):
                    epoch = _load_zscore_epoch(subject, phase, condition)
                    if epoch is None:
                        continue
                    if epoch.metadata is None or 'stim_type' not in epoch.metadata.columns:
                        continue

                    # Split trials by stim_type
                    act_mask = epoch.metadata['stim_type'].values == act_stim
                    bsl_mask = epoch.metadata['stim_type'].values == bsl_stim

                    if act_mask.sum() == 0 or bsl_mask.sum() == 0:
                        continue

                    act_data = epoch._data[act_mask]  # (n_act, n_ch, n_times)
                    bsl_data = epoch._data[bsl_mask]  # (n_bsl, n_ch, n_times)

                    n_act = act_data.shape[0]
                    n_bsl = bsl_data.shape[0]

                    mean_act = np.nanmean(act_data, axis=0)
                    mean_bsl = np.nanmean(bsl_data, axis=0)
                    sem_act = np.nanstd(act_data, axis=0, ddof=1) / np.sqrt(n_act)
                    sem_bsl = np.nanstd(bsl_data, axis=0, ddof=1) / np.sqrt(n_bsl)

                    if times is None:
                        times = epoch.times
                        sfreq = epoch.info['sfreq']

                    ch_names = _prefix_ch_names(epoch.ch_names, subject)

                    all_data_act.append(mean_act)
                    all_data_bsl.append(mean_bsl)
                    all_sem_act.append(sem_act)
                    all_sem_bsl.append(sem_bsl)
                    all_n_act.extend([n_act] * len(ch_names))
                    all_n_bsl.extend([n_bsl] * len(ch_names))
                    all_ch_names.extend(ch_names)

                if not all_data_act:
                    continue

                concat_act = np.concatenate(all_data_act, axis=0)
                concat_bsl = np.concatenate(all_data_bsl, axis=0)
                concat_diff = concat_act - concat_bsl
                concat_sem_act = np.concatenate(all_sem_act, axis=0)
                concat_sem_bsl = np.concatenate(all_sem_bsl, axis=0)
                concat_sem_diff = np.sqrt(concat_sem_act**2 + concat_sem_bsl**2)
                n_electrodes = concat_act.shape[0]
                n_times = concat_act.shape[1]

                sig_channels = _build_sig_channels(
                    subjects, all_ch_names, phase,
                    condition=condition, direction=direction,
                    diff_type=diff_type
                )
                mask = _build_sig_mask(
                    all_ch_names, n_times, phase,
                    condition=condition, direction=direction,
                    diff_type=diff_type, times=times
                )

                diff_data = {
                    "phase": phase,
                    "condition": condition,
                    "diff_type": diff_type,
                    "direction": direction,
                    "times": np.round(times, 4).tolist(),
                    "sfreq": float(sfreq),
                    "channel_names": all_ch_names,
                    "n_electrodes": n_electrodes,
                    "n_times": n_times,
                    "data_act": _compress_array(concat_act),
                    "data_bsl": _compress_array(concat_bsl),
                    "data_diff": _compress_array(concat_diff),
                    "trial_sem_act": _compress_array(concat_sem_act),
                    "trial_sem_bsl": _compress_array(concat_sem_bsl),
                    "trial_sem_diff": _compress_array(concat_sem_diff),
                    "n_trials_act": all_n_act,
                    "n_trials_bsl": all_n_bsl,
                    "sig_channels": sig_channels,
                    "mask": mask.tolist() if mask is not None else None,
                }

                filename = f"{direction}_{phase}_{condition}.json"
                save_json(diff_data, os.path.join(type_dir, filename))


def _prepare_neighborhood_diff(subjects: List[str], config: dict,
                               stim_props: dict, type_dir: str,
                               diff_type: str = 'neighborhood'):
    """
    Neighborhood diff: split trials by neighborhood density
    (High/Low) using stim_properties.json. Has condition dimension.
    Same structure as lexicality diff — ready for future data.
    """
    # Build token -> neighborhood lookup from stim_properties
    token_to_neighborhood = {}
    for token, props in stim_props.items():
        if 'neighborhood' in props:
            token_to_neighborhood[token] = props['neighborhood']

    if not token_to_neighborhood:
        print("    Warning: No neighborhood info in stim_properties.json, skipping")
        return

    # A ``phases`` key in the diff-type config restricts the exported phases
    # (defaults to all configured PHASES).
    for phase in config.get("phases", PHASES):
        for condition in CONDITIONS:
            for direction in config["directions"]:
                act_group, bsl_group = config["neighborhood_map"][direction]
                print(f"    {phase}/{condition}/{direction} ({act_group} vs {bsl_group})")

                all_data_act = []
                all_data_bsl = []
                all_sem_act = []
                all_sem_bsl = []
                all_n_act = []
                all_n_bsl = []
                all_ch_names = []
                times = None
                sfreq = None

                for subject in tqdm(subjects, desc=f'      {direction}', leave=False):
                    epoch = _load_zscore_epoch(subject, phase, condition)
                    if epoch is None:
                        continue

                    # Get token for each trial via event_id reverse lookup
                    event_id_rev = {v: k for k, v in epoch.event_id.items()}
                    trial_events = epoch.events[:, 2]
                    trial_tokens = [event_id_rev.get(e, None) for e in trial_events]

                    # Classify by neighborhood density
                    act_mask = np.array([
                        token_to_neighborhood.get(t) == act_group
                        if t is not None else False
                        for t in trial_tokens
                    ])
                    bsl_mask = np.array([
                        token_to_neighborhood.get(t) == bsl_group
                        if t is not None else False
                        for t in trial_tokens
                    ])

                    if act_mask.sum() == 0 or bsl_mask.sum() == 0:
                        continue

                    act_data = epoch._data[act_mask]
                    bsl_data = epoch._data[bsl_mask]

                    n_act = act_data.shape[0]
                    n_bsl = bsl_data.shape[0]

                    mean_act = np.nanmean(act_data, axis=0)
                    mean_bsl = np.nanmean(bsl_data, axis=0)
                    sem_act = np.nanstd(act_data, axis=0, ddof=1) / np.sqrt(n_act)
                    sem_bsl = np.nanstd(bsl_data, axis=0, ddof=1) / np.sqrt(n_bsl)

                    if times is None:
                        times = epoch.times
                        sfreq = epoch.info['sfreq']

                    ch_names = _prefix_ch_names(epoch.ch_names, subject)

                    all_data_act.append(mean_act)
                    all_data_bsl.append(mean_bsl)
                    all_sem_act.append(sem_act)
                    all_sem_bsl.append(sem_bsl)
                    all_n_act.extend([n_act] * len(ch_names))
                    all_n_bsl.extend([n_bsl] * len(ch_names))
                    all_ch_names.extend(ch_names)

                if not all_data_act:
                    continue

                concat_act = np.concatenate(all_data_act, axis=0)
                concat_bsl = np.concatenate(all_data_bsl, axis=0)
                concat_diff = concat_act - concat_bsl
                concat_sem_act = np.concatenate(all_sem_act, axis=0)
                concat_sem_bsl = np.concatenate(all_sem_bsl, axis=0)
                concat_sem_diff = np.sqrt(concat_sem_act**2 + concat_sem_bsl**2)
                n_electrodes = concat_act.shape[0]
                n_times_val = concat_act.shape[1]

                sig_channels = _build_sig_channels(
                    subjects, all_ch_names, phase,
                    condition=condition, direction=direction,
                    diff_type=diff_type
                )
                mask = _build_sig_mask(
                    all_ch_names, n_times_val, phase,
                    condition=condition, direction=direction,
                    diff_type=diff_type, times=times
                )

                diff_data = {
                    "phase": phase,
                    "condition": condition,
                    "diff_type": diff_type,
                    "direction": direction,
                    "times": np.round(times, 4).tolist(),
                    "sfreq": float(sfreq),
                    "channel_names": all_ch_names,
                    "n_electrodes": n_electrodes,
                    "n_times": n_times_val,
                    "data_act": _compress_array(concat_act),
                    "data_bsl": _compress_array(concat_bsl),
                    "data_diff": _compress_array(concat_diff),
                    "trial_sem_act": _compress_array(concat_sem_act),
                    "trial_sem_bsl": _compress_array(concat_sem_bsl),
                    "trial_sem_diff": _compress_array(concat_sem_diff),
                    "n_trials_act": all_n_act,
                    "n_trials_bsl": all_n_bsl,
                    "sig_channels": sig_channels,
                    "mask": mask.tolist() if mask is not None else None,
                }

                filename = f"{direction}_{phase}_{condition}.json"
                save_json(diff_data, os.path.join(type_dir, filename))


def _compress_array(arr: np.ndarray, decimals: int = 4) -> list:
    """
    Compress a numpy array for JSON export.
    Rounds to specified decimals and converts NaN to null.
    """
    rounded = np.round(arr, decimals)
    # Replace NaN with None for JSON compatibility
    result = []
    for row in rounded:
        row_list = []
        for val in row:
            if np.isnan(val) or np.isinf(val):
                row_list.append(None)
            else:
                row_list.append(round(float(val), decimals))
        result.append(row_list)
    return result


# =============================================================================
# 5. Metadata summary
# =============================================================================
def prepare_metadata(output_dir: str):
    """
    Export metadata summary file with available data keys,
    configuration, and viewer settings.
    """
    print("\n=== Preparing metadata ===")
    
    # Collect available data per reference
    available_data = {}
    for ref in REFERENCES:
        ref_dir = os.path.join(output_dir, ref)
        zscore_files = []
        zscore_dir = os.path.join(ref_dir, "zscore")
        if os.path.exists(zscore_dir):
            zscore_files = sorted([f for f in os.listdir(zscore_dir) if f.endswith('.json')])
        
        diff_files = {}
        diff_dir = os.path.join(ref_dir, "diff")
        if os.path.exists(diff_dir):
            for dtype in os.listdir(diff_dir):
                dtype_dir = os.path.join(diff_dir, dtype)
                if os.path.isdir(dtype_dir):
                    diff_files[dtype] = sorted([
                        f for f in os.listdir(dtype_dir) if f.endswith('.json')
                    ])
        
        available_data[ref] = {
            "zscore": zscore_files,
            "diff": diff_files,
        }
    
    metadata = {
        "version": "3.0",
        "generated_by": "prepare_data.py",
        "task": TASK,
        "band": BAND,
        "references": REFERENCES,
        "reference": REFERENCES[0],
        "phases": PHASES,
        "conditions": CONDITIONS,
        "diff_types": {
            dt: {
                "directions": cfg["directions"],
                "needs_condition": cfg["needs_condition"],
            }
            for dt, cfg in DIFF_TYPES.items()
        },
        "available_data": available_data,
    }
    
    save_json(metadata, os.path.join(output_dir, "metadata.json"), compact=False)


# =============================================================================
# Main
# =============================================================================
def main():
    parser = argparse.ArgumentParser(description="Prepare data for Brain Viewer")
    parser.add_argument(
        "--output-dir", "-o",
        default=os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "brain_viewer_data"
        ),
        help="Output directory for viewer data (default: ../../brain_viewer_data)"
    )
    parser.add_argument(
        "--config", type=str, default=DEFAULT_CONFIG_PATH,
        help="Path to JSON config file (default: %(default)s)"
    )
    parser.add_argument(
        "--skip-mesh", action="store_true",
        help="Skip brain mesh generation"
    )
    parser.add_argument(
        "--skip-atlas", action="store_true",
        help="Skip ROI atlas generation"
    )
    parser.add_argument(
        "--skip-electrodes", action="store_true",
        help="Skip electrode metadata generation"
    )
    parser.add_argument(
        "--skip-zscore", action="store_true",
        help="Skip zscore HGA data generation"
    )
    parser.add_argument(
        "--skip-diff", action="store_true",
        help="Skip diff HGA data generation"
    )
    
    args = parser.parse_args()
    apply_config(load_config(args.config))
    output_dir = os.path.abspath(args.output_dir)
    
    print(f"Brain Viewer Data Preparation")
    print(f"=" * 50)
    print(f"BIDS root:    {BIDS_ROOT}")
    print(f"Subjects dir: {SUBJECTS_DIR}")
    print(f"Recon dir:    {RECON_DIR}")
    print(f"Config file:  {CONFIG_PATH or 'embedded defaults'}")
    print(f"Output dir:   {output_dir}")
    print(f"Task:         {TASK}")
    print(f"Band:         {BAND}")
    print(f"References:   {REFERENCES}")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Step 1: Brain mesh (shared across references)
    if not args.skip_mesh:
        prepare_brain_mesh(output_dir)
    
    # Step 2: ROI atlas (shared across references)
    if not args.skip_atlas:
        prepare_roi_atlas(output_dir)
    
    # Step 3-5: Per-reference data (electrodes, zscore, diff)
    for ref in REFERENCES:
        print(f"\n{'=' * 50}")
        print(f"Processing reference: {ref}")
        print(f"{'=' * 50}")
        set_reference(ref)
        ref_output_dir = os.path.join(output_dir, ref)
        os.makedirs(ref_output_dir, exist_ok=True)

        # Step 3: Electrode metadata
        if not args.skip_electrodes:
            prepare_electrodes(ref_output_dir)

        # Step 4: HGA zscore data
        if not args.skip_zscore:
            prepare_hga_zscore_data(ref_output_dir)

        # Step 5: HGA diff data
        if not args.skip_diff:
            prepare_hga_diff_data(ref_output_dir)
    
    # Step 6: Metadata summary (covers all references)
    prepare_metadata(output_dir)
    
    print(f"\n{'=' * 50}")
    print(f"Data preparation complete!")
    print(f"Output directory: {output_dir}")
    
    # Print total size
    total_size = 0
    for root, dirs, files in os.walk(output_dir):
        for f in files:
            total_size += os.path.getsize(os.path.join(root, f))
    print(f"Total size: {total_size / (1024*1024):.1f} MB")
    
    print(f"\nNext steps:")
    print(f"  1. Download the viewer and data to your local machine:")
    print(f"     rsync -avz user@hpc:{output_dir}/ ./brain_viewer_data/")
    print(f"  2. Open the viewer in your browser (see viewer/README)")


if __name__ == "__main__":
    main()
