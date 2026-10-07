// SFX generales / gritos / proyectiles con ElevenLabs /v1/sound-generation.
// Uso: ELEVENLABS_API_KEY=... [FFMPEG=ruta] node --use-system-ca tools/gen-general-sfx.mjs
// Idempotente: salta los mp3 que existen (para rehacer uno, bórralo o muévelo). Los audios sin procesar se guardan
// en tools/_general_raw/<grupo>/ (fuera de assets) para re-procesar sin gastar créditos.
// Grupos: tools, steps, projectiles (assets/sounds/general/<grupo>/), screams-human, screams-orc
// (assets/sounds/<raza>/screams/). Construcción de edificios: tools/gen-sfx.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY en el entorno");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.elevenlabs.io/v1";
const STYLE = "Clean RTS game sound effect, single one-shot, no music.";
const DRY = "Very dry, close-mic'd, no reverb, no echo, no ring, no tail.";
const TOOL_DRY = "Very dry, deep, low-pitched, close-mic'd, short tight thud. No reverb, no echo, no ring, no tail, no bright, no high-pitched, no sizzle.";
const SCREAM = "Raw non-verbal vocal sound, no words, no speech, no music, dry, close-mic'd, no reverb, no background noise.";
const INFLUENCE = 0.9;
const LOWPASS = "lowpass=f=5000:poles=2,bass=g=3:f=150"; // secado/profundidad para herramientas y pasos

