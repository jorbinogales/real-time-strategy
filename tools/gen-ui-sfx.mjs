// SFX de interfaz (clics de botones) con ElevenLabs /v1/sound-generation.
// Uso: ELEVENLABS_API_KEY=... [FFMPEG=ruta] node --use-system-ca tools/gen-ui-sfx.mjs
// Salida: assets/sounds/ui/*.mp3 (set único para el menú y todas las razas; ya no hay sets por raza).
// Idempotente: salta los mp3 que existen. Los audios sin procesar se guardan en tools/_ui_raw/ (fuera de assets).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY en el entorno");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.elevenlabs.io/v1";
const TARGET_LUFS = -22; // clics: más bajos que unidades/edificios (-18)
const STYLE = "Clean modern game UI sound effect, single one-shot, no reverb, no echo, no tail, no music, no voices, no wood, no medieval.";

// Set ÚNICO de interfaz (todas las razas y el menú): clics/blips electrónicos limpios.
// clips: nombre -> [prompt, duración máxima (s), ajuste de nivel respecto al objetivo (dB)]
const GROUPS = {
  general: {
    dir: "ui", filter: "lowpass=f=12000:poles=2",
    clips: {
      click_1: ["A single soft crisp electronic UI click tick, a short clean digital tap, modern strategy game interface, very short.", 0.15, 0],
      click_2: ["A single clean subtle electronic tap blip, a short soft digital tick, game UI button press.", 0.15, 0],
      click_3: ["A single crisp soft synthetic click, a tiny clean digital 'tk', game menu button press.", 0.15, 0],
      hover: ["A very subtle faint electronic tick, an extremely quiet tiny digital blip, UI hover.", 0.08, -6],
      back: ["A short descending electronic tick, a soft digital blip dropping in pitch, UI back button.", 0.2, 0],
      confirm: ["Two short ascending clean electronic notes, a positive soft bright UI confirmation chime, brief.", 0.3, 0],
      denied: ["Two short descending low electronic notes with a soft low buzz, UI error denied sound, brief.", 0.3, 0],
      toggle: ["A clean electronic click with a tiny quick pitch rise then fall blip, UI toggle switch.", 0.2, 0],
      slider: ["A very soft tiny electronic tick, extremely short, UI slider step.", 0.08, -3],
      window: ["A short soft electronic whoosh sweep, a gentle quick swoosh for a panel opening, clean.", 0.3, 0],
    },
  },
  rock: { // botones de roca del menú principal: se rompen al hacer clic (objetivo ~-20 LUFS: offset +2 sobre -22)
    dir: "ui", filter: "lowpass=f=10000:poles=2",
    clips: {
      rock_break_1: ["A rock cracking sharply and breaking apart: a dry stone crack, a short burst, and small rock fragments tinkling as they fall, crisp real stone.", 0.8, 2],
      rock_break_2: ["A stone block shattering into pieces: a hard dry crack, a sharp crunchy burst and pebbles clattering down, realistic rock.", 0.8, 2],
      rock_break_3: ["A boulder splitting with a deep stone crack and crumbling apart, chunks and gravel dropping and rattling, short and punchy.", 0.8, 2],
      rock_hover: ["A very soft faint scrape of stone against stone, a barely audible gentle rock rub, extremely quiet and short.", 0.15, -2],
      rock_form: ["Small stones coming together and snapping back into place with a dull soft stone thud, short.", 0.3, 1],
    },
  },
};

