#!/usr/bin/env bash
# Download the three authentic ESCI inputs; no model weights or training.
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$PROJECT_ROOT"
export PATH="$PROJECT_ROOT/.tools/bin:$PATH"
if [[ -z "${PYTHON:-}" ]]; then
  if [[ -x "$PROJECT_ROOT/.venv/bin/python" ]]; then
    PYTHON="$PROJECT_ROOT/.venv/bin/python"
  else
    PYTHON=python3
  fi
fi
command -v curl >/dev/null
command -v git >/dev/null
"$PYTHON" -c 'import pandas, pyarrow' >/dev/null

REPOSITORY="https://github.com/amazon-science/esci-data"
DATASET_DIR="shopping_queries_dataset"
FILES=(shopping_queries_dataset_examples.parquet shopping_queries_dataset_products.parquet shopping_queries_dataset_sources.csv)
mkdir -p data/raw licenses
STAGING="$(mktemp -d "$PROJECT_ROOT/data/raw/.download-XXXXXXXX")"
# Only this invocation's temporary directory is removed; existing raw files stay.
trap 'rm -rf -- "$STAGING"' EXIT
REVISION="$(git ls-remote "$REPOSITORY.git" refs/heads/main | awk 'NR == 1 {print $1}')"
if [[ ! "$REVISION" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot resolve the official main revision; refusing unattributed downloads." >&2
  exit 1
fi
echo "Official ESCI revision: $REVISION"
echo "Verifying/downloading examples, products and sources; products alone exceed 1 GB."

FAILED=()
preserve_invalid() {
  local destination="$1"
  if [[ -e "$destination" ]]; then
    local backup="${destination}.invalid.$(date -u +%Y%m%dT%H%M%SZ).$$"
    mv -- "$destination" "$backup"
    echo "Preserved invalid existing file: $backup"
  fi
}

for filename in "${FILES[@]}"; do
  destination="$PROJECT_ROOT/data/raw/$filename"
  original_url="$REPOSITORY/raw/main/$DATASET_DIR/$filename"
  if [[ -f "$destination" ]] && "$PYTHON" scripts/verify_raw.py --file "$destination" --name "$filename" --quiet; then
    echo "Keeping valid existing file: $filename"
    # Existing bytes are attributed only after matching immutable official metadata.
    "$PYTHON" scripts/verify_raw.py --file "$destination" --name "$filename" --quiet \
      --record --method existing --original-url "$original_url" --revision "$REVISION"
    continue
  fi
  part="$STAGING/$filename.part"
  echo "Trying direct curl download: $filename"
  if curl --fail -L --silent --show-error --retry 2 --connect-timeout 30 --max-time 3600 \
      -o "$part" --write-out '%{url_effective}' "$original_url" > "$STAGING/$filename.url" \
      && "$PYTHON" scripts/verify_raw.py --file "$part" --name "$filename" --quiet --revision "$REVISION"; then
    preserve_invalid "$destination"
    mv -- "$part" "$destination"
    "$PYTHON" scripts/verify_raw.py --file "$destination" --name "$filename" --quiet \
      --record --method curl-direct --original-url "$original_url" \
      --final-url "$(cat "$STAGING/$filename.url")" --revision "$REVISION"
  else
    echo "Direct response was unsuccessful or was not verified dataset content; queued Git LFS fallback: $filename"
    FAILED+=("$filename")
  fi
done

if (( ${#FAILED[@]} )); then
  if ! git lfs version >/dev/null 2>&1; then
    echo "Git LFS is required for fallback. Install git-lfs, then rerun this script; valid files will be kept." >&2
    exit 1
  fi
  CLONE="$STAGING/esci-data"
  # Smudge is deferred so the clone cannot fetch unrelated large files.
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 "$REPOSITORY.git" "$CLONE"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$CLONE" fetch --depth 1 origin "$REVISION"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$CLONE" checkout --detach "$REVISION"
  git -C "$CLONE" lfs install --local
  INCLUDE=""
  for filename in "${FAILED[@]}"; do
    if [[ -n "$INCLUDE" ]]; then INCLUDE="$INCLUDE,"; fi
    INCLUDE="$INCLUDE$DATASET_DIR/$filename"
  done
  git -C "$CLONE" lfs pull --include="$INCLUDE" --exclude=""
  for filename in "${FAILED[@]}"; do
    destination="$PROJECT_ROOT/data/raw/$filename"
    part="$STAGING/$filename.part"
    cp -- "$CLONE/$DATASET_DIR/$filename" "$part"
    "$PYTHON" scripts/verify_raw.py --file "$part" --name "$filename" --quiet --revision "$REVISION"
    preserve_invalid "$destination"
    mv -- "$part" "$destination"
    "$PYTHON" scripts/verify_raw.py --file "$destination" --name "$filename" --quiet \
      --record --method git-lfs --original-url "$REPOSITORY/raw/main/$DATASET_DIR/$filename" \
      --final-url "$REPOSITORY/blob/$REVISION/$DATASET_DIR/$filename" --revision "$REVISION"
  done
fi

# Preserve licensing from the same verified revision, never overwrite different existing text.
for name in LICENSE NOTICE; do
  curl --fail -L --silent --show-error --retry 2 --max-time 180 -o "$STAGING/$name" \
    "https://raw.githubusercontent.com/amazon-science/esci-data/$REVISION/$name"
  if [[ -f "licenses/$name" ]] && ! cmp -s "licenses/$name" "$STAGING/$name"; then
    cp -- "licenses/$name" "licenses/$name.previous.$(date -u +%Y%m%dT%H%M%SZ).$$"
  fi
  mv -- "$STAGING/$name" "licenses/$name"
done
printf '%s\n' "$REVISION" > licenses/REVISION
# A final full validation also refreshes the license entries in the manifest.
"$PYTHON" scripts/verify_raw.py --record --method existing
echo "Raw files verified. Source hashes and provenance: data/raw/source_manifest.json"
