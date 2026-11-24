// How well-known each Pokémon is, on a 1–100 scale. This single number drives
// rarity: within each prompt, the most familiar answers are "Common" and the
// least familiar are "Ultra Rare". Tweak freely, then run `npm run data`.
//
// Anything not listed in STARS gets a default from its generation, plus a bump
// for starter families and legendaries (see build-pokemon.mjs).

// Default familiarity by generation for Pokémon not listed below.
export const GENERATION_BASE = { 1: 56, 2: 42, 3: 40, 4: 38, 5: 28, 6: 31, 7: 31, 8: 27, 9: 26 };

// Hand-set scores for the Pokémon people actually talk about (PokéAPI slugs).
export const STARS = {
  // Gen 1
  pikachu: 100, charizard: 98, eevee: 97, mewtwo: 96, bulbasaur: 95, charmander: 95, squirtle: 95,
  jigglypuff: 94, snorlax: 94, gengar: 94, mew: 93, meowth: 93, psyduck: 93, magikarp: 93,
  gyarados: 90, ditto: 90, dragonite: 88, blastoise: 88, venusaur: 85, raichu: 85, onix: 85,
  lapras: 84, vaporeon: 84, slowpoke: 82, jolteon: 82, flareon: 82, articuno: 82, zapdos: 82,
  moltres: 82, arcanine: 82, vulpix: 82, cubone: 82, machamp: 80, alakazam: 80, butterfree: 80,
  growlithe: 80, caterpie: 80, pidgey: 80, rattata: 80, zubat: 80, ninetales: 78, scyther: 78,
  geodude: 78, clefairy: 78, diglett: 78, koffing: 76, ekans: 75, abra: 75, gastly: 75,
  'mr-mime': 75, wartortle: 75, ivysaur: 75, charmeleon: 75, haunter: 72, arbok: 72, weezing: 72,
  poliwag: 72, chansey: 72, magnemite: 72, starmie: 72, ponyta: 72, voltorb: 70, oddish: 70,
  dratini: 70, beedrill: 70, pidgeot: 70, aerodactyl: 68, wigglytuff: 68, golem: 68,
  farfetchd: 68, metapod: 68, staryu: 68, tentacool: 68,
  // Gen 1 that most people half-remember
  nidorina: 45, nidorino: 45, parasect: 45, venomoth: 45, weepinbell: 45, dodrio: 45,
  dewgong: 45, seaking: 45, tangela: 48, seadra: 48, omastar: 48, kakuna: 52,
  // Gen 2
  togepi: 88, umbreon: 90, lugia: 88, espeon: 86, pichu: 85, cyndaquil: 84, totodile: 84,
  'ho-oh': 82, chikorita: 82, wobbuffet: 80, scizor: 80, tyranitar: 80, marill: 78, unown: 78,
  suicune: 75, typhlosion: 75, steelix: 75, celebi: 72, entei: 72, raikou: 72, ampharos: 72,
  feraligatr: 72, crobat: 72, sudowoodo: 70, heracross: 70, wooper: 70, mareep: 68,
  azumarill: 68, quagsire: 68, blissey: 68, houndoom: 68, shuckle: 68, dunsparce: 66,
  meganium: 65, hoothoot: 62, larvitar: 62, murkrow: 62, teddiursa: 62, miltank: 62, furret: 62,
  // Gen 3
  rayquaza: 90, gardevoir: 85, mudkip: 85, torchic: 84, treecko: 82, blaziken: 82, kyogre: 82,
  groudon: 82, absol: 78, sceptile: 78, swampert: 75, latias: 75, latios: 75, salamence: 75,
  milotic: 75, wailord: 75, ralts: 72, jirachi: 72, deoxys: 72, metagross: 72, sableye: 70,
  flygon: 70, zigzagoon: 68, feebas: 66, mawile: 65, aggron: 65, skitty: 65, spinda: 64,
  luvdisc: 64, plusle: 62, minun: 62, wingull: 62, pelipper: 62, ludicolo: 62, slaking: 62,
  sharpedo: 62, spheal: 62, shedinja: 62, regirock: 62, regice: 62, bagon: 62, altaria: 62,
  swablu: 62,
  // Gen 4
  lucario: 94, piplup: 85, glaceon: 82, leafeon: 82, garchomp: 82, chimchar: 80, arceus: 80,
  turtwig: 78, dialga: 78, giratina: 78, palkia: 76, togekiss: 75, infernape: 75, bidoof: 75,
  riolu: 72, luxray: 72, darkrai: 72, rotom: 72, empoleon: 70, torterra: 70, gible: 68,
  weavile: 68, gallade: 68, munchlax: 68, pachirisu: 66, shinx: 65, drifloon: 64,
  magnezone: 62, honchkrow: 62, froslass: 62, spiritomb: 62, shaymin: 62, manaphy: 62,
  starly: 62, lopunny: 62, mamoswine: 62, kricketot: 55,
  // Gen 5
  oshawott: 74, snivy: 72, tepig: 70, zekrom: 70, reshiram: 70, zoroark: 70, chandelure: 70,
  zorua: 66, hydreigon: 65, trubbish: 64, garbodor: 64, serperior: 62, kyurem: 62,
  stunfisk: 62, volcarona: 62, victini: 60, emolga: 60, vanillite: 60, samurott: 58,
  emboar: 58, excadrill: 58, krookodile: 58, haxorus: 58, scraggy: 58, bisharp: 58,
  audino: 58, litwick: 58, vanilluxe: 58, deerling: 58, joltik: 58, axew: 58,
  // Gen 6
  greninja: 94, sylveon: 90, froakie: 72, fennekin: 70, aegislash: 64, klefki: 64,
  chespin: 62, xerneas: 62, yveltal: 62, goomy: 62, goodra: 62, pancham: 62, espurr: 62,
  dedenne: 62, hawlucha: 60, talonflame: 60, delphox: 58, zygarde: 58, honedge: 58, meowstic: 58,
  // Gen 7
  mimikyu: 92, rowlet: 80, litten: 72, incineroar: 68, popplio: 68, rockruff: 68,
  decidueye: 65, solgaleo: 65, lunala: 62, necrozma: 62, lycanroc: 62, primarina: 58,
  marshadow: 58, 'tapu-koko': 58, cosmog: 58, bewear: 58, pyukumuku: 55, wishiwashi: 55,
  komala: 55, togedemaru: 55, meltan: 55, melmetal: 55, stufful: 55,
  // Gen 8
  wooloo: 72, scorbunny: 72, sobble: 72, grookey: 70, cinderace: 62, zacian: 62,
  corviknight: 62, snom: 62, rillaboom: 58, inteleon: 58, zamazenta: 58, yamper: 58,
  dragapult: 58, cramorant: 58, eternatus: 55, toxtricity: 55, alcremie: 55, morpeko: 55,
  dreepy: 55, falinks: 52,
  // Gen 9
  sprigatito: 72, fuecoco: 72, quaxly: 66, lechonk: 60, meowscarada: 58, koraidon: 58,
  miraidon: 58, skeledirge: 55, tinkaton: 55, pawmi: 52, wiglett: 52, gimmighoul: 52,
  gholdengo: 52, maushold: 50, ogerpon: 50, kingambit: 50, annihilape: 50,
};

// The famous "obscure" picks. Everyone thinks they're being clever by naming
// these, so they score as "Meme Pick" (15) instead of a rare tier.
export const MEME_PICKS = [
  'bidoof', 'shuckle', 'unown', 'spinda', 'smeargle', 'luvdisc', 'stunfisk', 'trubbish',
  'garbodor', 'klefki', 'dunsparce', 'delibird', 'feebas', 'kricketot', 'sunkern',
  'pyukumuku', 'wishiwashi', 'falinks',
];
