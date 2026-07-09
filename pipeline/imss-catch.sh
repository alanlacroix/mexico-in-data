#!/bin/bash
# Persistent IMSS window-catcher. The IMSS host sits behind an Incapsula WAF that
# intermittently serves a JS challenge (curl can't solve it) but also opens
# windows where plain GET works. This probes gently every ~3 min; the moment a
# window opens, it runs the full IMSS ingest. Monthly data -> we only need ONE
# success. Non-blocking: run in the background.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
URL="http://datos.imss.gob.mx/sites/default/files/asg-2026-06-30.csv"
cd /Users/alan/Desktop/mexico/pipeline || exit 2
for i in $(seq 1 40); do
  code=$(curl -s -m 30 -A "$UA" -r 0-300 "$URL" -o /tmp/imss_win.txt -w "%{http_code}")
  if { [ "$code" = "200" ] || [ "$code" = "206" ]; } && ! grep -qi "incapsula\|_Incapsula_Resource" /tmp/imss_win.txt; then
    echo "[$(date +%H:%M:%S)] try $i: WINDOW OPEN (HTTP $code) — starting full ingest"
    if ENABLE_IMSS=1 node run.js --only imss && [ -f ../data/layers/imss-empleo.json ]; then
      echo "[$(date +%H:%M:%S)] SUCCESS — IMSS layer built"; exit 0
    fi
    echo "[$(date +%H:%M:%S)] ingest failed (window may have closed mid-stream) — retrying"
  else
    echo "[$(date +%H:%M:%S)] try $i: HTTP $code, WAF challenge — waiting 170s"
  fi
  sleep 170
done
echo "[$(date +%H:%M:%S)] gave up after 40 tries (~2h)"; exit 1
