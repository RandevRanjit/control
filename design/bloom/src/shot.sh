#!/bin/bash
# Headless screenshot of a Bloom page (never opens a window).
# usage: shot.sh <html-file> "<query>" <out.png> [width] [height]
#   e.g. shot.sh preview/colour.html "shot=colour&theme=field&t=1750" /tmp/x.png 1440 2400
f="$1"; q="$2"; out="$3"; w="${4:-1440}"; h="${5:-1600}"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --force-device-scale-factor=1 --window-size="$w,$h" --virtual-time-budget=2500 \
  --screenshot="$out" "file://$f?$q" >/dev/null 2>&1
ls -la "$out" | awk '{print $5, $9}'
