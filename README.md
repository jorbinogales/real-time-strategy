# real-time-strategy

RTS medieval en el navegador (three.js). Arrancar: `python -m http.server 8000` en esta carpeta y abrir `http://localhost:8000`.

## Estructura de carpetas

```
index.html                       el juego
assets/
  environment/                   árbol y roca del mapa
  buildings/<raza>/              edificios por etapas: <edificio>_e1..e4.glb
  units/<raza>/                  unidades: <unidad>.glb (con animaciones) y retrato .png
  ui/
    general/                     emblemas de raza
    <raza>/                      marcos, iconos de edificio, acciones y miniaturas de unidad
  sounds/
    general/                     sonidos comunes a todas las razas (ambiente, interfaz)
    <raza>/construction/         colocar.mp3 · obra.mp3 (bucle) · terminado.mp3
    <raza>/buildings/<id>/       select.mp3 al seleccionar el edificio
    <raza>/voices/<idioma>/      voces de unidades por idioma: <unidad>/<categoría>_<n>.mp3 + manifest.json
tools/                           scripts de generación (ElevenLabs) y visor de unidades
```

`<raza>`: `human`, `orc`, `dwarf`, `elf` (el mapa a las claves del juego está en `RACE_DIR`, en `index.html`).
`<idioma>`: idioma de las voces (hoy `es-es`; se fija en `LANG`). Añadir otro idioma = otra carpeta hermana.
Categorías de voz: `select`, `spawn`, `order_move`, `order_attack`, `attack`, `death`.

Los scripts de `tools/` leen `ELEVENLABS_API_KEY` del entorno (nunca se guarda en archivos) y se ejecutan con `node --use-system-ca tools/<script>.mjs`.
