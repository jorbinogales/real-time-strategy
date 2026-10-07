// Voces de ANUNCIADOR por raza (la voz del trabajador/unidad económica) con ElevenLabs, español de España.
// Uso: ELEVENLABS_API_KEY=... [FFMPEG=ruta] node --use-system-ca tools/gen-announcer.mjs [human|orc|elf|dwarf]
// Reutiliza los voice_id de tools/voices.json (campesino, esclavo, trabajador, obrero): NO crea voces nuevas.
// Salida: assets/sounds/<raza>/announcer/es-es/<evento>_<n>.mp3 + manifest.json { evento: ["evento_1.mp3", ...] }.
// Idempotente: salta los mp3 que existen. Cada clip se verifica con Scribe (idioma + texto); hasta 2 reintentos.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY en el entorno");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.elevenlabs.io/v1";
const MODEL = "eleven_turbo_v2_5"; // acepta language_code
const MAX_TRIES = 3; // 1 intento + 2 reintentos
const MIN_SIMILARITY = 0.6;
const TARGET_LUFS = -18;
const voices = JSON.parse(readFileSync(join(ROOT, "tools", "voices.json"), "utf8"));

// raza -> { voz (clave en voices.json), ajustes de voz (los mismos que la unidad), eventos -> 3 textos }
const RACES = {
  human: {
    voice: "campesino", settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    events: {
      built: ["¡Construcción terminada, mi señor!", "Ya está listo el edificio.", "Hemos acabado la obra."],
      gold_empty: ["La mina de oro se ha agotado.", "Ya no queda oro en la mina.", "Mi señor, la mina de oro está vacía."],
      stone_empty: ["La mina de piedra se ha agotado.", "Ya no queda piedra en la mina.", "Mi señor, la piedra se acabó."],
      attack: ["¡Nos atacan, mi señor!", "¡Estamos bajo ataque!", "¡Ay, que nos atacan!"],
      no_res_build: ["No hay recursos para construir eso.", "Nos faltan recursos para la obra.", "Mi señor, no tenemos con qué construirlo."],
      no_res_train: ["No hay recursos para entrenar a ese.", "Nos faltan recursos para formar tropas.", "Mi señor, no hay con qué entrenarlos."],
    },
  },
  orc: {
    voice: "esclavo", settings: { stability: 0.3, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
    events: {
      built: ["S-sí, amo, el edificio está listo.", "Ya terminé la obra, amo... no me peguéis.", "Construcción acabada, amo."],
      gold_empty: ["Amo, la mina de oro está vacía...", "Ya no hay oro, amo, no es culpa mía.", "La mina de oro se ha agotado, amo."],
      stone_empty: ["Amo, la mina de piedra está vacía...", "No queda piedra, amo, lo juro.", "La mina de piedra se ha agotado, amo."],
      attack: ["¡Nos atacan, amo!", "¡Bajo ataque, amo, bajo ataque!", "¡Nos están atacando!"],
      no_res_build: ["No hay recursos para construir, amo...", "Falta de todo para la obra, amo.", "No podemos construir eso, amo, perdón."],
      no_res_train: ["No hay recursos para entrenar, amo...", "No hay con qué formar tropas, amo.", "Faltan recursos, amo, no me castiguéis."],
    },
  },
  elf: {
    voice: "trabajador", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    events: {
      built: ["La construcción ha terminado.", "El edificio está listo, mi señor.", "La obra ha concluido, que la luz la bendiga."],
      gold_empty: ["La mina de oro se ha agotado.", "Ya no queda oro en la mina, mi señor.", "El oro de la mina se ha extinguido."],
      stone_empty: ["La mina de piedra se ha agotado.", "Ya no queda piedra en la mina.", "La piedra de la mina se ha extinguido."],
      attack: ["¡Nos atacan, mi señor!", "Estamos bajo ataque, que la luz nos proteja.", "¡Las sombras nos atacan!"],
      no_res_build: ["No hay recursos para construir eso.", "Nos faltan recursos para la obra, mi señor.", "No tenemos con qué edificar."],
      no_res_train: ["No hay recursos para entrenar.", "Nos faltan recursos para formar guerreros.", "No tenemos con qué entrenar, mi señor."],
    },
  },
  dwarf: {
    voice: "obrero", settings: { stability: 0.4, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
    events: {
      built: ["¡Construcción terminada, jefe!", "¡Ya está el edificio, y de roca sólida!", "¡Obra acabada, por mi barba!"],
      gold_empty: ["¡La mina de oro está vacía, jefe!", "¡Ya no queda oro, por las barbas!", "¡Se acabó el oro de la mina!"],
      stone_empty: ["¡La mina de piedra está vacía, jefe!", "¡Ya no queda piedra, por mi barba!", "¡Se acabó la piedra de la mina!"],
      attack: ["¡Nos atacan, jefe!", "¡Estamos bajo ataque, a las armas!", "¡Por las barbas, nos atacan!"],
      no_res_build: ["¡No hay recursos para construir eso, jefe!", "¡Nos faltan recursos para la obra!", "¡Sin recursos no se construye, jefe!"],
      no_res_train: ["¡No hay recursos para entrenar, jefe!", "¡Nos faltan recursos para formar tropas!", "¡Sin oro no hay ejército, jefe!"],
    },
  },
};

const headers = { "xi-api-key": KEY };
const usedChars = async () => (await (await fetch(API + "/user/subscription", { headers })).json()).character_count;

// --- verificación con Scribe: idioma español + transcripción parecida al texto ---
const norm = (s) => s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zñ ]/g, " ").replace(/\s+/g, " ").trim();
function similarity(a, b) {
  a = norm(a); b = norm(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}
async function verify(file, text) {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([readFileSync(file)], { type: "audio/mpeg" }), "clip.mp3");
  const r = await fetch(API + "/speech-to-text", { method: "POST", headers, body: form });
  if (!r.ok) throw new Error(`STT ${r.status} ${await r.text()}`);
  const j = await r.json();
  const lang = String(j.language_code || "");
  const sim = similarity(j.text || "", text);
  // Scribe confunde el idioma en frases cortas: si la transcripción coincide casi exacta, el audio es español inteligible.
  const short = norm(text).split(" ").length <= 6;
  const ok = sim >= MIN_SIMILARITY && (/^(spa|es)/i.test(lang) || (short && sim >= 0.85));
  return { ok, lang, sim: +sim.toFixed(2), heard: (j.text || "").trim() };
}

