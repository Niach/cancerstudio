#!/usr/bin/env bash
# Install external binaries the pipeline needs:
#   stage 1-2 (ingestion + alignment): samtools, pigz, strobealign
#   stage 3 (variant calling): gatk (Mutect2), openjdk-17+
#
# Tested on Linux Mint 22.3 / Ubuntu 24.04. Run with:
#
#   sudo bash scripts/install-bioinformatics-deps.sh
#
set -euo pipefail

STROBEALIGN_VERSION="0.17.0"
STROBEALIGN_SRC_DIR="strobealign-${STROBEALIGN_VERSION}"
STROBEALIGN_TARBALL="v${STROBEALIGN_VERSION}.tar.gz"
STROBEALIGN_URL="https://github.com/ksahlin/strobealign/archive/refs/tags/${STROBEALIGN_TARBALL}"

GATK_VERSION="4.5.0.0"
GATK_ZIP="gatk-${GATK_VERSION}.zip"
GATK_URL="https://github.com/broadinstitute/gatk/releases/download/${GATK_VERSION}/${GATK_ZIP}"
GATK_INSTALL_ROOT="/usr/local/gatk"

INSTALL_DIR="/usr/local/bin"
WORK_DIR="$(mktemp -d -t cancerstudio-deps.XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This script must be run as root (try: sudo bash $0)" >&2
  exit 1
fi

echo "==> Installing samtools, pigz, JDK, and the strobealign build toolchain via apt"
apt-get update
apt-get install -y \
  samtools pigz \
  build-essential cmake zlib1g-dev \
  openjdk-17-jre-headless unzip

echo "==> Downloading strobealign v${STROBEALIGN_VERSION}"
curl -fsSL "${STROBEALIGN_URL}" -o "${WORK_DIR}/${STROBEALIGN_TARBALL}"
tar -xzf "${WORK_DIR}/${STROBEALIGN_TARBALL}" -C "${WORK_DIR}"

echo "==> Building strobealign (Release)"
cmake -B "${WORK_DIR}/${STROBEALIGN_SRC_DIR}/build" \
      -S "${WORK_DIR}/${STROBEALIGN_SRC_DIR}" \
      -DCMAKE_BUILD_TYPE=Release
make -C "${WORK_DIR}/${STROBEALIGN_SRC_DIR}/build" -j"$(nproc)"

echo "==> Installing strobealign to ${INSTALL_DIR}"
install -m 0755 \
  "${WORK_DIR}/${STROBEALIGN_SRC_DIR}/build/strobealign" \
  "${INSTALL_DIR}/strobealign"

echo "==> Downloading GATK ${GATK_VERSION}"
curl -fsSL "${GATK_URL}" -o "${WORK_DIR}/${GATK_ZIP}"
rm -rf "${GATK_INSTALL_ROOT}"
mkdir -p "${GATK_INSTALL_ROOT}"
unzip -q "${WORK_DIR}/${GATK_ZIP}" -d "${WORK_DIR}"
mv "${WORK_DIR}/gatk-${GATK_VERSION}"/* "${GATK_INSTALL_ROOT}/"

ln -sf "${GATK_INSTALL_ROOT}/gatk" "${INSTALL_DIR}/gatk"

echo
echo "==> Verifying installations"
echo -n "samtools: "; samtools --version | head -1
echo -n "pigz: "; pigz --version 2>&1 | head -1
echo -n "strobealign: "; strobealign --version 2>&1 | tail -1
echo -n "java: "; java -version 2>&1 | head -1
echo -n "gatk: "; gatk --version 2>&1 | tail -1

echo
echo "Done. Restart the backend (kill the running uvicorn, re-launch) so the"
echo "new tools are picked up on PATH."
echo
echo "Note: the first variant-calling run needs a sequence dictionary for the"
echo "reference. prepare-reference.sh will create it automatically."
