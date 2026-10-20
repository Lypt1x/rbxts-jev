#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
rojo="${ROJO:-rojo}"

cd "$root"
npm run build --silent
rm -f ./*.tgz
npm pack --silent > /dev/null
(
	cd test/fixture
	rm -rf node_modules/@rbxts/jev package-lock.json
	npm install --silent
	npx rbxtsc
	"$rojo" build . -o fixture.rbxl > /dev/null
)