// --- audio: recorte de silencios + loudnorm de dos pasadas a -18 LUFS (+ ganancia si un clip corto queda bajo) ---
const ff = (...a) => spawnSync(FFMPEG, ["-y", "-hide_banner", ...a], { encoding: "utf8" });
const duration = (f) => { const m = ff("-i", f).stderr.match(/Duration: (\d+):(\d+):([0-9.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
const lufs = (f) => parseFloat(ff("-i", f, "-af", "ebur128", "-f", "null", "-").stderr.split("Summary:").pop().match(/I:\s+(-?[0-9.]+) LUFS/)?.[1]);
function postProcess(raw, dest) {
  const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05";
  const tmp = dest + ".tmp.wav", norm2 = dest + ".norm.wav";
  try {
    if (ff("-i", raw, "-af", `${trim},areverse,${trim},areverse`, "-ar", "44100", "-ac", "1", tmp).status !== 0) return false;
    const ln = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=7`;
    const m = JSON.parse(ff("-i", tmp, "-af", `${ln}:print_format=json`, "-f", "null", "-").stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s)[0]);
    const lin = `${ln}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    if (ff("-i", tmp, "-af", lin, "-ar", "44100", "-ac", "1", norm2).status !== 0) return false;
    let af = "anull";
    const i = lufs(norm2);
    if (Number.isFinite(i) && i < TARGET_LUFS - 1.5) af = `volume=${Math.min(TARGET_LUFS - i, 10).toFixed(1)}dB,alimiter=limit=0.89:level=disabled`; // clips cortos bajos
    return ff("-i", norm2, "-af", af, "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status === 0;
  } catch { return false; } finally { rmSync(tmp, { force: true }); rmSync(norm2, { force: true }); }
}

const WANT = process.argv[2]; // human | orc | elf | dwarf (por defecto, todas)
const failed = [], retried = [];
let generated = 0, sttCalls = 0;
const before = await usedChars();

for (const [race, r] of Object.entries(RACES)) {
  if (WANT && race !== WANT) continue;
  const voiceId = voices[r.voice]?.voice_id;
  if (!voiceId) throw new Error(`Falta la voz "${r.voice}" en tools/voices.json`);
  const REL_DIR = `assets/sounds/${race}/announcer/es-es`, OUT = join(ROOT, REL_DIR), manifest = {};
  mkdirSync(OUT, { recursive: true });
  for (const [ev, texts] of Object.entries(r.events)) {
    manifest[ev] = [];
    for (const [i, text] of texts.entries()) {
      const file = `${ev}_${i + 1}.mp3`, rel = `${REL_DIR}/${file}`;
      const dest = join(ROOT, rel), raw = dest + ".raw";
      manifest[ev].push(file);
      if (existsSync(dest)) continue;
      let v, tries = 0;
      try {
        while (tries < MAX_TRIES) {
          tries++;
          if (!existsSync(raw)) {
            const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
              method: "POST", headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ text, model_id: MODEL, language_code: "es", voice_settings: r.settings }),
            });
            if (!res.ok) throw new Error(`TTS ${res.status} ${await res.text()}`);
            writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
            generated++;
          }
          v = await verify(raw, text); sttCalls++;
          if (v.ok) break;
          console.warn(`  reintento ${rel}: lang=${v.lang} sim=${v.sim} oyó="${v.heard}"`);
          rmSync(raw, { force: true });
        }
        if (!v.ok) throw new Error(`no verificado tras ${tries} intentos (lang=${v.lang} sim=${v.sim} oyó="${v.heard}")`);
        if (tries > 1) retried.push(`${rel} (${tries - 1})`);
        if (!postProcess(raw, dest)) { renameSync(raw, dest); console.warn(`fallo ffmpeg: ${rel} sin procesar`); }
        else rmSync(raw, { force: true });
        console.log("ok", rel, duration(dest).toFixed(2) + "s", `[${v.lang} ${v.sim}]`);
      } catch (e) {
        failed.push(`${rel}: ${e.message}`);
        rmSync(raw, { force: true });
        console.error("FALLO", rel, e.message);
      }
    }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`\nClips TTS generados: ${generated} (incluye reintentos) | llamadas STT: ${sttCalls} | créditos (delta cuenta): ${(await usedChars()) - before}`);
console.log("Con reintentos:", retried.length ? retried.join(", ") : "ninguno");
console.log("Fallos:", failed.length ? "\n - " + failed.join("\n - ") : "ninguno");
