// Genera SFX de construcción por raza con ElevenLabs /v1/sound-generation.
// Uso: ELEVENLABS_API_KEY=... [FFMPEG=ruta] node --use-system-ca tools/gen-sfx.mjs
// Salida: assets/sounds/<human|orc|dwarf>/construction/{colocar,obra,terminado}.mp3
// Idempotente: salta los mp3 que existen (para rehacer uno, bórralo). Los audios sin procesar se guardan en
// tools/_sfx_raw/<raza>/ (fuera de assets) para re-procesar sin gastar créditos.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY en el entorno");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = { humanos: "human", orcos: "orc", enanos: "dwarf", elfos: "elf" }; // carpeta por raza: assets/sounds/<raza>/construction/
const API = "https://api.elevenlabs.io/v1";
const XFADE = 0.5; // s de crossfade para cerrar el loop de "obra"
const STYLE = "Clean video game RTS sound effect, no music, no voices, no background ambience.";
// mean_volume objetivo (dB) por tipo de clip: cada clip se nivela individualmente a su objetivo
const MEAN = { colocar: -17, obra: -19, terminado: -17 };

// raza -> clip -> [prompt, segundos, loop, prompt_influence]
const RACES = {
  humanos: {
    colocar: ["Heavy wooden beams and stone blocks dropping onto packed dirt and settling: one heavy thud of timber and stone landing, then a few smaller bumps as they settle, a puff of dust, dull and dry, medieval construction.", 2.0, false, 0.85],
    obra: ["Natural medieval carpentry work site: hammer blows on wooden beams at an irregular rhythm with short pauses, a soft hand saw cutting wood, mallet knocks, planks being set down and stacked, occasional nail taps. Warm, dry, close recording, varied and realistic. No squeaking, no screeching, no whistling, no animals, no birds, no high-pitched noise.", 10, true, 0.85],
    terminado: ["Construction complete: a short satisfying wooden hammer finishing tap followed by a warm soft bell chime, brief and clean, medieval.", 2.0, false, 0.8],
  },
  orcos: {
    colocar: ["Rough heavy logs, bones and rusty metal plates thrown to the ground with a brutal dull impact, leather straps creaking, a few heavy settling thuds, dust, orc war camp.", 2.0, false, 0.85],
    obra: ["Brutal orc construction site, continuous and varied: heavy axe chops into thick logs, crude hammer blows on wood and bone, logs thudding and being dragged, leather straps and chains rattling, rusty metal clanks, irregular rhythm with pauses. Rough but natural. No high-pitched noise, no voices.", 10, true, 0.85],
    terminado: ["Construction complete: a deep heavy tribal drum hit with a rough wooden log thud and a short low rusty metal clank, brutal and brief.", 2.0, false, 0.8],
  },
  enanos: {
    colocar: ["Heavy iron and stone blocks lowered and dropping onto rocky ground with a deep dull impact, stone settling, a metallic thud, dust, dwarven construction.", 2.0, false, 0.85],
    obra: ["Dwarven forge and mine work site, continuous and varied: hammer blows on an anvil with a short ring, pickaxes hitting rock, a hammer tapping hot metal, stone chipping, bellows puffing softly, irregular rhythm with pauses. Natural and realistic. No voices, no high-pitched squeal.", 10, true, 0.85],
    terminado: ["Construction complete: a hammer striking an anvil with a resonant ring, followed by a short deep dwarven horn and forge fanfare, satisfying and brief, dwarven.", 2.5, false, 0.8],
  },
  elfos: {
    colocar: ["Smooth wooden beams and marble blocks being set down gently on soft earth with a soft heavy thud, a faint magical shimmer settling, leaves rustling, elven construction.", 2.0, false, 0.85],
    obra: ["Elven construction: wood growing and creaking softly as branches grow, gentle marble carving with a soft chisel, small crystal glass chimes tinkling softly now and then, soft rustling leaves, serene and rhythmic. No high-pitched squeals, no voices, no music.", 10, true, 0.85],
    terminado: ["Construction complete: a short magical arpeggio of crystal bells, a gentle crystalline chime and a soft shimmer, elegant and brief.", 2.5, false, 0.8],
  },
};

const headers = { "xi-api-key": KEY };
const usedChars = async () => (await (await fetch(API + "/user/subscription", { headers })).json()).character_count;
const ff = (...args) => spawnSync(FFMPEG, ["-y", "-hide_banner", ...args], { encoding: "utf8" });
const duration = (f) => {
  const m = ff("-i", f).stderr.match(/Duration: (\d+):(\d+):([0-9.]+)/);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
};
const vol = (f, key) => parseFloat(ff("-i", f, "-af", "volumedetect", "-f", "null", "-").stderr.match(new RegExp(key + "_volume: (-?[0-9.]+) dB"))?.[1]);

