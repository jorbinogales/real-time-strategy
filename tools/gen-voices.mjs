// Voces de las unidades humanas en español latino neutro con ElevenLabs.
// Uso: ELEVENLABS_API_KEY=... [FFMPEG=ruta] node --use-system-ca tools/gen-voices.mjs
// Idempotente: reutiliza voces de tools/voices.json (locale es-latam) y salta mp3 que ya existen.
// Cada clip se verifica con Scribe (idioma español + texto parecido); hasta 2 reintentos.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY en el entorno");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VOICES_JSON = join(ROOT, "tools", "voices.json");
const API = "https://api.elevenlabs.io/v1";
const MODEL = "eleven_turbo_v2_5"; // acepta language_code (evita la deriva de idioma)
const LOCALE = "es-es";
const MAX_TRIES = 3; // 1 intento + 2 reintentos
const MIN_SIMILARITY = 0.6;
const TARGET_LUFS = -18;

const ACENTO = "Native speaker of Spanish from Spain with a clear Castilian peninsular accent (acento castellano de España), with the characteristic interdental 'z/c' lisp (ceceo castellano), NOT Latin American, NOT Mexican, NOT Argentine. Clean studio recording, medieval knight-era delivery.";

const HUMAN_UNITS = {
  "soldado-raso": {
    name: "RTS Soldado Raso (es-es)",
    desc: `A young adult male voice, about 20 years old, clear, energetic, eager and loyal, slightly nervous but brave, bright. Joven, acento castellano de España, claro, enérgico. ${ACENTO}`,
    settings: { stability: 0.4, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true },
    lines: {
      select: ["¿Sí, mi señor?", "¡A vuestras órdenes!", "¿Me llamabais, señor?", "¡Aquí estoy, mi señor!", "¿Qué necesitáis, señor?"],
      spawn: ["¡Listo para servir!", "¡Por Castilla, mi señor!", "¡Presentándome, señor!"],
      order_move: ["¡Ahora mismo, señor!", "¡Voy corriendo!", "¡Me muevo ya, mi señor!", "¡Allá voy!", "¡En camino, señor!", "¡Sí, señor, ya voy!"],
      order_attack: ["¡Al ataque!", "¡Voy a por ellos!", "¡Sí, mi señor, los detendré!", "¡Los haré retroceder!", "¡Que vengan, no les temo!", "¡A la carga, señor!"],
      attack: ["¡Santiago y cierra, España!", "¡Tomad esto, bellacos!", "¡Por el rey!", "¡No pasaréis!", "¡Por mi tierra y mi gente!", "¡Pardiez, ahí va eso!"],
      death: ["¡Ay, madre mía! ¡Piedad!", "¡Perdonadme, mi señor!", "¡No... aún soy muy joven!", "¡Que Dios me... acoja!"],
    },
  },
  lancero: {
    name: "RTS Lancero (es-es)",
    desc: `A deep, gravelly, harsh middle-aged male voice, about 50 years old, a weathered veteran soldier, severe, slow and laconic, low-pitched and rough like a battle-hardened sergeant. Veterano grave, acento castellano de España. ${ACENTO}`,
    settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    lines: {
      select: ["Hablad.", "Os escucho.", "Ordenad, señor.", "Firme, señor.", "¿Qué se ofrece?"],
      spawn: ["Presente, mi señor.", "Cumpliré, señor.", "Que vengan, pues."],
      order_move: ["Avanzo.", "Marchando.", "Entendido.", "Me muevo.", "En marcha, señor.", "Hacia allá."],
      order_attack: ["Los aplastaré.", "Cerrando filas.", "Será un placer.", "Adelante, hombres.", "Sin piedad.", "Enemigo a la vista, atacamos."],
      attack: ["¡Cerrad filas!", "¡Probad mi lanza!", "¡Ni un paso más!", "¡Atrás, canallas!", "¡Voto a Dios, morid!", "¡Mantened la línea!"],
      death: ["Cumplí... mi deber...", "Mal rayo... me parta...", "Dios os guarde... señor...", "Al fin... descanso..."],
    },
  },
  arquero: {
    name: "RTS Arquero (es-es)",
    desc: `A medium-pitched adult male voice, about 30 years old, light, calm and relaxed, with a dry sarcastic, mocking tone, agile and unhurried, smooth and slightly playful. Sereno y socarrón, acento castellano de España. ${ACENTO}`,
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true },
    lines: {
      select: ["¿Algún blanco, señor?", "Decidme y apunto.", "Aquí estoy, aunque no lo parezca.", "Vos mandáis, yo disparo.", "¿Y ahora qué, mi señor?"],
      spawn: ["Ya llegué, tranquilos.", "Con vuestra venia, señor.", "Que tiemblen los bellacos."],
      order_move: ["Con calma, pero voy.", "Me muevo, señor.", "Paso ligero.", "Como una sombra.", "Ya voy, ya voy.", "Cambio de posición."],
      order_attack: ["Tengo a ese en la mira.", "Un blanco fácil.", "Los haré bailar.", "Apuntad... y fuego.", "Qué detalle, me traen blancos.", "Ya los tengo contados."],
      attack: ["Ahí va, que se aparte quien pueda.", "Callad, que apunto.", "Un saludo de parte del rey.", "Directo al blanco.", "¡Por Castilla, a volar!", "Eso os pasa por quedaros quietos."],
      death: ["Vaya... qué mala puntería la suya...", "Qué descortés... me han dado...", "Decidle a mi madre... que fallé...", "Se acabó... la función..."],
    },
  },
  campesino: {
    name: "RTS Campesino (es-es)",
    desc: `A warm, rustic, middle-aged male voice, about 45 years old, a humble hardworking medieval peasant farmer, earthy, kindly and a bit weary, mid-low pitch with a slightly nasal rural tone, simple and sincere. Campesino humilde, acento castellano de España. ${ACENTO}`,
    settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    lines: {
      select: ["¿Mande, mi señor?", "Decid, aquí me tenéis.", "Con vuestro permiso, señor.", "¿Qué se os ofrece, señor?", "Dispuesto, aunque cansado."],
      spawn: ["¡Ya estoy aquí, señor!", "A trabajar, que el campo no espera.", "Servidor, mi señor."],
      order_move: ["Voy, señor, voy.", "A pie, pero llego.", "Allá me encamino.", "Despacito, que me duelen las piernas.", "Como mandéis, señor.", "Ya me pongo en marcha."],
      order_attack: ["¿Pelear yo? Bueno, si lo mandáis...", "Con la horca iré a por ellos.", "Que San Isidro me ampare.", "Por mis cosechas, ¡al ataque!", "Nunca he luchado, pero ahí voy.", "¡Que se atrevan a pisar mi huerto!"],
      order_work: ["A ello, señor.", "Manos a la obra.", "Esto se hace en un santiamén.", "A trabajar se ha dicho."],
      attack: ["¡Tomad, con la horca!", "¡Fuera de mis tierras!", "¡Pardiez, me las pagaréis!", "¡Y esto por mis cosechas!", "¡Lárgate, bellaco!", "¡Cobardes, fuera de aquí!"],
      death: ["¡Ay, mis pobres cosechas...!", "Que alguien cuide mi huerto...", "Yo solo quería labrar...", "Mi mujer... mis hijos... ¡ay!"],
    },
  },
};

