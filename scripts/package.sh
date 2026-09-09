#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dist_dir="$project_dir/dist"

mkdir -p "$dist_dir"
archive="$dist_dir/content-catcher.zip"
rm -f "$archive"
cd "$project_dir/extension"
zip -qr "$archive" .
echo "Created $archive"

