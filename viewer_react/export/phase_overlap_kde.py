"""Build ROI-level static KDE source points for a subject (mean HGA)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any


def build_roi_mean_sources(electrodes: list[dict]) -> dict[str, Any]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for electrode in electrodes:
        grouped[electrode["roi"]].append(electrode)

    sources = []
    for roi, members in sorted(grouped.items()):
        weights = [
            abs(member.get("hga_mean_all") or 0.0)
            for member in members
            if member.get("hga_mean_all") is not None
        ]
        if not weights:
            continue
        weight = sum(weights) / len(weights)
        sources.append({
            "roi": roi,
            "x": sum(member["x"] for member in members) / len(members),
            "y": sum(member["y"] for member in members) / len(members),
            "z": sum(member["z"] for member in members) / len(members),
            "weight": weight,
            "n_electrodes": len(members),
        })

    max_weight = max((source["weight"] for source in sources), default=1.0)
    if max_weight <= 0:
        max_weight = 1.0
    for source in sources:
        source["weight"] = source["weight"] / max_weight

    return {"sources": sources}
