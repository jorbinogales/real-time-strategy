// SFX de selección de edificios humanos con ElevenLabs /v1/sound-generation.
// Uso: ELEVENLABS_API_KEY=... [FFMPEG=ruta] node --use-system-ca tools/gen-building-sfx.mjs
// Salida: assets/sounds/human/buildings/<id>/select.mp3. Idempotente: salta los que existen.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY en el entorno");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.elevenlabs.io/v1";
const TARGET_LUFS = -18;
const STYLE = "Clean video game RTS sound effect, single one-shot, no music, no voices, no background ambience. No squeaking, no screeching, no whistling, no animal sounds, no high-pitched noise.";

// id -> [prompt, duración pedida (s)]
const BUILDINGS = {
  cuartel: ["Large army of soldiers marching in unison, heavy leather boots stomping on packed dirt and stone, deep rhythmic footsteps, low-pitched cadence, many men, steady military march rhythm, leather and gravel, dull thuds, subtle low drum beat underneath. No jingling, no coins, no metal clinking, no high-pitched metallic sounds, no chains, no music, no voices.", 3, 0.85],
  "campo-de-arqueria": ["A single arrow flying with a low airy whoosh, then hitting a wooden archery target with a loud dry deep thud, then the embedded arrow shaft keeps vibrating with a clearly audible low wooden tremble for about one second.", 2.5],
  ayuntamiento: ["Church bell and town hall bell ringing, a few clear bronze bell strikes with natural ring-out, medieval village bells, warm resonant chime, pure bells only. No horn, no trumpet, no brass, no fanfare, no ship horn, no foghorn, no music, no voices, no wind.", 3, 0.85],
  casa: ["A wooden house door opening and closing with a soft gentle creak, warm cozy quiet home ambience, a calm homely feeling, dull wood sounds.", 2.5],
  granja: ["A single cow mooing on a farm, a long natural deep 'moooo', rural farm ambience in the background, calm countryside. No voices, no music, no high-pitched or screeching sounds.", 3, 0.85, false], // false: sin STYLE (prohíbe sonidos de animal)
  // --- orcos (clave "orc:<id>"): sin STYLE, porque piden voces, cánticos y animales a propósito ---
  "orc:salon-de-guerra": ["Heavy iron war hammer smashing a wooden table, wood splintering and cracking, rusty metal clanging, chains rattling, a distant thunder rumble, deep orc grunts and a low guttural growl. Brutal orc war hall, continuous series of impacts. No horns, no trumpets, no melody.", 3, 0.8, false],
  "orc:cuartel": ["Orc warriors grunting and snarling while rusty swords and axes clash against shields with loud metal clangs, wooden shields cracking and splintering, armor crunching, aggressive brawl, continuous impacts. No horns, no trumpets, no melody.", 3, 0.8, false],
  "orc:matadero": ["Heavy cleaver chopping through bone and wood, wooden crates breaking and splintering, chains dragging and rattling, orc growls and guttural laughter, a couple of pig squeals far away, brutal butcher shop, continuous impacts. No horns, no trumpets, no melody.", 3, 0.8, false],
  "orc:campo-de-jabalinas": ["Javelins thudding into wooden targets, targets cracking and splintering apart, metal spearheads scraping and clanging against metal armor, short orc roars and grunts after each hit, continuous impacts. No horns, no trumpets, no melody.", 3, 0.8, false],
  // --- elfos (clave "elf:<id>"): sin STYLE, piden coros, pájaros y cristales a propósito ---
  "elf:templo-sagrado": ["An ethereal choir singing a soft sustained wordless chord with crystal glass bells chiming gently, holy and serene sacred temple. No horns, no melody-heavy music.", 3, 0.8, false],
  "elf:casa": ["Soft wind through leaves and gentle wood creaks of a treehouse, a calm homely feeling, warm quiet ambience, a wooden door softly closing.", 3, 0.8, false],
  "elf:arboles-frutales": ["Leaves rustling in a gentle breeze, a few soft bird chirps, and a ripe fruit dropping and thudding softly onto the grass, peaceful orchard.", 3, 0.8, false],
  "elf:deposito-frutas": ["Wicker baskets being set down and fruits rolling and thudding softly into them, juicy fruit sounds, wooden crates, calm storehouse.", 3, 0.8, false],
  "elf:deposito-minerales": ["Gems and ingots clinking softly, polished stones knocking together, soft crystal tinkling, a metal bar set down on stone, elven treasury. Gentle, no harsh ringing.", 3, 0.8, false],
  "elf:cabana-guardabosques": ["Quiet forest ambience with soft birdsong and rustling leaves, a bowstring being drawn tight with a soft creak, a wooden cabin door, calm woodland.", 3, 0.8, false],
  "elf:cuartel": ["Noble sword strikes and shield impacts on marble, clean metallic clashes and a steel blade being drawn, elegant and noble, slightly echoing on stone.", 3, 0.8, false],
  "elf:arqueria": ["A bowstring being drawn and released, arrows whooshing and thudding into targets, and wind swaying through hanging vines and leaves.", 3, 0.8, false],
  // --- enanos (clave "dwarf:<id>"): sin STYLE, piden cuernos, cerdos y herrería a propósito ---
  "dwarf:salon-de-gremio": ["A deep low dwarven horn blast echoing in a vast stone hall, hammers striking anvils in the distance, grand and heavy, stone hall echo. No ship horn, no melody.", 3, 0.8, false],
  "dwarf:cuartel": ["Dwarf axes striking against iron shields with heavy metal clangs, heavy armored boots marching in unison on stone, rhythmic and powerful.", 3, 0.8, false],
  "dwarf:campo-de-lanzadores": ["Throwing axes sinking into wooden training dummies with dull thunks, a short low whoosh of each throw, wooden dummies creaking, training yard.", 3, 0.8, false],
  "dwarf:ganaderia": ["Pigs grunting and snorting in a wooden pen, straw rustling, a wooden fence creaking, farm. Low-pitched grunts only, no squealing, no high-pitched squeals.", 3, 0.8, false],
  "dwarf:deposito": ["Wooden barrels rolling on a stone floor, sacks and logs being stacked, wood creaking, a heavy low storehouse.", 3, 0.8, false],
  // --- humanos nuevos. "<id>#work" = bucle continuo (loop de la API + crossfade de 0,3 s), se repite mientras el edificio trabaja ---
  "deposito-minerales": ["Wooden treasure chests thudding down, heavy metal and gold ingots clanking and stacking, heavy stone blocks knocking together, chains dragging and a wheelbarrow rolling, medieval mine storehouse. Low-pitched, dull, muffled metal, no jingling coins, no bright ringing.", 3, 0.8],
  aserradero: ["A few strokes of a hand saw cutting through a log, rhythmic sawing, then a piece of wood falling and thudding onto the ground, sawdust, warm and dry.", 3, 0.8],
  molino: ["Soft wooden creaking of a windmill, large wooden sails turning with a gentle low whoosh, and heavy flour sacks being set down with soft thuds, rustic and calm.", 3, 0.8],
  "aserradero#work": ["Large sawmill saw cutting a wooden log in a steady rhythmic back-and-forth, low-pitched sawing, sawdust falling, the wood vibrating. Continuous and dry, no high-pitched whine, no screeching, no music, no voices.", 5, 0.85],
  "molino#work": ["Windmill sails turning slowly in a steady rhythm with soft wooden creaking and low wind, a deep rhythmic whoosh of the blades passing, a gentle grain-grinding rumble. Continuous, low-pitched and calm. No high-pitched squeaks, no music, no voices.", 5, 0.85],
};
const XFADE = 0.3; // s de crossfade para cerrar los bucles