const headers = { "xi-api-key": KEY };
const usedChars = async () => (await (await fetch(API + "/user/subscription", { headers })).json()).character_count;
const ff = (...a) => spawnSync(FFMPEG, ["-y", "-hide_banner", ...a], { encoding: "utf8" });
const duration = (f) => { const m = ff("-i", f).stderr.match(/Duration: (\d+):(\d+):([0-9.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
const vol = (f, key) => parseFloat(ff("-i", f, "-af", "volumedetect", "-f", "null", "-").stderr.match(new RegExp(key + "_volume: (-?[0-9.]+) dB"))?.[1]);
// LUFS integrado de un clip corto: ebur128 necesita >0,4 s, así que se mide con silencio añadido hasta 1,5 s.
const lufs = (f) => parseFloat(ff("-i", f, "-af", "apad=whole_dur=1.5,ebur128", "-f", "null", "-").stderr.split("Summary:").pop().match(/I:\s+(-?[0-9.]+) LUFS/)?.[1]);

// Recorte de silencio inicial, pico a -1 dB, recorte de cola relativo al pico, tope de duración, filtro y
// nivelación por ganancia (+limitador) hasta que el LUFS del mp3 final coincida con el objetivo; fundido final de 8 ms.
function postProcess(raw, dest, g, maxDur, off) {
  const t0 = dest + ".t0.wav", t1 = dest + ".t1.wav", tmp = dest + ".tmp.wav", lvl = dest + ".lvl.wav";
  const head = "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.005";
  const target = TARGET_LUFS + off;
  try {
    if (ff("-i", raw, "-af", head, "-ar", "44100", "-ac", "1", t0).status !== 0) return false;
    const pk = vol(t0, "max");
    if (!Number.isFinite(pk) || ff("-i", t0, "-af", "volume=" + (-1 - pk).toFixed(2) + "dB", "-ar", "44100", "-ac", "1", t1).status !== 0) return false;
    for (const th of [-35, -45, -60]) {
      const tail = "silenceremove=start_periods=1:start_threshold=" + th + "dB:start_silence=0.005";
      const af = tail + ",areverse," + tail + ",areverse" + (g.filter ? "," + g.filter : "");
      if (ff("-i", t1, "-af", af, "-t", String(maxDur), "-ar", "44100", "-ac", "1", tmp).status !== 0) return false;
      if (duration(tmp) >= Math.min(0.08, maxDur)) break;
    }
    const d = duration(tmp), fade = Math.min(0.008, d / 3);
    let gain = target - lufs(tmp);
    if (!Number.isFinite(gain)) gain = target - (vol(tmp, "mean") - 3); // respaldo por mean_volume
    for (let i = 0; i < 3; i++) {
      const af = "volume=" + gain.toFixed(2) + "dB,alimiter=limit=0.89:level=disabled,afade=t=out:st=" + (d - fade).toFixed(3) + ":d=" + fade.toFixed(3);
      if (ff("-i", tmp, "-af", af, "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status !== 0) return false;
      const err = target - lufs(dest);
      if (!Number.isFinite(err) || Math.abs(err) < 0.7) break;
      gain += err;
    }
    return true;
  } finally { for (const f of [t0, t1, tmp, lvl]) rmSync(f, { force: true }); }
}

const failed = [];
let generated = 0;
const before = await usedChars();

for (const [group, g] of Object.entries(GROUPS)) {
  for (const [name, [prompt, maxDur, off]] of Object.entries(g.clips)) {
    const rel = `assets/sounds/${g.dir}/${name}.mp3`;
    const dest = join(ROOT, rel), raw = join(ROOT, "tools", "_ui_raw", group, `${name}.mp3`);
    mkdirSync(dirname(dest), { recursive: true }); mkdirSync(dirname(raw), { recursive: true });
    if (existsSync(dest)) continue;
    try {
      if (!existsSync(raw)) {
        const text = `${prompt} ${STYLE}`.length <= 450 ? `${prompt} ${STYLE}` : prompt; // la API limita el texto a 450 caracteres
        const r = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ text, duration_seconds: Math.max(0.5, Math.min(maxDur + 0.2, 1)), prompt_influence: 0.85, model_id: "eleven_text_to_sound_v2" }), // 0,5 s = mínimo de la API
        });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
        generated++;
      }
      if (!postProcess(raw, dest, g, maxDur, off)) { failed.push(`${rel}: ffmpeg`); console.error("FALLO ffmpeg", rel); continue; }
      console.log("ok", rel, duration(dest).toFixed(2) + "s", lufs(dest) + " LUFS, pico " + vol(dest, "max") + " dB");
    } catch (e) {
      failed.push(`${rel}: ${e.message}`);
      console.error("FALLO", rel, e.message);
    }
  }
}
// click.mp3 = copia de click_1 (clic principal); click_1..3 son las variantes
const c1 = join(ROOT, "assets/sounds/ui/click_1.mp3"), c0 = join(ROOT, "assets/sounds/ui/click.mp3");
if (existsSync(c1) && !existsSync(c0)) copyFileSync(c1, c0);

console.log(`\nClips nuevos: ${generated} | créditos (delta cuenta): ${(await usedChars()) - before} | fallos: ${failed.length}`);
failed.forEach((f) => console.log(" -", f));