// Grupo: { dir (bajo assets/sounds), mean (dB objetivo), filter, tails (umbrales relativos al pico), minDur (s),
//          clips: nombre -> [[prompt, segundos pedidos], ...] }
const GROUPS = {
  tools: {
    dir: "general/tools", mean: -17, filter: LOWPASS, tails: [-35, -45, -60], minDur: 0.2,
    clips: {
      pico_piedra: [
        [`A single miner's pickaxe blow against solid rock: a dry heavy stone 'tock' with a small shower of rock chips falling. ${TOOL_DRY} No metallic clink.`, 0.7],
        [`A single pickaxe striking a granite boulder, a deep heavy 'tock' with a few stone flakes scattering. ${TOOL_DRY} No metallic clink.`, 0.7],
        [`A single pickaxe hitting hard rock, a dull weighty stone crack and tumbling gravel chips. ${TOOL_DRY} No metallic clink.`, 0.7],
        [`A single heavy mining pick swing into a rock face, a muffled stone thud with crumbling chips. ${TOOL_DRY} No metallic clink.`, 0.7],
        [`A single pickaxe blow on a stone wall, a dry low 'tock' and a light patter of falling rock bits. ${TOOL_DRY} No metallic clink.`, 0.7],
      ],
      hacha_arbol: [
        [`A single realistic lumberjack axe blow sinking into a tree trunk: a deep dull wood 'thunk' with a short splinter crack. ${TOOL_DRY}`, 0.7],
        [`A single heavy axe chop into a thick oak trunk, a deep matte wooden 'thunk' and a brief splintering crack. ${TOOL_DRY}`, 0.7],
        [`A single axe blow into a pine tree, a low dull thunk with a quick wood fiber crack. ${TOOL_DRY}`, 0.7],
        [`A single woodcutter's axe biting deep into a birch trunk, a muffled wooden thud and a short chip crack. ${TOOL_DRY}`, 0.7],
        [`A single two-handed axe strike on a big tree, a profound dull 'thunk' with a small splinter snap. ${TOOL_DRY}`, 0.7],
      ],
    },
  },
  steps: {
    dir: "general/steps", mean: -22, filter: LOWPASS, tails: [-35, -45, -60], minDur: 0.2,
    clips: {
      pasto: [
        ["heavy dull footstep on thick grass, a low muffled soft rustle with a deep thud", "slow footstep on dense meadow grass, a deep muted rustle and low thump", "soft footstep on grass, a heavy dull swish with a low thud", "muffled footstep pressing down grass, a low rustle with weighty body"].map((s) => [`A single ${s}, leather boot, one step only. ${TOOL_DRY}`, 0.5]),
      ][0],
      tierra: [
        ["dry deep footstep on hard packed dirt, a low dull thud with faint muffled grit", "heavy footstep on a dry earth path, a deep matte thump with a soft low scuff", "dull footstep on firm dry soil, a low muffled stomp", "soft deep footstep on a dirt road, a matte low thud with slight dry grit"].map((s) => [`A single ${s}, leather boot, one step only. ${TOOL_DRY}`, 0.5]),
      ][0],
      agua: [
        ["short deep footstep in shallow water, a low wet thud and a muffled gurgle", "footstep wading in shallow water, a deep dull wet plop with low body", "heavy footstep in ankle-deep water, a low muffled splosh", "soft footstep in a shallow puddle, a deep wet thump"].map((s) => [`A single ${s}, one step only. ${TOOL_DRY} No droplets, no spray.`, 0.5]),
      ][0],
    },
  },
  projectiles: {
    dir: "general/projectiles", mean: -17, filter: "", tails: [-40, -50, -60], minDur: 0.25,
    clips: {
      flecha_disparo: [
        [`A longbow string releasing with a sharp twang-thump, and a short light fast whistle of an arrow leaving, quick and light. ${DRY} ${STYLE}`, 0.7],
        [`A bowstring snap and a quick arrow whoosh as it flies away, light and fast. ${DRY} ${STYLE}`, 0.7],
      ],
      flecha_impacto: [
        [`An arrow hitting a wooden target: a short dry 'thwip-thunk', the arrow sticking in wood. ${DRY} ${STYLE}`, 0.5],
        [`An arrow sinking into a wooden shield, a short dry 'thwip-thunk' with a tiny vibration. ${DRY} ${STYLE}`, 0.5],
      ],
      jabalina_disparo: [
        [`A heavy javelin throw: a short strong breath of effort from a man (no words) and a long, low, deep whistling whoosh of a big heavy spear shaft cutting the air, slow and heavy. ${DRY} ${STYLE}`, 1.4],
        [`A powerful overhand throw of a huge javelin: a brief exhale of effort (no words) and a deep slow heavy whoosh of the thick shaft flying. ${DRY} ${STYLE}`, 1.4],
      ],
      jabalina_impacto: [
        [`A big heavy javelin slamming into a wooden target with a deep dull thud, the thick shaft vibrating with a low wobble. ${DRY} ${STYLE}`, 0.9],
        [`A heavy javelin driving into a wooden board, a deep forceful low thump and a slow low shaft vibration. ${DRY} ${STYLE}`, 0.9],
      ],
    },
  },
  "screams-human": {
    dir: "human/screams", mean: -17, filter: "", tails: [-45, -55, -60], minDur: 0.6,
    clips: {
      death: [
        [`A short sharp male soldier scream of pain, abrupt, raw, mid-low pitch, cut off sharply. ${SCREAM}`, 0.8],
        [`A long agonizing male scream of a dying medieval soldier, a deep tearing voice that slowly fades out. ${SCREAM}`, 1.5],
        [`A hoarse gasping male cry of pain as if stabbed, mid pitch, with a breathy final groan. ${SCREAM}`, 1.2],
        [`A loud shocked male yell of pain, mid-high pitch, quick and raw. ${SCREAM}`, 0.8],
        [`A deep guttural male scream of agony of a dying knight, rough and tearing, fading out. ${SCREAM}`, 1.5],
        [`A short strangled male cry of death, choked, with a cracking voice. ${SCREAM}`, 0.9],
        [`A drawn-out male scream of pain with a trembling vibrato that fades into a weak moan. ${SCREAM}`, 1.5],
        [`A sudden low male grunt-scream of impact and pain, short and raw. ${SCREAM}`, 0.7],
      ],
      worker_death: [
        [`A terrified high-pitched scream of a panicked male villager, voice cracking, short. ${SCREAM}`, 0.9],
        [`A long frightened shrieking scream of a peasant farmer, high and trembling, fading. ${SCREAM}`, 1.4],
        [`A cracking panicked shriek of a scared male peasant, breathy and desperate. ${SCREAM}`, 1.0],
        [`A whimpering frightened scream of a villager that breaks into a sob, high and quivering. ${SCREAM}`, 1.3],
      ],
    },
  },
  "screams-elf": {
    dir: "elf/screams", mean: -17, filter: "", tails: [-45, -55, -60], minDur: 0.6,
    clips: {
      death: [
        [`A short dramatic high-pitched male elf cry of pain, graceful and tragic, abrupt. ${SCREAM}`, 0.8],
        [`A long anguished melodic male elf scream of a dying warrior, clear and ringing, slowly fading out. ${SCREAM}`, 1.5],
        [`A sharp startled male elf cry of pain, mid-high pitch, quick and clean. ${SCREAM}`, 0.8],
        [`A tragic drawn-out elf wail of agony with a trembling vibrato, high and beautiful, fading. ${SCREAM}`, 1.5],
        [`A breathy gasping male elf cry of pain that breaks into a soft sigh. ${SCREAM}`, 1.1],
        [`A proud defiant elf cry of pain, mid-high pitch, cut short. ${SCREAM}`, 0.9],
        [`A piercing dramatic male elf shout of anguish, tense and sorrowful, medium length. ${SCREAM}`, 1.2],
        [`A short sudden elf yelp of pain and surprise, light and sharp. ${SCREAM}`, 0.6],
      ],
      worker_death: [
        [`A soft frightened high-pitched cry of a young elf, trembling and delicate, short. ${SCREAM}`, 0.9],
        [`A scared quivering elf scream of a young servant, high and breathy, fading. ${SCREAM}`, 1.3],
        [`A fragile terrified elf shriek that breaks into a whimper, young voice. ${SCREAM}`, 1.1],
        [`A short startled high gasp-scream of a young elf, light and trembling. ${SCREAM}`, 0.8],
      ],
    },
  },
  "screams-dwarf": {
    dir: "dwarf/screams", mean: -17, filter: "", tails: [-45, -55, -60], minDur: 0.6,
    clips: {
      death: [
        [`A deep gravelly dwarf grunt of pain and rage, short and heavy, bearded miner. ${SCREAM}`, 0.8],
        [`A long low dwarf groan of agony that slowly fades out, gruff and gravelly. ${SCREAM}`, 1.5],
        [`A hoarse bellowing dwarf shout of pain, deep and thick, medium length. ${SCREAM}`, 1.1],
        [`A short sharp low dwarf grunt-yell of pain, rough, cut off. ${SCREAM}`, 0.7],
        [`A furious deep dwarf roar of rage and pain that turns into a wheezing groan. ${SCREAM}`, 1.4],
        [`A heavy gruff dwarf cry of pain, very low-pitched, breathy at the end. ${SCREAM}`, 1.2],
        [`A snarling low dwarf scream of defiance and pain, gravelly, medium length. ${SCREAM}`, 1.0],
        [`A deep dwarf grunt of impact and pain with a rough exhale, short. ${SCREAM}`, 0.6],
      ],
      worker_death: [
        [`A hoarse low startled yell of pain from a dwarf miner, gruff, short. ${SCREAM}`, 0.8],
        [`A gruff dwarf worker groan of pain that trails off, mid-low pitch. ${SCREAM}`, 1.2],
        [`A rough surprised dwarf yelp of pain, hoarse, quick. ${SCREAM}`, 0.7],
        [`A weary low dwarf cry of pain that fades into a sigh. ${SCREAM}`, 1.1],
      ],
    },
  },
  pigs: {
    dir: "dwarf/buildings/ganaderia", mean: -17, filter: "lowpass=f=9000:poles=2", tails: [-40, -50, -60], minDur: 0.4,
    clips: {
      pig: [
        [`A single short low pig grunt, a snorting oink, farm pig close-mic'd. ${DRY} No squealing, no high-pitched squeal. ${STYLE}`, 0.8],
        [`A single pig snort and huff, a short wet snorting breath of a farm pig. ${DRY} No squealing, no high-pitched squeal. ${STYLE}`, 0.8],
        [`A single deep pig grunt, a long low guttural grunt of a big pig. ${DRY} No squealing, no high-pitched squeal. ${STYLE}`, 1.0],
        [`Two quick short pig grunts, low and snorting, farm pig. ${DRY} No squealing, no high-pitched squeal. ${STYLE}`, 1.0],
      ],
    },
  },
  "screams-orc": {
    dir: "orc/screams", mean: -17, filter: "", tails: [-45, -55, -60], minDur: 0.6,
    clips: {
      death: [
        [`A guttural bestial orc roar of agony, deep and raging, short and brutal. ${SCREAM}`, 0.9],
        [`A long deep orc roar of dying fury that ends with a hoarse final growl. ${SCREAM}`, 1.5],
        [`A ragged wheezing orc death roar, rough, low and raspy, fading out. ${SCREAM}`, 1.4],
        [`A furious double roar of a wounded orc, very deep, snarling, with a last rough bellow. ${SCREAM}`, 1.5],
        [`A raspy low orc scream of pain, guttural and animalistic, medium length. ${SCREAM}`, 1.1],
        [`A thundering orc bellow of agony cut short, very deep and heavy. ${SCREAM}`, 0.8],
        [`A cracked orc roar of rage that falls into a gurgling growl as it dies. ${SCREAM}`, 1.4],
        [`A snarling orc roar-scream of pain, brutal, mid-low pitch, short. ${SCREAM}`, 0.8],
      ],
      worker_death: [
        [`A frightened wailing shriek of a beaten orc slave, broken and pitiful, mid-high pitch. ${SCREAM}`, 1.0],
        [`A pained whining scream of a cowering orc slave, cracking and trembling, medium length. ${SCREAM}`, 1.3],
        [`A pitiful quivering orc cry of fear and pain that breaks into a whimper. ${SCREAM}`, 1.2],
        [`A short terrified squealing yelp of a mistreated orc slave, hoarse and broken. ${SCREAM}`, 0.8],
      ],
    },
  },
};

