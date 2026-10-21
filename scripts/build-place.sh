#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
rojo="${ROJO:-rojo}"

cd "$root"
npm run build --silent
rm -f ./*.tgz
tarball="$(npm pack --silent | tail -n 1)"
(
	cd test/fixture
	rm -rf node_modules/@rbxts/jev package-lock.json
	npm install --silent --no-save "file:../../$tarball"
	npx rbxtsc
	"$rojo" build . -o fixture.rbxl > /dev/null
)
