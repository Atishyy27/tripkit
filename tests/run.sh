#!/usr/bin/env bash
# Concatenate exactly the way the browser does: shims, data, engine, assertions.
set -e
cfg="$1"; probe="${2:-}"
tmp=$(mktemp -t tkXXXXXX).js
{
  echo "global.document={querySelector:()=>null,querySelectorAll:()=>[],body:{insertAdjacentHTML:()=>{}},getElementById:()=>null};"
  echo "global.localStorage={getItem:()=>null,setItem:()=>{}};"
  echo "const DATA = $cfg;"
  cat templates/assets/core.js
  cat tests/assert.js
} > "$tmp"
node "$tmp"
rm -f "$tmp"