const headers = { "xi-api-key": KEY };
const usedChars = async () => (await (await fetch(API + "/user/subscription", { headers })).json()).character_count;
const ff = (...a) => spawnSync(FFMPEG, ["-y", "-hide_banner", ...a], { encoding: "utf8" });
const duration = (f) => { const m = ff("-i", f).stderr.match(/Duration: (\d+):(\d+):([0-9.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
const vol = (f, key) => parseFloat(ff("-i", f, "-af", "volumedetect", "-f", "null", "-").stderr.match(new RegExp(key + "_volume: (-?[0-9.]+) dB"))?.[1]);

// Recorte de silencio inicial (-55 dB), pico a -1 dB, recorte de cola RELATIVO al pico (si el clip queda por debajo
// de minDur se relaja el umbral), filtro del grupo y nivelación individual: se ajusta la ganancia hasta que el
// mean_volume del mp3 FINAL (el codec rellena los clips cortos) coincida con el objetivo; fundido final de 20 ms.
function postProcess(raw, dest, g) {
  const t0 = dest + ".t0.wav", t1 = dest + ".t1.wav", tmp = dest + ".tmp.wav", lvl = dest + ".lvl.wav";
  const head = "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.01";
  try {
    if (ff("-i", raw, "-af", head, "-ar", "44100", "-ac", "1", t0).status !== 0) return false;
    const pk = vol(t0, "max");
    if (!Number.isFinite(pk) || ff("-i", t0, "-af", "volume=" + (-1 - pk).toFixed(2) + "dB", "-ar", "44100", "-ac", "1", t1).status !== 0) return false;
    for (const th of g.tails) {
      const tail = "silenceremove=start_periods=1:start_threshold=" + th + "dB:start_silence=0.01";
      const af = tail + ",areverse," + tail + ",areverse" + (g.filter ? "," + g.filter : "");
      if (ff("-i", t1, "-af", af, "-ar", "44100", "-ac", "1", tmp).status !== 0) return false;
      if (duration(tmp) >= g.minDur) break;
    }
    let gain = g.mean - vol(tmp, "mean");
    if (!Number.isFinite(gain)) return false;
    for (let i = 0; i < 3; i++) {
      if (ff("-i", tmp, "-af", "volume=" + gain.toFixed(2) + "dB,alimiter=limit=0.89:level=disabled", "-ar", "44100", "-ac", "1", lvl).status !== 0) return false;
      const d = duration(lvl);
      if (ff("-i", lvl, "-af", "afade=t=out:st=" + Math.max(d - 0.02, 0).toFixed(3) + ":d=0.02", "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status !== 0) return false;
      const err = g.mean - vol(dest, "mean");
      if (Math.abs(err) < 0.5) break;
      gain += err;
    }
    return true;
  } catch { return false; } finally { for (const f of [t0, t1, tmp, lvl]) rmSync(f, { force: true }); }
}

const failed = [];
let generated = 0;
const before = await usedChars();

for (const [group, g] of Object.entries(GROUPS)) {
  for (const [name, variants] of Object.entries(g.clips)) {
    for (const [i, [prompt, secs]] of variants.entries()) {
      const rel = `assets/sounds/${g.dir}/${name}_${i + 1}.mp3`;
      const dest = join(ROOT, rel), raw = join(ROOT, "tools", "_general_raw", group, `${name}_${i + 1}.mp3`);
      mkdirSync(dirname(dest), { recursive: true }); mkdirSync(dirname(raw), { recursive: true });
      if (existsSync(dest)) continue;
      try {
        if (!existsSync(raw)) {
          const text = prompt.length + STYLE.length + 1 <= 450 && !prompt.includes(STYLE) ? `${prompt} ${STYLE}` : prompt; // la API limita el texto a 450 caracteres
          const r = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
            method: "POST", headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, 450), duration_seconds: Math.max(secs, 0.5), prompt_influence: INFLUENCE, model_id: "eleven_text_to_sound_v2" }),
          });
          if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
          writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
          generated++;
        }
        if (!postProcess(raw, dest, g)) { failed.push(`${rel}: ffmpeg`); console.error("FALLO ffmpeg", rel); continue; }
        console.log("ok", rel, duration(dest).toFixed(2) + "s", "mean " + vol(dest, "mean") + " dB, pico " + vol(dest, "max") + " dB");
      } catch (e) {
        failed.push(`${rel}: ${e.message}`);
        console.error("FALLO", rel, e.message);
      }
    }
  }
}
console.log(`\nClips nuevos: ${generated} | créditos (delta cuenta): ${(await usedChars()) - before} | fallos: ${failed.length}`);
failed.forEach((f) => console.log(" -", f));
