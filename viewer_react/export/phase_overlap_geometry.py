"""Coordinate translation and pial projection for the phase overlap viewer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import mne
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

CVS_SUBJECT = "cvs_avg35_inMNI152"
SUBCORTICAL_LABEL_MARKERS = (
    "Hippocampus",
    "Amygdala",
    "Thalamus",
    "Putamen",
    "Caudate",
    "Pallidum",
    "Accumbens",
    "VentralDC",
    "Brain-Stem",
    "Ventricle",
    "Lat-Vent",
    "Inf-Lat-Vent",
)


@dataclass(frozen=True)
class PialSurface:
    lh_coords: np.ndarray
    rh_coords: np.ndarray
    lh_tree: cKDTree
    rh_tree: cKDTree


def compute_translation(recon_dir: Path, subject: str = CVS_SUBJECT) -> np.ndarray:
    fsavg_lh, _ = mne.read_surface(str(recon_dir / "fsaverage" / "surf" / "lh.pial"))
    cvs_lh, _ = mne.read_surface(str(recon_dir / subject / "surf" / "lh.pial"))
    return np.asarray(cvs_lh, dtype=np.float64).mean(axis=0) - np.asarray(fsavg_lh, dtype=np.float64).mean(axis=0)


def load_pial_surface(recon_dir: Path, subject: str = CVS_SUBJECT) -> PialSurface:
    lh_coords, _ = mne.read_surface(str(recon_dir / subject / "surf" / "lh.pial"))
    rh_coords, _ = mne.read_surface(str(recon_dir / subject / "surf" / "rh.pial"))
    lh_coords = np.asarray(lh_coords, dtype=np.float64)
    rh_coords = np.asarray(rh_coords, dtype=np.float64)
    return PialSurface(
        lh_coords=lh_coords,
        rh_coords=rh_coords,
        lh_tree=cKDTree(lh_coords),
        rh_tree=cKDTree(rh_coords),
    )


def should_project_to_pial(label: str, roi: str) -> bool:
    label = "" if pd.isna(label) else str(label)
    roi = "" if pd.isna(roi) else str(roi)
    if label.startswith("ctx_"):
        return True
    if label == "Intersection" or roi == "Intersection":
        return True
    lowered = label.lower()
    if any(marker.lower() in lowered for marker in SUBCORTICAL_LABEL_MARKERS):
        return False
    subcortical_rois = {"Hipp", "Amyg", "Thal", "Put", "LatV", "InfLatV", "VDC"}
    if roi in subcortical_rois:
        return False
    return False


def project_coords_to_pial(
    coords: np.ndarray,
    hemi: str,
    surface: PialSurface,
) -> tuple[np.ndarray, np.ndarray]:
    hemi = str(hemi).upper()
    if hemi == "L":
        tree = surface.lh_tree
        pial_coords = surface.lh_coords
    elif hemi == "R":
        tree = surface.rh_tree
        pial_coords = surface.rh_coords
    else:
        raise ValueError(f"Unsupported hemisphere: {hemi}")
    distances, indices = tree.query(coords)
    projected = pial_coords[np.asarray(indices, dtype=np.int64)]
    return projected, np.asarray(distances, dtype=np.float64)


def apply_coordinate_pipeline(meta: pd.DataFrame, recon_dir: Path, subject: str = CVS_SUBJECT) -> pd.DataFrame:
    meta = meta.copy()
    translation = compute_translation(recon_dir, subject=subject)
    surface = load_pial_surface(recon_dir, subject=subject)

    native = meta[["x", "y", "z"]].to_numpy(dtype=np.float64) + translation
    meta["x_native"] = native[:, 0]
    meta["y_native"] = native[:, 1]
    meta["z_native"] = native[:, 2]

    projected_mask = meta.apply(
        lambda row: should_project_to_pial(row.get("label"), row.get("roi")),
        axis=1,
    )
    meta["projected_to_pial"] = projected_mask

    final = native.copy()
    snap_distances = np.full(len(meta), np.nan, dtype=np.float64)
    for hemi in ("L", "R"):
        hemi_mask = projected_mask & meta["hemi"].astype(str).str.upper().eq(hemi)
        if not hemi_mask.any():
            continue
        coords = native[hemi_mask.to_numpy()]
        projected, distances = project_coords_to_pial(coords, hemi, surface)
        final[hemi_mask.to_numpy()] = projected
        snap_distances[hemi_mask.to_numpy()] = distances

    meta["x"] = final[:, 0]
    meta["y"] = final[:, 1]
    meta["z"] = final[:, 2]
    meta["snap_distance_mm"] = snap_distances
    return meta, translation
