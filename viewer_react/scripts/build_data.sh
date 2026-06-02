#!/bin/bash
#SBATCH --job-name=phase_overlap
#SBATCH --output=/hpc/group/coganlab/nanlinshi/sternberg/logs/phase_overlap_%j.out
#SBATCH --error=/hpc/group/coganlab/nanlinshi/sternberg/logs/phase_overlap_%j.err
#SBATCH --time=02:30:00
#SBATCH --mem=32G
#SBATCH --cpus-per-task=2
#SBATCH --partition=common,scavenger,coganlab-gpu

set -eo pipefail

if [[ -n "${SLURM_SUBMIT_DIR:-}" && -f "${SLURM_SUBMIT_DIR}/export/compute_phase_overlap.py" ]]; then
  VIEWER_ROOT="${SLURM_SUBMIT_DIR}"
else
  VIEWER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
PROJECT_ROOT="$(cd "${VIEWER_ROOT}/../.." && pwd)"
DATA_DIR="${VIEWER_ROOT}/public/data"
RESULTS_ROOT="${PROJECT_ROOT}/results/Sternberg(bipolar)"

mapfile -t ALL_SUBJECTS < <(
  for hga_dir in "${RESULTS_ROOT}"/sub-*/HGA; do
    [[ -d "${hga_dir}" ]] || continue
    basename "$(dirname "${hga_dir}")" | sed 's/^sub-//'
  done | sort -u
)

if [[ ${#ALL_SUBJECTS[@]} -eq 0 ]]; then
  echo "ERROR: No subjects with HGA found under ${RESULTS_ROOT}" >&2
  exit 1
fi

echo "Exporting ${#ALL_SUBJECTS[@]} subjects"

source ~/.bashrc
conda activate ieeg

mkdir -p "${PROJECT_ROOT}/logs"

python "${VIEWER_ROOT}/export/compute_phase_overlap.py" \
    --input_root "${PROJECT_ROOT}/results" \
    --task Sternberg \
    --reference bipolar \
    --encoding_mode strict \
    --include_response \
    --recon_dir /cwork/ns458/ECoG_Recon \
    --subjects "${ALL_SUBJECTS[@]}" \
    --layout split \
    --output_dir "${DATA_DIR}"

python "${VIEWER_ROOT}/scripts/qa_export.py" "${DATA_DIR}"
