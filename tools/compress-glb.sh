#!/usr/bin/env bash
# Comprime todos los .glb de assets/: texturas a máx. 1024 px en WebP (calidad 85) + geometría/animaciones con Meshopt.
# Los originales se guardan una sola vez en tools/glb-originals/ (misma ruta relativa). Idempotente: salta los ya comprimidos.
# Uso: bash tools/compress-glb.sh [carpeta]   (por defecto assets)   Requiere node/npx (descarga @gltf-transform/cli la primera vez).
set -u
# DESACTIVADO por decisión del usuario: los modelos se mantienen sin comprimir y con texturas 2048. Para forzarlo: FORCE=1 bash tools/compress-glb.sh
[ "${FORCE:-0}" = 1 ] || { echo 'Compresión desactivada (modelos sin comprimir, texturas 2048). Usa FORCE=1 para forzarla.'; exit 0; }
cd "$(dirname "$0")/.."
ROOT="${1:-assets}"; TMP="$(mktemp -d)"; GT="npx --yes @gltf-transform/cli"
ok=0; skip=0; fail=0; before=0; after=0
while IFS= read -r f; do
  case "$f" in assets/environment/*) skip=$((skip+1)); continue;; esac   # árbol y roca se instancian a mano en index.html: sin comprimir
  if grep -aq "EXT_meshopt_compression" "$f"; then skip=$((skip+1)); continue; fi
  bak="tools/glb-originals/$f"; mkdir -p "$(dirname "$bak")"; [ -f "$bak" ] || cp "$f" "$bak"
  if $GT resize "$f" "$TMP/1.glb" --width 1024 --height 1024 >/dev/null 2>&1 \
     && $GT webp "$TMP/1.glb" "$TMP/2.glb" --quality 85 >/dev/null 2>&1 \
     && $GT meshopt "$TMP/2.glb" "$TMP/3.glb" --level medium >/dev/null 2>&1; then
    b=$(stat -c %s "$f"); a=$(stat -c %s "$TMP/3.glb")
    if [ "$a" -lt "$b" ]; then cp "$TMP/3.glb" "$f"; before=$((before+b)); after=$((after+a)); ok=$((ok+1)); echo "ok   $f  $((b/1024)) KB -> $((a/1024)) KB"; else skip=$((skip+1)); echo "skip $f (no mejora)"; fi
  else fail=$((fail+1)); echo "FAIL $f"; fi
done < <(find "$ROOT" -name '*.glb' | sort)
rm -rf "$TMP"
echo "listos=$ok saltados=$skip fallos=$fail  total: $((before/1048576)) MB -> $((after/1048576)) MB"