const ACENTO_ORC = "Native speaker of Spanish from Spain with a clear Castilian peninsular accent (acento castellano de España), with the characteristic interdental 'z/c' lisp, NOT Latin American. Orc fantasy warrior character, growling and guttural delivery, raw and unfiltered studio recording.";

const ORC_UNITS = {
  berserker: {
    name: "RTS Orco Berserker (es-es)",
    desc: `A very deep, raspy, guttural adult male voice, an insane orc berserker: overflowing with fury, snarling, shouting, maniacal laughter, unhinged and aggressive, loud roaring. Orco berserker enloquecido, acento castellano de España. ${ACENTO_ORC}`,
    settings: { stability: 0.25, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true },
    lines: {
      select: ["¡Sangre!", "¿Quién quiere morir primero?", "¡Já, já! ¡Dime a quién mato!", "¡Guerra, guerra!", "¿Ya toca matar?"],
      spawn: ["¡Ya estoy aquí, a sangrar!", "¡Por los cráneos del clan!", "¡Me pica el hacha, jefe!"],
      order_move: ["¡Voy corriendo a matar!", "¡Ya voy, ya voy, já!", "¡Sangre al camino!", "¡Fuera de mi paso!", "¡Corro como el trueno!", "¡Adelante, adelante!"],
      order_attack: ["¡Los despedazaré!", "¡A destripar!", "¡Que corra la sangre!", "¡Los haré pedazos, já!", "¡Muerte a todos!", "¡Voy a por sus cráneos!"],
      attack: ["¡A matar, a matar!", "¡Muere, muere, muere!", "¡Sangre, sangre!", "¡Te arrancaré el corazón!", "¡Qué divertido es matar!", "¡Cráneos para el trono!"],
      death: ["¡Aaagh! ¡Todavía quiero matar!", "¡Me río de la muerte, já!", "¡Mi sangre es del clan!", "¡Más... sangre...!"],
    },
  },
  "orco-lancero": {
    name: "RTS Orco Lancero (es-es)",
    desc: `A deep, hoarse, hissing adult male voice, an orc spearman: aggressive but dry, cold and menacing, cruel and sibilant, low-pitched and slow, a hissing threatening growl. Orco lancero cruel, acento castellano de España. ${ACENTO_ORC}`,
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
    lines: {
      select: ["Habla.", "Te escucho, miserable.", "¿Qué quieres?", "Mi lanza tiene sed.", "Ordena, jefe."],
      spawn: ["Listo para empalar.", "El clan me manda.", "Que tiemblen sus aldeas."],
      order_move: ["Me muevo.", "Voy, despacio y seguro.", "A la caza.", "Sin prisa, sin piedad.", "Hacia la presa.", "Marcho, jefe."],
      order_attack: ["Los ensartaré.", "Morirán lentamente.", "Será un placer cruel.", "Prepárate, presa.", "Se acabó su suerte.", "Empalad a todos."],
      attack: ["¡Siente mi lanza!", "¡Muere despacio!", "Sufre, humano.", "¡Atravesado!", "¡Ni un grito más!", "¡Cae, gusano!"],
      death: ["Maldito... seas...", "El clan... me vengará...", "Me duele... pero os arrastraré...", "Frío... qué frío..."],
    },
  },
  "lanzador-jabalina": {
    name: "RTS Orco Lanzador (es-es)",
    desc: `A deep, raspy adult male voice, an orc javelin thrower: aggressive, mocking and cocky, boasting about his perfect aim, sneering and playful, shouts when throwing. Orco burlón y presumido, acento castellano de España. ${ACENTO_ORC}`,
    settings: { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true },
    lines: {
      select: ["¿A quién clavo hoy?", "Dime el blanco, já.", "Nunca fallo, jefe.", "¿Me llamabas, jefe?", "Con esta puntería, mándame."],
      spawn: ["Aquí el mejor lanzador.", "¡Que se escondan, já!", "A punto y afilado."],
      order_move: ["Ya voy, tranquilo.", "Me muevo, jefe.", "Cambio de sitio.", "Corriendo, corriendo.", "Voy a por un buen sitio.", "Marcho a mi manera."],
      order_attack: ["Les haré agujeros.", "¡Esos son míos!", "A ver si aciertas... ah, yo sí.", "Los tengo en el punto de mira.", "Qué blanco tan gordo.", "A lanzar, que me aburro."],
      attack: ["¡Toma jabalina!", "¡Directo al ojo!", "¡Eso es puntería!", "¡Esquívala si puedes!", "¡Otro más para la colección!", "¡Clavado, clavado!"],
      death: ["¡No... ha sido... un buen lanzamiento!", "Me han... acertado... qué insulto...", "¡Mi jabalina... no falló!", "Fallé... el último..."],
    },
  },
  esclavo: {
    name: "RTS Orco Esclavo (es-es)",
    desc: `A frightened, beaten, trembling adult male voice, a cowering orc slave: stuttering, whimpering, begging, submissive and broken, hoarse and weak, shaky and tearful. Esclavo asustado y golpeado, acento castellano de España. ${ACENTO_ORC}`,
    settings: { stability: 0.3, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
    lines: {
      select: ["¿S-sí, amo?", "¡No me peguéis!", "Aquí estoy, amo...", "¿Qué queréis, mi amo?", "P-por favor, no..."],
      spawn: ["¡S-sí, amo, ya salgo!", "Me han... me han traído...", "A v-vuestro servicio..."],
      order_move: ["Enseguida, amo, enseguida.", "S-sí, amo, corro.", "Voy, voy, no gritéis.", "Me muevo, me muevo...", "Perdón, perdón, ya voy.", "Voy deprisa, amo."],
      order_attack: ["¿Yo... pelear? S-sí, amo...", "Por favor, no me mandéis...", "V-voy, aunque tiemblo...", "Me matarán, pero voy...", "Lo haré, lo haré...", "Tened piedad de mí, amo."],
      order_work: ["S-sí, amo, trabajo.", "Ya lo hago, ya lo hago.", "No me peguéis, trabajo.", "Cargaré lo que mandéis."],
      attack: ["¡Quitad, quitad, por favor!", "¡Dejadme... dejadme!", "¡Por favor, no más!", "¡Tomad... tomad esto!", "¡No me tocaréis!", "¡Aléjate, aléjate!"],
      death: ["Al fin... descanso...", "Gracias... amo... por... nada...", "No... duele... ya...", "Mamá... ay..."],
    },
  },
};

const ACENTO_ELF = "Native speaker of Spanish from Spain with a clear Castilian peninsular accent (acento castellano de España), with the characteristic interdental 'z/c' lisp, NOT Latin American. Elegant, melodic, serene and ethereal elven fantasy character, soft and refined, clean studio recording.";

// Elfos: mismas categorías y cantidades que las unidades humanas equivalentes (campesino, soldado-raso, lancero, arquero).
// voiceKey: clave en tools/voices.json cuando el id de unidad ya lo usa otra facción (arquero).
const ELF_UNITS = {
  trabajador: {
    name: "RTS Elfo Trabajador (es-es)",
    desc: `A young adult male elf voice, soft, gentle, helpful and eager to serve, light and airy, melodic and serene, slightly shy. Elfo joven y servicial, voz suave y etérea, acento castellano de España. ${ACENTO_ELF}`,
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    lines: {
      select: ["Que la luz os guíe, ¿qué necesitáis?", "Os escucho, mi señor.", "Con gusto, decidme.", "¿En qué puedo ayudaros?", "Aquí estoy, entre las hojas."],
      spawn: ["Que el bosque os bendiga.", "Listo para servir, mi señor.", "He llegado con la brisa."],
      order_move: ["Voy, suave como el viento.", "Enseguida, mi señor.", "Con paso ligero.", "Siguiendo el sendero.", "A vuestra orden, ya camino.", "Que las hojas me guíen."],
      order_attack: ["Si debo luchar, lucharé.", "Defenderé el bosque.", "Por la luz y los árboles.", "No temo, mi señor.", "Con valor, aunque tiemble.", "Que las estrellas me protejan."],
      order_work: ["Manos a la obra.", "Con cuidado y cariño.", "El bosque agradecerá este trabajo.", "Lo haré con gusto."],
      attack: ["¡Por el bosque!", "¡Atrás, sombras!", "¡Que la luz me ampare!", "¡Por los árboles!", "¡Fuera de aquí!", "¡No os temo!"],
      death: ["Ay... la luz se apaga...", "Perdonadme, mi señor...", "Vuelvo... al bosque...", "Qué frío... qué silencio..."],
    },
  },
  guerrero: {
    name: "RTS Elfo Guerrero (es-es)",
    desc: `A firm, noble adult male elf voice, about 30 years old, proud and clear, resolute, melodious and dignified, calm authority. Elfo guerrero noble, acento castellano de España. ${ACENTO_ELF}`,
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    lines: {
      select: ["Honor y luz, mi señor.", "Firme y dispuesto.", "¿Cuál es la misión?", "A vuestras órdenes, capitán.", "Decid, y obraré."],
      spawn: ["Por la corona de las hojas.", "Mi espada es vuestra.", "Listo para el combate."],
      order_move: ["Avanzo con honor.", "En marcha, mi señor.", "El sendero es mío.", "Hacia donde mandéis.", "Marcho bajo las estrellas.", "Sin demora."],
      order_attack: ["Por el honor de mi pueblo.", "¡Al combate!", "Que caigan las sombras.", "Mi espada no falla.", "Los detendré, mi señor.", "Con la luz como escudo."],
      attack: ["¡Por la luz!", "¡Por el reino del bosque!", "¡Sentid mi acero!", "¡Honor y gloria!", "¡Caed, sombras!", "¡No temo la oscuridad!"],
      death: ["Mi luz... se extingue...", "Con honor... caigo...", "Decid a mi pueblo... que luché...", "El bosque... me espera..."],
    },
  },
  guardian: {
    name: "RTS Elfo Guardián (es-es)",
    desc: `A deep, calm, serene and protective adult male elf voice, about 50 years old, resonant, slow and wise, grave and gentle at once, few words. Elfo guardián sereno y protector, acento castellano de España. ${ACENTO_ELF}`,
    settings: { stability: 0.6, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    lines: {
      select: ["Hablad, amigo.", "Os escucho, joven.", "Velo por vos.", "Sereno y atento.", "¿Qué se requiere?"],
      spawn: ["Guardaré este bosque.", "Presente y atento.", "Nadie pasará."],
      order_move: ["Voy, sin prisa.", "Con calma.", "El camino es largo, pero firme.", "Avanzo.", "A su lado, siempre.", "Lento y seguro."],
      order_attack: ["Protegeré lo nuestro.", "Que se acerquen.", "No retrocederé.", "Es hora de defender.", "El bosque no cae hoy.", "Nadie lo tocará."],
      attack: ["¡Detened vuestro paso!", "¡Atrás, invasores!", "¡Defiendo el bosque!", "¡Muralla viva!", "¡Retroceded, sombras!", "¡Aquí termináis!"],
      death: ["He cumplido... mi guarda...", "Que el bosque... os proteja...", "Descanso... al fin...", "Mis raíces... me llaman..."],
    },
  },
  arquero: {
    voiceKey: "elf-arquero",
    name: "RTS Elfo Arquero (es-es)",
    desc: `An agile, confident and precise adult male elf voice, about 28 years old, crisp, light and calm, melodious, a quiet sureness like a perfect marksman. Elfo arquero ágil y seguro, acento castellano de España. ${ACENTO_ELF}`,
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    lines: {
      select: ["Mi vista no falla.", "¿Qué blanco, mi señor?", "Atento al viento.", "Decidme dónde apuntar.", "Preciso y listo."],
      spawn: ["Flecha en el arco.", "He llegado, sin ruido.", "El viento me trae."],
      order_move: ["Ligero como la brisa.", "Me desplazo.", "Sin hacer ruido.", "Sombra entre los árboles.", "Busco mejor ángulo.", "A paso de ciervo."],
      order_attack: ["Ya lo tengo en la mira.", "Un solo disparo basta.", "Apunto y suelto.", "El blanco está marcado.", "No fallaré.", "Que vuelen las flechas."],
      attack: ["¡Flecha al viento!", "¡Directo al blanco!", "¡Toma esto!", "¡Vuela, flecha!", "¡Ni un movimiento!", "¡Cuerda tensa, tiro certero!"],
      death: ["Mi arco... se calla...", "El viento... se lleva mi flecha...", "Fallé... el último...", "Que mi flecha... llegue lejos..."],
    },
  },
};

const ACENTO_DWARF = "Native speaker of Spanish from Spain with a clear Castilian peninsular accent (acento castellano de España), with the characteristic interdental 'z/c' lisp, NOT Latin American. Fantasy dwarf character: bearded miner and blacksmith, deep, gravelly, hearty and rugged, raw studio recording.";

// Enanos: mismas categorías y cantidades que las unidades equivalentes. voiceKey: clave en tools/voices.json
// cuando el id de unidad ya lo usa otra facción (guerrero = élfico, lancero = humano).
const DWARF_UNITS = {
  obrero: {
    name: "RTS Enano Obrero (es-es)",
    desc: `A hoarse, gravelly, cheerful middle-aged male dwarf voice, jolly and hearty, a happy hardworking miner, rough and warm, mid-low pitch. Enano obrero ronco y alegre, acento castellano de España. ${ACENTO_DWARF}`,
    settings: { stability: 0.4, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
    lines: {
      select: ["¡Dime, jefe!", "¿Qué se te ofrece?", "¡Aquí estoy, con barba y todo!", "¿Trabajo? ¡Pues venga!", "¡Presente, y con sed!"],
      spawn: ["¡Ya estoy aquí, a currar!", "¡Por las barbas de mi abuelo!", "¡Listo para picar piedra!"],
      order_move: ["¡Voy, voy, que no se enfríe la forja!", "¡Ya me muevo, jefe!", "¡A caminar, que es gratis!", "¡Por los túneles voy!", "¡Allá me las den todas!", "¡En marcha, y con alegría!"],
      order_attack: ["¡Si hay que pelear, se pelea!", "¡Con el pico, si hace falta!", "¡Por mi barba, que no me temen!", "¡A darles caña!", "¡Que vengan, que tengo martillo!", "¡Por el oro y por la cerveza!"],
      order_work: ["¡Manos a la obra!", "¡A picar, que hay oro!", "¡Esto lo saco yo en un santiamén!", "¡Al tajo, compañeros!"],
      attack: ["¡Toma pico!", "¡Fuera de mi mina!", "¡Por las barbas!", "¡A ver quién puede más!", "¡Toma martillazo!", "¡Largo de aquí!"],
      death: ["¡Ay, mi barba...!", "¡Y yo sin acabar la cerveza...!", "¡Que alguien cuide mi mina...!", "¡Se acabó el tajo...!"],
    },
  },
  guerrero: {
    voiceKey: "dwarf-guerrero",
    name: "RTS Enano Guerrero (es-es)",
    desc: `A very deep, firm, powerful male dwarf voice, about 45 years old, proud and resolute, booming and gravelly, a veteran warrior with a thick beard. Enano guerrero profundo y orgulloso, acento castellano de España. ${ACENTO_DWARF}`,
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true },
    lines: {
      select: ["Por la piedra y el honor.", "A tus órdenes, jefe.", "Firme como la roca.", "Habla, que escucho.", "Mi hacha está lista."],
      spawn: ["Por el clan y las barbas.", "Mi hacha es tuya.", "Listo para la guerra."],
      order_move: ["Avanzo, firme.", "Por las montañas voy.", "Marcho con orgullo.", "A paso de enano.", "Sin demora, jefe.", "Hacia donde mandes."],
      order_attack: ["¡Por el honor del clan!", "¡Los partiré en dos!", "¡Sin piedad ni miedo!", "¡Que tiemble su carne!", "¡A por ellos, por mis ancestros!", "¡Mi hacha tiene hambre!"],
      attack: ["¡Por las montañas!", "¡Sentid mi hacha!", "¡Por mi barba!", "¡Caed, cobardes!", "¡Honor y acero!", "¡Piedra y fuego!"],
      death: ["Mi hacha... pasa a mi hijo...", "Con honor... me voy...", "Por el clan... hasta el final...", "La roca... me acoge..."],
    },
  },
  lancero: {
    voiceKey: "dwarf-lancero",
    name: "RTS Enano Lancero (es-es)",
    desc: `A serious, weathered, gruff and laconic old male dwarf veteran voice, low-pitched and rough, a battle-hardened spearman of few words. Enano lancero curtido, acento castellano de España. ${ACENTO_DWARF}`,
    settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    lines: {
      select: ["Habla.", "Te escucho.", "Ordena, jefe.", "Firme.", "¿Qué hay?"],
      spawn: ["Presente.", "Cumpliré.", "Que vengan."],
      order_move: ["Voy, jefe.", "En marcha.", "A paso firme.", "Marcho.", "Hacia allá.", "Sin prisa, sin pausa."],
      order_attack: ["Los clavaré.", "Murallas de lanzas.", "Será un honor.", "A formar, muchachos.", "Sin pasos atrás.", "Los detendré."],
      attack: ["¡Muro de lanzas!", "¡Atrás, bestias!", "¡Ni un paso!", "¡Prueba mi lanza!", "¡Firmes!", "¡Cierra filas!"],
      death: ["Cumplí... mi deber...", "Maldita sea... mi barba...", "Cuida el clan... jefe...", "Al fin... descanso..."],
    },
  },
  lanzador: {
    name: "RTS Enano Lanzador (es-es)",
    desc: `A more agile, mocking and quick male dwarf voice, a little higher-pitched and faster than other dwarves but still gruff, cocky and playful, boasting about his aim. Enano lanzador burlón, acento castellano de España. ${ACENTO_DWARF}`,
    settings: { stability: 0.35, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
    lines: {
      select: ["¿A quién le toca hoy?", "¡Dime el blanco, jefe!", "¡No fallo ni borracho!", "¿Me llamabas, jefe?", "¡Buena puntería, mejor humor!"],
      spawn: ["¡Aquí el mejor lanzador!", "¡Que se escondan, ja!", "¡Hachas afiladas y listo!"],
      order_move: ["¡Voy, voy, ligero!", "¡Cambio de sitio, jefe!", "¡Corriendo, corriendo!", "¡A buscar buen sitio!", "¡Rápido como una rata de mina!", "¡Allá voy, enano a la fuga!"],
      order_attack: ["¡Les haré agujeros!", "¡Ese es mío!", "¡Hoy llueven hachas!", "¡Los tengo a tiro!", "¡Qué blanco más gordo!", "¡A lanzar, que me aburro!"],
      attack: ["¡Toma hacha!", "¡Al ojo!", "¡Eso es puntería!", "¡Esquiva esta!", "¡Otro para la colección!", "¡Zas, clavado!"],
      death: ["¡No... era... mi mejor tiro!", "Me han... acertado... qué afrenta...", "¡Mi hacha... no falló!", "Fallé... el último..."],
    },
  },
};

const FACTIONS = {
  human: { dir: "assets/sounds/human/voices/es-es", units: HUMAN_UNITS },
  orc: { dir: "assets/sounds/orc/voices/es-es", units: ORC_UNITS },
  elf: { dir: "assets/sounds/elf/voices/es-es", units: ELF_UNITS },
  dwarf: { dir: "assets/sounds/dwarf/voices/es-es", units: DWARF_UNITS },
};

const headers = { "xi-api-key": KEY };
const post = async (path, body) => {
  const r = await fetch(API + path, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r;
};
const usedChars = async () => (await (await fetch(API + "/user/subscription", { headers })).json()).character_count;

const voices = existsSync(VOICES_JSON) ? JSON.parse(readFileSync(VOICES_JSON, "utf8")) : {};
const saveVoices = () => writeFileSync(VOICES_JSON, JSON.stringify(voices, null, 2) + "\n");

async function ensureVoice(unit, u) {
  if (voices[unit]?.locale === LOCALE) return voices[unit].voice_id;
  const design = await (await post("/text-to-voice/design", { voice_description: u.desc, auto_generate_text: true })).json();
  const v = await (await post("/text-to-voice", { voice_name: u.name, voice_description: u.desc, generated_voice_id: design.previews[0].generated_voice_id })).json();
  voices[unit] = { voice_id: v.voice_id, name: u.name, locale: LOCALE, description: u.desc };
  saveVoices();
  return v.voice_id;
}

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
  // Scribe confunde el idioma en frases de 1-4 palabras: si la transcripción coincide casi exacta, el audio es español inteligible.
  const short = norm(text).split(" ").length <= 6;
  const ok = sim >= MIN_SIMILARITY && (/^(spa|es)/i.test(lang) || (short && sim >= 0.85));
  return { ok, lang, sim: +sim.toFixed(2), heard: (j.text || "").trim() };
}

// --- audio: recorte de silencios + loudnorm de dos pasadas a -18 LUFS (+ ganancia si un clip corto queda bajo) ---
const ff = (...a) => spawnSync(FFMPEG, ["-y", "-hide_banner", ...a], { encoding: "utf8" });
const lufs = (f) => parseFloat(ff("-i", f, "-af", "ebur128", "-f", "null", "-").stderr.split("Summary:").pop().match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
function postProcess(raw, dest) {
  const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05";
  const tmp = dest + ".tmp.wav";
  if (ff("-i", raw, "-af", `${trim},areverse,${trim},areverse`, "-ar", "44100", "-ac", "1", tmp).status !== 0) return false;
  const ln = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=7`;
  const m = JSON.parse(ff("-i", tmp, "-af", `${ln}:print_format=json`, "-f", "null", "-").stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s)[0]);
  const lin = `${ln}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const norm2 = dest + ".norm.wav";
  if (ff("-i", tmp, "-af", lin, "-ar", "44100", "-ac", "1", norm2).status !== 0) return false;
  let af = "anull";
  const i = lufs(norm2);
  if (Number.isFinite(i) && i < TARGET_LUFS - 1.5) af = `volume=${Math.min(TARGET_LUFS - i, 10).toFixed(1)}dB,alimiter=limit=0.89:level=disabled`; // clips cortos bajos
  const ok = ff("-i", norm2, "-af", af, "-ar", "44100", "-ac", "1", "-b:a", "128k", dest).status === 0;
  rmSync(tmp, { force: true }); rmSync(norm2, { force: true });
  return ok;
}

const WANT = process.argv[2]; // human | orc (por defecto, todas)
const failed = [], retried = [];
let generated = 0, chars = 0, sttCalls = 0;
const before = await usedChars();

for (const [faction, { dir: REL_DIR, units }] of Object.entries(FACTIONS)) {
  if (WANT && faction !== WANT) continue;
  const OUT = join(ROOT, REL_DIR), manifest = {}, texto = {};
  for (const [unit, u] of Object.entries(units)) {
  const voiceId = await ensureVoice(u.voiceKey || unit, u);
  manifest[unit] = {}; texto[unit] = {};
  mkdirSync(join(OUT, unit), { recursive: true });
  for (const [cat, texts] of Object.entries(u.lines)) {
    manifest[unit][cat] = []; texto[unit][cat] = [];
    for (const [i, text] of texts.entries()) {
      const rel = `${REL_DIR}/${unit}/${cat}_${i + 1}.mp3`;
      const dest = join(ROOT, rel), raw = dest + ".raw";
      manifest[unit][cat].push(rel); texto[unit][cat].push(text);
      if (existsSync(dest)) continue;
      let v, tries = 0;
      try {
        while (tries < MAX_TRIES) {
          tries++;
          if (!existsSync(raw)) {
            const r = await post(`/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { text, model_id: MODEL, language_code: "es", voice_settings: u.settings });
            writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
            generated++; chars += text.length;
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
        console.log("ok", rel, `[${v.lang} ${v.sim}]`);
      } catch (e) {
        failed.push(`${rel}: ${e.message}`);
        rmSync(raw, { force: true });
        console.error("FALLO", rel, e.message);
      }
    }
  }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ ...manifest, texto }, null, 2) + "\n");
}
console.log(`\nClips TTS generados: ${generated} (incluye reintentos) | caracteres: ${chars} | llamadas STT: ${sttCalls} | créditos (delta cuenta): ${(await usedChars()) - before}`);
console.log("Con reintentos:", retried.length ? retried.join(", ") : "ninguno");
console.log("Fallos:", failed.length ? "\n - " + failed.join("\n - ") : "ninguno");
