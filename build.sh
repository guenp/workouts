#!/bin/sh
# Builds dist/health-companion-drive.html: a single self-contained file with
# all CSS and JS inlined, for hosting anywhere a lone HTML file is needed
# (Claude artifacts, "Paste data" workflows, emailing the app to yourself).
# The modular source in css/ and js/ is the canonical version — edit there,
# then re-run this script. Requires only POSIX sh + sed.
set -e
cd "$(dirname "$0")"
mkdir -p dist
OUT=dist/health-companion-drive.html

{
  # head, up to (not including) the stylesheet link
  sed -n '1,/<link rel="stylesheet"/p' index.html | sed '$d'
  echo '<style>'
  cat css/app.css
  echo '</style>'
  echo '</head>'
  # body scaffolding: from <body> up to the first module <script src=
  sed -n '/<body>/,/<script src="js\//p' index.html | sed '$d' | sed '/^<!--/,/-->/d'
  echo '<script>'
  # Embed the examples/ JSON so "Load examples" works offline in this
  # single-file build (the modular hosted app fetches them instead).
  echo '/* ===== embedded examples ===== */'
  echo 'var EXAMPLE_DATA = {'
  first=1
  for f in examples/*.json; do
    [ "$first" = 1 ] || echo ','
    first=0
    printf '"%s": ' "$f"
    cat "$f"
  done
  echo '};'
  for f in js/*.js; do
    echo "/* ===== $f ===== */"
    cat "$f"
    echo
  done
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > "$OUT"

echo "Built $OUT ($(wc -c < "$OUT") bytes)"
