#!/bin/bash
# Gate for the Bloom doc build. usage: gate.sh <part-id>   (one part, preview only)
#                                      gate.sh all         (assemble design/bloom/index.html, check every section)
# Prints one line per check and ends with GATE PASS or GATE FAIL.
cd "$(dirname "$0")" || exit 2
OUT="$(cd .. && pwd)/index.html"
SH="${TMPDIR:-/tmp}/bloom-gate-shots"; mkdir -p "$SH"
fail=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fail=1; }

check_page() { # file query label
  local res
  res=$(node probe.js "$1" "$2" 3500 "JSON.stringify({sec:document.querySelectorAll('.bl-sec').length,theme:document.documentElement.dataset.theme})" 2>&1)
  if echo "$res" | grep -qE "EXCEPTION|console.error|\[error\]"; then bad "$3 probe: $(echo "$res" | grep -E 'EXCEPTION|error' | head -3 | tr '\n' ' ')"; else ok "$3 probe clean: $(echo "$res" | tail -1)"; fi
}
check_overflow() { # file query png label
  local res
  res=$(node shotcdp.js "$1" "$2" "$3" 390 844 1500 1 2>&1)
  if echo "$res" | grep -q "HORIZONTAL OVERFLOW"; then bad "$4 overflow at 390"; else ok "$4 no overflow at 390"; fi
}

if [ "$1" = "all" ]; then
  out=$(python3 assemble.py 2>&1); echo "$out" | tail -2
  echo "$out" | grep -q WARN && bad "assemble WARN: $(echo "$out" | grep WARN | head -5 | tr '\n' ' ')" || ok "assemble, no WARN"
  for q in "" "theme=night" "theme=field&type=regrade&motion=reduce"; do check_page "$OUT" "$q" "page[$q]"; done
  ids=$(node probe.js "$OUT" "" 3000 "[...document.querySelectorAll('.bl-sec')].map(s=>s.id).join(',')" 2>&1 | tail -1 | tr -d '"' | sed 's/^result: //')
  echo "sections: $ids"
  for id in $(echo "$ids" | tr ',' ' '); do
    for th in field night; do check_overflow "$OUT" "shot=$id&t=1750&theme=$th" "$SH/all_${id}_${th}_390.png" "$id/$th"; done
  done
  sz=$(stat -f%z "$OUT"); [ "$sz" -lt 1600000 ] && ok "size $sz B" || bad "size $sz B over 1.6 MB"
else
  id=$1; [ -z "$id" ] && { echo "usage: gate.sh <part-id>|all"; exit 2; }
  out=$(python3 assemble.py --only "$id" 2>&1); echo "$out" | tail -2
  echo "$out" | grep -q WARN && bad "lint WARN (fix or justify): $(echo "$out" | grep WARN | head -5 | tr '\n' ' ')" || ok "lint, no WARN"
  P=preview/$id.html
  for q in "" "theme=night" "theme=field&type=regrade&motion=reduce&t=5250"; do check_page "$P" "$q" "$id[$q]"; done
  for th in field night; do check_overflow "$P" "t=1750&theme=$th" "$SH/${id}_${th}_390.png" "$id/$th"; done
fi
[ $fail = 0 ] && echo "GATE PASS" || echo "GATE FAIL"
exit $fail
