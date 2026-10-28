#!/bin/bash
# usage: mod.sh <ref> <name> [wait_sec]
REF="$1"; NAME="$2"; W="${3:-2.5}"
agent-browser --session audit5b click "$REF" >/dev/null 2>&1
sleep "$W"
echo "=== MODULE: $NAME ==="
agent-browser --session audit5b console 2>/dev/null | grep -iv "hmr\|devtools" | head -8
agent-browser --session audit5b errors 2>/dev/null | head -5
