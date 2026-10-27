#!/bin/bash
# Gate for the hybrid doc (Bloom's gate, design/bloom/src/gate.sh, on this page). usage: gate.sh
# Assembles design/hybrid/index.html, probes each theme for errors, checks every section for sideways scroll at 390, checks size.
cd "$(dirname "$0")" || exit 2
OUT="$(cd .. && pwd)/index.html"
SH="${CLAUDE_JOB_DIR:-${TMPDIR:-/tmp}}/hybrid-gate-shots"; mkdir -p "$SH"
fail=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fail=1; }
out=$(python3 assemble.py 2>&1); echo "$out" | tail -1
echo "$out" | grep -q WARN && bad "assemble WARN: $(echo "$out" | grep WARN | head -5 | tr '\n' ' ')" || ok "assemble, no WARN"
for q in "" "theme=night" "theme=field&motion=reduce"; do
  res=$(node probe.cjs "$OUT" "$q" 3000 "document.querySelectorAll('.bl-sec').length" 2>&1)
  if echo "$res" | grep -qE "EXCEPTION|console.error"; then bad "page[$q]: $(echo "$res" | grep -E 'EXCEPTION|error' | head -3 | tr '\n' ' ')"; else ok "page[$q] clean: $(echo "$res" | tail -1)"; fi
done
for id in masthead shell groups states picks lock loose models menubar screens; do
  for th in field night; do
    res=$(node shotcdp.cjs "$OUT" "shot=$id&t=1750&theme=$th" "$SH/${id}_${th}_390.png" 390 844 1500 1 2>&1)
    echo "$res" | grep -q "HORIZONTAL OVERFLOW" && bad "$id/$th overflow at 390" || ok "$id/$th no overflow at 390"
  done
done
sz=$(stat -f%z "$OUT"); [ "$sz" -lt 1600000 ] && ok "size $sz B" || bad "size $sz B over 1.6 MB"
[ $fail = 0 ] && echo "GATE PASS" || echo "GATE FAIL"
exit $fail
