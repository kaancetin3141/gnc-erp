#!/bin/bash
# usage: nav.sh <label-prefix> [wait]
LBL="$1"; W="${2:-2.5}"
agent-browser --session audit5b eval "Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.trim().startsWith('$LBL'))?.click()" >/dev/null 2>&1
sleep "$W"
agent-browser --session audit5b snapshot > /tmp/snap.txt 2>&1
echo "=== $LBL ==="
sed -n '/main/,/Notifications (F8)/p' /tmp/snap.txt | head -35
echo "--- console:"
agent-browser --session audit5b console 2>/dev/null | grep -iv "hmr\|devtools\|Fast Refresh\|DialogContent\|PROBE" | head -6