// Nivela por ganancia (+limitador) hasta que el mean_volume de `out` coincida con `target`; devuelve true si ok.
function levelTo(src, out, target, extra = []) {
  let gain = target - vol(src, "mean");
  if (!Number.isFinite(gain)) return false;
  for (let i = 0; i < 3; i++) {
    if (ff("-i", src, "-af", "volume=" + gain.toFixed(2) + "dB,alimiter=limit=0.89:level=disabled", ...extra, out).status !== 0) return false;
    const err = target - vol(out, "mean");
    if (Math.abs(err) < 0.5) return true;
    gain += err;
  }
  return true;
}

function postProcess(raw, dest, name, loop) {
  const target = MEAN[name], tmp = dest + ".tmp.wav", wav = dest + ".lvl.wav";
  try {
    if (!loop) {
      // recorte de silencio inicial y de cola (relativa al pico: pico a -1 dB, cola < -40 dB), nivelación y fundido de 20 ms
      const head = "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.01";
      const tail = "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.01";
      const pk = vol(raw, "max");
      if (ff("-i", raw, "-af", `${head},volume=${(-1 - pk).toFixed(2)}dB,${tail},areverse,${tail},areverse`, "-ar", "44100", "-ac", "1", tmp).status !== 0) return false;
      if (!levelTo(tmp, wav, target, ["-ar", "44100", "-ac", "1"])) return false;
      const d = duration(wav);
      return ff("-i", wav, "-af", `afade=t=out:st=${Math.max(d - 0.02, 0).toFixed(3)}:d=0.02`, "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status === 0;
    }
    // Loop sin salto: out = clip[c:D-c] + crossfade(clip[D-c:D], clip[0:c]); el final enlaza con clip[c] = inicio.
    if (!levelTo(raw, wav, target, ["-ar", "44100", "-ac", "1"])) return false;
    const D = duration(wav), c = XFADE;
    const g = `[0]atrim=${c}:${D - c},asetpts=PTS-STARTPTS[mid];[0]atrim=${D - c}:${D},asetpts=PTS-STARTPTS[t];[0]atrim=0:${c},asetpts=PTS-STARTPTS[h];[t][h]acrossfade=d=${c}:c1=qsin:c2=qsin[x];[mid][x]concat=n=2:v=0:a=1[o]`;
    return ff("-i", wav, "-filter_complex", g, "-map", "[o]", "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status === 0;
  } finally { rmSync(tmp, { force: true }); rmSync(wav, { force: true }); }
}

// Salto en la costura = |última muestra - primera| frente al salto medio entre muestras vecinas.
function seamCheck(file) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], { maxBuffer: 1 << 28 });
  const s = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
  const d = [];
  for (let i = 1; i < s.length; i++) d.push(Math.abs(s[i] - s[i - 1]));
  d.sort((a, b) => a - b);
  const seam = Math.abs(s[s.length - 1] - s[0]), p99 = d[Math.floor(d.length * 0.99)];
  return { seam, p99, ok: seam <= p99 };
}

const failed = [];
let generated = 0;
const before = await usedChars();

for (const [race, clips] of Object.entries(RACES)) {
  mkdirSync(join(ROOT, "assets", "sounds", DIR[race], "construction"), { recursive: true });
  for (const [name, [prompt, secs, loop, influence]] of Object.entries(clips)) {
    const rel = `assets/sounds/${DIR[race]}/construction/${name}.mp3`;
    const dest = join(ROOT, rel), raw = join(ROOT, "tools", "_sfx_raw", DIR[race], `${name}.mp3`);
    mkdirSync(dirname(raw), { recursive: true });
    if (existsSync(dest)) continue;
    try {
      if (!existsSync(raw)) {
        const body = { text: `${prompt} ${STYLE}`.slice(0, 450), duration_seconds: secs, prompt_influence: influence, model_id: "eleven_text_to_sound_v2" };
        if (loop) body.loop = true;
        const r = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
        generated++;
      }
      if (!postProcess(raw, dest, name, loop)) { failed.push(`${rel}: ffmpeg`); console.error("FALLO ffmpeg", rel); continue; }
      console.log("ok", rel, duration(dest).toFixed(2) + "s", "mean " + vol(dest, "mean") + " dB, pico " + vol(dest, "max") + " dB", loop ? JSON.stringify(seamCheck(dest)) : "");
    } catch (e) {
      failed.push(`${rel}: ${e.message}`);
      console.error("FALLO", rel, e.message);
    }
  }
}

console.log(`\nClips nuevos: ${generated} | créditos (delta cuenta): ${(await usedChars()) - before} | fallos: ${failed.length}`);
failed.forEach((f) => console.log(" -", f));
