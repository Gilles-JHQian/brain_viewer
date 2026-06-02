#!/bin/bash
#SBATCH --job-name=export_brain_mesh
#SBATCH --output=/hpc/group/coganlab/nanlinshi/sternberg/logs/export_brain_mesh_%j.out
#SBATCH --error=/hpc/group/coganlab/nanlinshi/sternberg/logs/export_brain_mesh_%j.err
#SBATCH --time=00:30:00
#SBATCH --mem=8G
#SBATCH --cpus-per-task=2
#SBATCH --partition=common,scavenger

set -eo pipefail

VIEWER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "${VIEWER_ROOT}/../.." && pwd)"

source ~/.bashrc
conda activate ieeg

mkdir -p "${PROJECT_ROOT}/logs"
mkdir -p "${VIEWER_ROOT}/public/assets"

python "${VIEWER_ROOT}/export/export_average_brain_mesh.py" \
    --recon_dir /cwork/ns458/ECoG_Recon \
    --subject cvs_avg35_inMNI152 \
    --output "${VIEWER_ROOT}/public/assets/cvs_avg35_pial.glb" \
    --target_faces 100000