const headers = { "xi-api-key": KEY };
const usedChars = async () => (await (await fetch(API + "/user/subscription", { headers })).json()).character_count;
const ff = (...a) => spawnSync(FFMPEG, ["-y", "-hide_banner", ...a], { encoding: "utf8" });
const duration = (f) => { const m = ff("-i", f).stderr.match(/Duration: (\d+):(\d+):([0-9.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
const lufs = (f) => parseFloat(ff("-i", f, "-af", "ebur128", "-f", "null", "-").stderr.split("Summary:").pop().match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);

// Recorte de silencios (umbral -60 dB: hay clips muy bajos) y loudnorm de 2 pasadas a -18 LUFS.
// Si un clip disperso/grave no llega al objetivo, se comprime antes y se repite (sin soft clip: distorsiona).
function loudnorm2(src, dst, pre = "") {
  const ln = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=7`, p = pre ? pre + "," : "";
  const m = JSON.parse(ff("-i", src, "-af", `${p}${ln}:print_format=json`, "-f", "null", "-").stderr.match(/{[^{}]*"input_i"[^{}]*}/s)[0]);
  const lin = `${p}${ln}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  return ff("-i", src, "-af", lin, "-ar", "44100", "-ac", "1", dst).status === 0;
}
function postProcess(raw, dest) {
  const trim = "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.03";
  const tmp = dest + ".tmp.wav", n2 = dest + ".norm.wav";
  try {
    if (ff("-i", raw, "-af", `${trim},areverse,${trim},areverse`, "-ar", "44100", "-ac", "1", tmp).status !== 0) return false;
    if (!loudnorm2(tmp, n2)) return false;
    if (lufs(n2) < TARGET_LUFS - 1.5 && !loudnorm2(tmp, n2, "acompressor=threshold=0.05:ratio=3:attack=5:release=100")) return false;
    // cola muda (< -50 dB hasta el final): se corta 0,1 s después de que empiece, con fundido
    const sd = ff("-i", n2, "-af", "silencedetect=n=-50dB:d=0.2", "-f", "null", "-").stderr;
    const st = [...sd.matchAll(/silence_start: ([0-9.]+)/g)].pop(), en = [...sd.matchAll(/silence_end: ([0-9.]+)/g)].pop();
    const cut = st && (!en || +en[1] < +st[1]) ? +st[1] + 0.1 : 0;
    const tail = cut > 1 ? ["-t", cut.toFixed(2), "-af", "afade=t=out:st=" + (cut - 0.1).toFixed(2) + ":d=0.1"] : [];
    return ff("-i", n2, ...tail, "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status === 0;
  } catch { return false; } finally { rmSync(tmp, { force: true }); rmSync(n2, { force: true }); }
}

// Bucle sin click: loudnorm y out = clip[c:D-c] + crossfade(clip[D-c:D], clip[0:c]); el final enlaza con clip[c] = el inicio.
function postProcessLoop(raw, dest) {
  const wav = dest + ".loop.wav";
  try {
    if (!loudnorm2(raw, wav)) return false;
    if (lufs(wav) < TARGET_LUFS - 1.5 && !loudnorm2(raw, wav, "acompressor=threshold=0.05:ratio=3:attack=5:release=100")) return false;
    const D = duration(wav), c = XFADE;
    const g = `[0]atrim=${c}:${D - c},asetpts=PTS-STARTPTS[mid];[0]atrim=${D - c}:${D},asetpts=PTS-STARTPTS[t];[0]atrim=0:${c},asetpts=PTS-STARTPTS[h];[t][h]acrossfade=d=${c}:c1=qsin:c2=qsin[x];[mid][x]concat=n=2:v=0:a=1,afade=t=in:d=0.008,afade=t=out:st=${(D - c - 0.008).toFixed(3)}:d=0.008[o]`; // micro-fundidos de 8 ms: el codec mp3 deja error en los bordes y sonaría un tic en la costura
    return ff("-i", wav, "-filter_complex", g, "-map", "[o]", "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status === 0;
  } finally { rmSync(wav, { force: true }); }
}
// Salto en la costura (última vs primera muestra) frente al p99 de saltos entre muestras vecinas.
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

for (const [key, [prompt, secs, influence = 0.7, style = true]] of Object.entries(BUILDINGS)) {
  const [base, kind = "select"] = key.split("#"), loop = kind === "work";
  const [faction, id] = base.includes(":") ? base.split(":") : ["human", base];
  const rel = `assets/sounds/${faction}/buildings/${id}/${kind}.mp3`;
  const dest = join(ROOT, rel), raw = dest + ".raw";
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) continue;
  try {
    if (!existsSync(raw)) {
      const r = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: style && `${prompt} ${STYLE}`.length <= 450 ? `${prompt} ${STYLE}` : prompt, // la API limita el texto a 450 caracteres
          duration_seconds: secs, prompt_influence: influence, model_id: "eleven_text_to_sound_v2", ...(loop && { loop: true }) }),
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
      generated++;
    }
    if (!(loop ? postProcessLoop(raw, dest) : postProcess(raw, dest))) { renameSync(raw, dest); console.warn(`fallo ffmpeg: ${rel} sin procesar`); }
    else rmSync(raw, { force: true });
    console.log("ok", rel, duration(dest).toFixed(2) + "s", lufs(dest) + " LUFS", loop ? JSON.stringify(seamCheck(dest)) : "");
  } catch (e) {
    failed.push(`${rel}: ${e.message}`);
    console.error("FALLO", rel, e.message);
  }
}
console.log(`\nClips nuevos: ${generated} | créditos (delta cuenta): ${(await usedChars()) - before} | fallos: ${failed.length}`);
failed.forEach((f) => console.log(" -", f));
