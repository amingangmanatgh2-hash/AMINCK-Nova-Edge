/**
 * Gaming routing catalogue.
 *
 * These presets route official launcher, login, store and content hostnames to
 * the subscription's measured proxy group. They do NOT claim to lower physical
 * latency or carry arbitrary game UDP: the Worker gateway intentionally keeps
 * UDP restricted to DNS. The UI and generated profiles state this limit.
 */
export interface GamePreset {
  id: string;
  title: string;
  publisher: string;
  category: 'shooter' | 'sandbox' | 'moba' | 'sports' | 'racing' | 'rpg' | 'strategy' | 'casual';
  domains: string[];
}

type GameSeed = [id: string, title: string, category: GamePreset['category']];

function family(publisher: string, domains: string[], games: GameSeed[]): GamePreset[] {
  return games.map(([id, title, category]) => ({ id, title, publisher, category, domains: [...domains] }));
}

export const GAME_CATALOG: GamePreset[] = [
  ...family('Activision Blizzard', ['callofduty.com', 'activision.com', 'battle.net', 'blizzard.com'], [
    ['cod-mobile', 'Call of Duty Mobile', 'shooter'], ['warzone', 'Call of Duty Warzone', 'shooter'],
    ['cod-modern-warfare', 'Call of Duty Modern Warfare', 'shooter'], ['cod-black-ops', 'Call of Duty Black Ops', 'shooter'],
    ['cod-vanguard', 'Call of Duty Vanguard', 'shooter'], ['overwatch-2', 'Overwatch 2', 'shooter'],
    ['diablo-iv', 'Diablo IV', 'rpg'], ['diablo-immortal', 'Diablo Immortal', 'rpg'],
    ['world-of-warcraft', 'World of Warcraft', 'rpg'], ['wow-classic', 'World of Warcraft Classic', 'rpg'],
    ['hearthstone', 'Hearthstone', 'strategy'], ['starcraft-ii', 'StarCraft II', 'strategy'],
    ['warcraft-rumble', 'Warcraft Rumble', 'strategy'], ['heroes-of-the-storm', 'Heroes of the Storm', 'moba'],
    ['crash-team-rumble', 'Crash Team Rumble', 'casual'], ['crash-bandicoot-4', 'Crash Bandicoot 4', 'casual'],
  ]),
  ...family('Xbox and Mojang', ['xboxlive.com', 'xbox.com', 'xboxservices.com', 'minecraft.net', 'mojang.com'], [
    ['minecraft-java', 'Minecraft Java', 'sandbox'], ['minecraft-bedrock', 'Minecraft Bedrock', 'sandbox'],
    ['minecraft-dungeons', 'Minecraft Dungeons', 'rpg'], ['minecraft-legends', 'Minecraft Legends', 'strategy'],
    ['halo-infinite', 'Halo Infinite', 'shooter'], ['halo-mcc', 'Halo Master Chief Collection', 'shooter'],
    ['forza-horizon-5', 'Forza Horizon 5', 'racing'], ['forza-motorsport', 'Forza Motorsport', 'racing'],
    ['sea-of-thieves', 'Sea of Thieves', 'sandbox'], ['grounded', 'Grounded', 'sandbox'],
    ['age-of-empires-iv', 'Age of Empires IV', 'strategy'], ['age-of-mythology-retold', 'Age of Mythology Retold', 'strategy'],
    ['flight-simulator', 'Microsoft Flight Simulator', 'sandbox'], ['state-of-decay-2', 'State of Decay 2', 'rpg'],
    ['killer-instinct', 'Killer Instinct', 'casual'], ['gears-5', 'Gears 5', 'shooter'],
  ]),
  ...family('Riot Games', ['riotgames.com', 'leagueoflegends.com', 'valorant.com', 'riotcdn.net'], [
    ['valorant', 'Valorant', 'shooter'], ['league-of-legends', 'League of Legends', 'moba'],
    ['wild-rift', 'League of Legends Wild Rift', 'moba'], ['teamfight-tactics', 'Teamfight Tactics', 'strategy'],
    ['legends-of-runeterra', 'Legends of Runeterra', 'strategy'], ['2xko', '2XKO', 'casual'],
  ]),
  ...family('Epic Games', ['epicgames.com', 'fortnite.com', 'unrealengine.com'], [
    ['fortnite', 'Fortnite', 'shooter'], ['rocket-league', 'Rocket League', 'sports'],
    ['fall-guys', 'Fall Guys', 'casual'], ['lego-fortnite', 'LEGO Fortnite', 'sandbox'],
    ['fortnite-festival', 'Fortnite Festival', 'casual'], ['rocket-racing', 'Rocket Racing', 'racing'],
    ['infinity-blade', 'Infinity Blade', 'rpg'], ['shadow-complex', 'Shadow Complex', 'shooter'],
  ]),
  ...family('Valve and Steam', ['steampowered.com', 'steamcommunity.com', 'steamcontent.com', 'valvesoftware.com'], [
    ['counter-strike-2', 'Counter-Strike 2', 'shooter'], ['dota-2', 'Dota 2', 'moba'],
    ['team-fortress-2', 'Team Fortress 2', 'shooter'], ['left-4-dead-2', 'Left 4 Dead 2', 'shooter'],
    ['deadlock', 'Deadlock', 'moba'], ['apex-steam', 'Apex Legends Steam', 'shooter'],
    ['rust', 'Rust', 'sandbox'], ['ark-survival-ascended', 'ARK Survival Ascended', 'sandbox'],
    ['palworld', 'Palworld', 'sandbox'], ['terraria', 'Terraria', 'sandbox'],
    ['stardew-valley', 'Stardew Valley', 'casual'], ['brawlhalla', 'Brawlhalla', 'casual'],
    ['the-finals', 'The Finals', 'shooter'], ['rainbow-six-steam', 'Rainbow Six Siege Steam', 'shooter'],
  ]),
  ...family('Electronic Arts', ['ea.com', 'eaplay.com', 'origin.com'], [
    ['apex-legends', 'Apex Legends', 'shooter'], ['battlefield-2042', 'Battlefield 2042', 'shooter'],
    ['battlefield-v', 'Battlefield V', 'shooter'], ['ea-sports-fc-26', 'EA Sports FC 26', 'sports'],
    ['ea-sports-fc-25', 'EA Sports FC 25', 'sports'], ['fifa-23', 'FIFA 23', 'sports'],
    ['madden-nfl-26', 'Madden NFL 26', 'sports'], ['nhl-26', 'NHL 26', 'sports'],
    ['f1-25', 'F1 25', 'racing'], ['need-for-speed-unbound', 'Need for Speed Unbound', 'racing'],
    ['the-sims-4', 'The Sims 4', 'sandbox'], ['star-wars-battlefront-ii', 'Star Wars Battlefront II', 'shooter'],
    ['star-wars-jedi-survivor', 'Star Wars Jedi Survivor', 'rpg'], ['plants-vs-zombies-bfn', 'Plants vs Zombies Battle for Neighborville', 'shooter'],
    ['it-takes-two', 'It Takes Two', 'casual'], ['skate', 'Skate', 'sports'],
  ]),
  ...family('Ubisoft', ['ubisoft.com', 'ubi.com', 'ubisoftconnect.com'], [
    ['rainbow-six-siege', 'Rainbow Six Siege', 'shooter'], ['xdefiant', 'XDefiant', 'shooter'],
    ['the-division-2', 'The Division 2', 'shooter'], ['ghost-recon-breakpoint', 'Ghost Recon Breakpoint', 'shooter'],
    ['for-honor', 'For Honor', 'casual'], ['trackmania', 'Trackmania', 'racing'],
    ['the-crew-motorfest', 'The Crew Motorfest', 'racing'], ['riders-republic', 'Riders Republic', 'sports'],
    ['assassins-creed-shadows', 'Assassins Creed Shadows', 'rpg'], ['assassins-creed-valhalla', 'Assassins Creed Valhalla', 'rpg'],
    ['far-cry-6', 'Far Cry 6', 'shooter'], ['skull-and-bones', 'Skull and Bones', 'sandbox'],
    ['anno-1800', 'Anno 1800', 'strategy'], ['settlers-new-allies', 'The Settlers New Allies', 'strategy'],
  ]),
  ...family('Rockstar Games', ['rockstargames.com', 'socialclub.rockstargames.com'], [
    ['gta-online', 'Grand Theft Auto Online', 'sandbox'], ['gta-v', 'Grand Theft Auto V', 'sandbox'],
    ['red-dead-online', 'Red Dead Online', 'sandbox'], ['red-dead-redemption-2', 'Red Dead Redemption 2', 'rpg'],
    ['max-payne-3', 'Max Payne 3', 'shooter'],
  ]),
  ...family('2K Games', ['2k.com'], [
    ['nba-2k26', 'NBA 2K26', 'sports'], ['wwe-2k26', 'WWE 2K26', 'sports'],
    ['borderlands-4', 'Borderlands 4', 'shooter'], ['civilization-vii', 'Civilization VII', 'strategy'],
    ['topspin-2k25', 'TopSpin 2K25', 'sports'],
  ]),
  ...family('Supercell', ['supercell.com'], [
    ['clash-of-clans', 'Clash of Clans', 'strategy'], ['clash-royale', 'Clash Royale', 'strategy'],
    ['brawl-stars', 'Brawl Stars', 'shooter'], ['hay-day', 'Hay Day', 'casual'],
    ['boom-beach', 'Boom Beach', 'strategy'], ['squad-busters', 'Squad Busters', 'casual'],
  ]),
  ...family('Krafton and PUBG', ['pubg.com', 'pubgmobile.com', 'krafton.com'], [
    ['pubg-battlegrounds', 'PUBG Battlegrounds', 'shooter'], ['pubg-mobile', 'PUBG Mobile', 'shooter'],
    ['new-state-mobile', 'New State Mobile', 'shooter'], ['inzoi', 'inZOI', 'sandbox'],
    ['the-callisto-protocol', 'The Callisto Protocol', 'rpg'], ['dark-and-darker-mobile', 'Dark and Darker Mobile', 'rpg'],
  ]),
  ...family('HoYoverse', ['hoyoverse.com', 'mihoyo.com', 'hoyolab.com'], [
    ['genshin-impact', 'Genshin Impact', 'rpg'], ['honkai-star-rail', 'Honkai Star Rail', 'rpg'],
    ['zenless-zone-zero', 'Zenless Zone Zero', 'rpg'], ['honkai-impact-3rd', 'Honkai Impact 3rd', 'rpg'],
    ['tears-of-themis', 'Tears of Themis', 'casual'],
  ]),
  ...family('PlayStation', ['playstation.com', 'playstation.net', 'sonyentertainmentnetwork.com'], [
    ['helldivers-2', 'Helldivers 2', 'shooter'], ['gran-turismo-7', 'Gran Turismo 7', 'racing'],
    ['destiny-2-ps', 'Destiny 2 PlayStation', 'shooter'], ['the-last-of-us-online', 'The Last of Us Online Services', 'shooter'],
    ['ghost-of-tsushima', 'Ghost of Tsushima', 'rpg'], ['god-of-war-ragnarok', 'God of War Ragnarok', 'rpg'],
    ['horizon-forbidden-west', 'Horizon Forbidden West', 'rpg'], ['marvels-spider-man-2', 'Marvels Spider-Man 2', 'rpg'],
    ['sackboy', 'Sackboy A Big Adventure', 'casual'], ['mlb-the-show-26', 'MLB The Show 26', 'sports'],
  ]),
  ...family('Nintendo', ['nintendo.com', 'nintendo.net'], [
    ['mario-kart-world', 'Mario Kart World', 'racing'], ['mario-kart-8-deluxe', 'Mario Kart 8 Deluxe', 'racing'],
    ['splatoon-3', 'Splatoon 3', 'shooter'], ['super-smash-bros-ultimate', 'Super Smash Bros Ultimate', 'casual'],
    ['animal-crossing-new-horizons', 'Animal Crossing New Horizons', 'casual'], ['pokemon-scarlet-violet', 'Pokemon Scarlet and Violet', 'rpg'],
    ['pokemon-unite', 'Pokemon Unite', 'moba'], ['zelda-tears-of-the-kingdom', 'Zelda Tears of the Kingdom', 'rpg'],
    ['super-mario-party-jamboree', 'Super Mario Party Jamboree', 'casual'], ['luigis-mansion-3', 'Luigis Mansion 3', 'casual'],
  ]),
  ...family('Roblox', ['roblox.com', 'rbxcdn.com'], [
    ['roblox', 'Roblox', 'sandbox'],
  ]),
  ...family('Wargaming', ['wargaming.net', 'worldoftanks.com', 'worldofwarships.com'], [
    ['world-of-tanks', 'World of Tanks', 'shooter'], ['world-of-warships', 'World of Warships', 'shooter'],
    ['world-of-tanks-blitz', 'World of Tanks Blitz', 'shooter'], ['world-of-warplanes', 'World of Warplanes', 'shooter'],
  ]),
  ...family('Bethesda', ['bethesda.net', 'elderscrollsonline.com'], [
    ['elder-scrolls-online', 'The Elder Scrolls Online', 'rpg'], ['fallout-76', 'Fallout 76', 'rpg'],
    ['quake-champions', 'Quake Champions', 'shooter'], ['doom-eternal', 'DOOM Eternal', 'shooter'],
    ['starfield', 'Starfield', 'rpg'], ['deathloop', 'Deathloop', 'shooter'],
  ]),
  ...family('Square Enix', ['square-enix.com', 'finalfantasyxiv.com'], [
    ['final-fantasy-xiv', 'Final Fantasy XIV', 'rpg'], ['final-fantasy-xvi', 'Final Fantasy XVI', 'rpg'],
    ['final-fantasy-vii-rebirth', 'Final Fantasy VII Rebirth', 'rpg'], ['kingdom-hearts-iii', 'Kingdom Hearts III', 'rpg'],
    ['foamstars', 'Foamstars', 'shooter'], ['dragon-quest-x', 'Dragon Quest X', 'rpg'],
  ]),
  ...family('Bandai Namco', ['bandainamcoent.com', 'bandainamcoent.eu'], [
    ['tekken-8', 'Tekken 8', 'casual'], ['elden-ring', 'Elden Ring', 'rpg'],
    ['dragon-ball-sparking-zero', 'Dragon Ball Sparking Zero', 'casual'], ['naruto-connections', 'Naruto X Boruto Ultimate Ninja Storm Connections', 'casual'],
    ['gundam-evolution', 'Gundam Evolution', 'shooter'], ['blue-protocol', 'Blue Protocol', 'rpg'],
  ]),
  ...family('Garena', ['garena.com', 'freefiremobile.com'], [
    ['free-fire', 'Free Fire', 'shooter'], ['free-fire-max', 'Free Fire MAX', 'shooter'],
    ['arena-of-valor', 'Arena of Valor', 'moba'], ['speed-drifters', 'Garena Speed Drifters', 'racing'],
  ]),
  ...family('CD Projekt and GOG', ['gog.com', 'cdprojektred.com', 'cyberpunk.net'], [
    ['cyberpunk-2077', 'Cyberpunk 2077', 'rpg'], ['the-witcher-3', 'The Witcher 3', 'rpg'],
    ['gwent', 'GWENT', 'strategy'], ['gog-galaxy', 'GOG Galaxy', 'casual'],
  ]),
  ...family('Bungie', ['bungie.net', 'destinythegame.com'], [
    ['destiny-2', 'Destiny 2', 'shooter'], ['marathon', 'Marathon', 'shooter'],
  ]),
  ...family('Grinding Gear Games', ['pathofexile.com', 'grindinggear.com'], [
    ['path-of-exile', 'Path of Exile', 'rpg'], ['path-of-exile-2', 'Path of Exile 2', 'rpg'],
  ]),
  ...family('Digital Extremes', ['warframe.com'], [
    ['warframe', 'Warframe', 'shooter'], ['soulframe', 'Soulframe', 'rpg'],
  ]),
];

const GAME_IDS = new Set(GAME_CATALOG.map((game) => game.id));

export function sanitizeGameIds(value: unknown, max = GAME_CATALOG.length): string[] {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map(String).filter((id) => GAME_IDS.has(id)))].slice(0, max);
}

export function gameDomainsFor(ids: readonly string[]): string[] {
  const selected = new Set(ids);
  const domains = GAME_CATALOG
    .filter((game) => selected.has(game.id))
    .flatMap((game) => game.domains.map((domain) => domain.toLowerCase()));
  return [...new Set(domains)].slice(0, 512);
}

export function publicGameCatalog(): Array<Pick<GamePreset, 'id' | 'title' | 'publisher' | 'category'>> {
  return GAME_CATALOG.map(({ id, title, publisher, category }) => ({ id, title, publisher, category }));
}
