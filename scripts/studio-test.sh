#!/usr/bin/env bash
# Runs test/studio/wire.luau inside a headless Roblox Studio on Windows, from WSL.
# Needs Studio installed and a rojo binary (set ROJO if it is not on PATH).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

ps() { powershell.exe -NoProfile -Command "$1" | tr -d '\r'; }

temp_win="$(ps '$env:TEMP')\\jev-studio-test"
temp="$(wslpath -u "$temp_win")"
studio="$(ps '(Get-ChildItem "$env:LOCALAPPDATA\Roblox\Versions\*\RobloxStudioBeta.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName')"
if [ -z "$studio" ]; then
	echo "Roblox Studio was not found under %LOCALAPPDATA%\\Roblox\\Versions" >&2
	exit 2
fi

bash "$root/scripts/build-place.sh"
cd "$root"

mkdir -p "$temp"
cp test/fixture/fixture.rbxl "$temp/place.rbxl"
cp test/studio/wire.luau "$temp/wire.luau"
rm -f "$temp/out.log"

ps "\$p = Start-Process -FilePath '$studio' -ArgumentList '--task','RunScript','--localPlaceFile','$temp_win\\place.rbxl','--runScriptFile','$temp_win\\wire.luau','--outputFile','$temp_win\\out.log','--quitAfterExecution' -PassThru; if (-not \$p.WaitForExit(120000)) { Stop-Process -Id \$p.Id -Force; 'TIMEOUT' }" | grep -q TIMEOUT && { echo "Studio did not finish within 120 seconds" >&2; exit 3; }

if [ ! -f "$temp/out.log" ]; then
	echo "Studio produced no output file" >&2
	exit 4
fi

grep -E '^(PASS|FAIL|ENCODED|RESULT)' "$temp/out.log"
grep -q '^RESULT failures=0$' "$temp/out.log"
