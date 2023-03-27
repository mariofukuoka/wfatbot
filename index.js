const WebSocket = require('ws');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const census = require('./census-funcs')
const { token, serviceId } = require('./config.json');
const fs = require('fs');
const sqlite3 = require('better-sqlite3');
const trackedExperienceEvents = require('./tracked-experience-events.json');

// todo: use actual attribute names in the json here, then replace the 
// key names with "x" and "y" used by chart.js when sending it over

// different colors in legend for different kinds of events
// deaths, infantry, air, ground vehicle, support?

// sometimes bot sends 0kb file, why?


// ============================== Config ===========================

var trackedPlayers = ['kurohagane', 'lukas1233', 'yippys'];

var outputFilename = 'output_report.html'

// ============================= Database setup =========================

var db = sqlite3(':memory:');
db.exec(`CREATE TABLE deathEvents (
  id INTEGER PRIMARY KEY, 
  timestamp INTEGER,
  attackerId TEXT, 
  attacker TEXT, 
  attackerClass TEXT, 
  attackerFaction TEXT, 
  attackerVehicle TEXT, 
  characterId TEXT, 
  character TEXT, 
  class TEXT, 
  faction TEXT, 
  vehicle TEXT, 
  isHeadshot INTEGER, 
  server TEXT, 
  continent TEXT
)`);

const insertDeathEvent = db.prepare(`INSERT INTO deathEvents (
  timestamp,
  attackerId,
  attacker,
  attackerClass,
  attackerFaction,
  attackerVehicle,
  characterId,
  character,
  class,
  faction,
  vehicle,
  isHeadshot,
  server,
  continent
) VALUES (
  $timestamp,
  $attackerId,
  $attacker,
  $attackerClass,
  $attackerFaction,
  $attackerVehicle,
  $characterId,
  $character,
  $class,
  $faction,
  $vehicle,
  $isHeadshot,
  $server,
  $continent
)`);

db.exec(`CREATE TABLE experienceEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  class TEXT,
  faction TEXT,
  otherId TEXT,
  other TEXT,
  experienceId TEXT,
  description TEXT,
  amount INTEGER,
  server TEXT,
  continent TEXT
)`);

const insertExperienceEvent = db.prepare(`INSERT INTO experienceEvents (
  timestamp,
  characterId,
  character,
  class,
  faction,
  otherId,
  other,
  experienceId,
  description,
  amount,
  server,
  continent
) VALUES (
  $timestamp,
  $characterId,
  $character,
  $class,
  $faction,
  $otherId,
  $other,
  $experienceId,
  $description,
  $amount,
  $server,
  $continent
)`);

/*           timestamp: p.timestamp,
          characterId: p.character_id,
          character: charMap[p.character_id],
          class: loadoutMap[p.loadout_id].class,
          faction: factionMap[loadoutMap[p.loadout_id].factionId],
          otherId: p.other_id,
          other: charMap[p.other_id],
          experienceId: p.experience_id,
          description: experienceMap[p.experience_id].desc, 
          amount: p.amount,
          server: worldMap[p.world_id],
          continent: zoneMap[p.zone_id] */

// ============================= Functions ==============================

function repr(str, map) {
  // get the mapping if it exists
  return (str in map) ? map[str] : str;
}

function timestampToDate(timestamp) {
  const date = new Date(timestamp * 1000)
  const formattedDate = date.toLocaleString('ja-JP', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false 
  });
  return formattedDate;
}

function createReport(eventHistory, uniqueChars) {

  fs.readFile('report_template.html', 'utf-8', (err, html) => {
    if (err) throw err;

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const element = document.querySelector('#script');


    element.setAttribute('report-data', JSON.stringify(createChartJsDatasets(categorizeEvents(eventHistory, 'class'))));
    element.setAttribute('y-labels', JSON.stringify(Array.from(uniqueChars)));
    fs.writeFile(outputFilename, dom.serialize(), (err) => {
      if (err) throw err;
      console.log(`HTML saved to ${outputFilename}`);
    });
  });
}
/* function categorizeEvents(eventHistory, property) {
  categorized = {};
  eventHistory.forEach(event => {
    currPropertyValue = event[property];
    if (currPropertyValue in categorized) {
      categorized[currPropertyValue].push(event);
    } else {
      categorized[currPropertyValue] = [event];
      console.log(currPropertyValue);
    }

  });
  console.log(Object.keys(categorized));
  for (let [key, value] of Object.entries(categorized)) {
    console.log(value.length);
  }
  
  return categorized;
} */

function categorizeEvents(eventHistory) {
  categorized = {};
  eventHistory.forEach(event => {
    let currPropertyValue = null;
    if (event.vehicle == '') {
      currPropertyValue = event.class;
    } else {
      currPropertyValue = event.vehicle;
    }
    if (currPropertyValue in categorized) {
      categorized[currPropertyValue].push(event);
    } else {
      categorized[currPropertyValue] = [event];
      console.log(currPropertyValue);
    }

  });
  /* console.log(Object.keys(categorized));
  for (let [key, value] of Object.entries(categorized)) {
    console.log(value.length);
  } */
  
  return categorized;
}

function randomColorStr() {
  let randChannelVal = () => {
    return Math.floor(Math.random() * 256);
  }
  return `rgba(${randChannelVal()}, ${randChannelVal()}, ${randChannelVal()}, 0.5)`;
}

function createChartJsDatasets(categorizedEvents) {

  const pointRadius = 7;
  let datasets = [];
  for (let [category, events] of Object.entries(categorizedEvents)) {
    console.log(category);
    datasets.push( {label:category, data:events, pointRadius:pointRadius, backgroundColor:randomColorStr() } );
    console.log(datasets[datasets.length-1]);
  }
  return datasets;
}

// =================================== MAIN EXECUTION ===================
async function main() {



  // ================================== DISCORD =====================================
  // Create a new client instance
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'
  client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
  });

  // Discord bot setup
  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.on('message', msg => {
    console.log(`message: ${msg.content}`)
    if (msg.content === 'xd') {
      msg.reply('xD');
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
    if (commandName === 'ping') {
      await interaction.reply('Pong!');
    } else if (commandName === 'debug') {
      //const eventHistoryStr = JSON.stringify(eventHistory, null, '\t');
      //console.log(eventHistoryStr)
      //createReport(eventHistory, uniqueChars);
      //await interaction.reply({ files: [outputFilename]})
      console.log(db.prepare('SELECT * FROM experienceEvents').all());
    }
  });
  
  client.login(token);

  // =============================== PS2 STREAMING API ===================================

  const censusPromises = [
    census.getCharacterMap(await census.getMemberNames('hhzs')),
    census.getFactionMap(),
    census.getLoadoutMap(),
    census.getWeaponMap(),
    census.getVehicleMap(),
    census.getExperienceMap(),
    census.getItemMap(),
    census.getZoneMap(),
    census.getRegionMap(),
    census.getWorldMap(),
    census.getSkillMap()
  ];

  const [
    charMap,
    factionMap,
    loadoutMap,
    weaponMap,
    vehicleMap,
    experienceMap,
    itemMap,
    zoneMap,
    regionMap,
    worldMap,
    skillMap
  ] = await Promise.all(censusPromises);
  console.log('Census promises resolved!');

  const trackedIds = Object.keys(charMap);
  //console.log(charMap);

  var eventHistory = [];
  var uniqueChars = new Set();


  // Create a new WebSocket connection to the Daybreak API websocket endpoint
  const ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);

  // subscribe to outfit member events
  subJSON = {
    service: 'event',
    action: 'subscribe',
    characters: trackedIds,
    worlds: ['all'],
    eventNames: [      
      ...trackedExperienceEvents,
      'Death', 
      'VehicleDestroy', 
      'PlayerFacilityCapture',
      'PlayerFacilityDefend',
      'ItemAdded',
      'SkillAdded',
      //'PlayerLogin',
      //'PlayerLogout'
    ], //'PlayerLogin', 'PlayerLogout'],
    logicalAndCharactersWithWorlds:true
  }


  // Listen for the 'open' event, indicating that the connection to the websocket has been established
  ws.on('open', () => {
    console.log('Connected to Daybreak API websocket');
    
    // Subscribe to the player login event stream
    ws.send(JSON.stringify(subJSON));
  });

  // Listen for incoming messages from the websocket
  ws.on('message', message => {
    const data = JSON.parse(message);
    // Check if the message is a player login event
    if (data.type === 'serviceMessage') { // && data.payload.event_name === 'PlayerLogin') {
      const p = data.payload;
      //let entry = {timestamp: p.timestamp, eventName: p.event_name, char: p.character_id};
      //eventHistory.push(p);

      /* 
      fetchCharAndUpdateMap is an async function that asynchronously fetches an unknown character's name, adds it to the charMap, 
      then inserts the event with the updated name into the db so that when called without awaiting it will wait for the REST 
      response and do its stuff in the background without interrupting the websocket */
      fetchCharAndUpdateMap = async (event, charIdProperty, charNameProperty, dbInsertStatement) => {
        const t0 = performance.now();
        event[charNameProperty] = await census.getCharacter(event[charIdProperty]);
        if (event[charNameProperty] != null) {
          charMap[event[charIdProperty]] = event[charNameProperty];
        }
        //console.log(`fetched and inserted ${deathEvent[charNameProperty]}, took ${((performance.now() - t0)/1000).toFixed(2)}s`);
        dbInsertStatement.run(event);
        console.log('Async',event);
      }

      if (p.event_name === 'Death') {
        const deathEvent = {
          timestamp: parseInt(p.timestamp),
          attackerId: p.attacker_character_id,
          attacker: charMap[p.attacker_character_id],
          attackerClass: loadoutMap[p.attacker_loadout_id].class,
          attackerFaction: factionMap[p.attacker_team_id],
          attackerVehicle: vehicleMap[p.attacker_vehicle_id],
          characterId: p.character_id,
          character: charMap[p.character_id],
          class: loadoutMap[p.character_loadout_id].class,
          faction: factionMap[p.team_id],
          vehicle: vehicleMap[p.vehicle_id],
          isHeadshot: parseInt(p.is_headshot),
          server: worldMap[p.world_id],
          continent: zoneMap[p.zone_id]
        }
        
        if (!(deathEvent.attackerId in charMap)) {
          fetchCharAndUpdateMap(deathEvent, 'attackerId', 'attacker', insertDeathEvent);
        } else if (!(deathEvent.characterId in charMap)) {
          fetchCharAndUpdateMap(deathEvent, 'characterId', 'character', insertDeathEvent);
        } else {
          insertDeathEvent.run(deathEvent);
          console.log('Death', deathEvent);
          //console.log(`${deathEvent.attacker} and ${deathEvent.character} both present`);
        }
      } 
      else if (p.event_name === 'GainExperience') {
        const xpEvent = {
          timestamp: parseInt(p.timestamp),
          characterId: p.character_id,
          character: charMap[p.character_id],
          class: loadoutMap[p.loadout_id].class,
          faction: factionMap[loadoutMap[p.loadout_id].factionId],
          otherId: p.other_id,
          other: charMap[p.other_id],
          experienceId: p.experience_id,
          description: experienceMap[p.experience_id].desc, 
          amount: p.amount,
          server: worldMap[p.world_id],
          continent: zoneMap[p.zone_id]
        }

        if (!(xpEvent.characterId in charMap)) {
          fetchCharAndUpdateMap(xpEvent, 'characterId', 'character', insertExperienceEvent);
        } else if (!(xpEvent.otherId in charMap && xpEvent.otherId % 2 === 1)) { // odd ids are player ids, even ids are npc ids
          fetchCharAndUpdateMap(xpEvent, 'otherId', 'other', insertExperienceEvent);
        } else {
          insertExperienceEvent.run(xpEvent);
          console.log('GainExperience', xpEvent);
          //console.log(`${xpEvent.attacker} and ${xpEvent.character} both present`);
        }
      }
      
      /* 
      //console.log(memberIds.includes(charId));
      
      // todo: refactor this whole bit to make more sense

      let activeChar = '';
      let passiveChar = '';
      let loadoutId = '';
      let metadata = '';
      let logMessage = '';
      let vehicle = '';
      
      if (eventName === 'GainExperience') {
        const xpEvent = experienceMap[p.experience_id];
        logMessage = `got ${xpEvent.xp}xp for "${xpEvent.desc}"`;
        metadata = `${xpEvent.desc} (${xpEvent.xp}xp)`;
        activeChar = (charId in charMap) ? charMap[charId] : '?';
        passiveChar = (p.other_id in charMap) ? charMap[p.other_id] : '?';

        loadoutId = p.loadout_id;
        
      } else if (eventName === 'Death') {
        const weaponId = p.attacker_weapon_id;
        //const weapon = (weaponId in weaponMap) ? weaponMap[weaponId].name : `weapon ${weaponId}`;
        //const weapon = (weaponId in weaponMap) ? weaponMap[weaponId].name : '?';
        //console.log(`weapon ${weaponId} in itemMap: ${weaponId in itemMap}`);
        const weapon = (weaponId in itemMap) ? itemMap[weaponId] : weaponId;
        
        metadata = weapon

        loadoutId = p.attacker_loadout_id;
        const attackerId = p.attacker_character_id;
        const vehicleId = p.attacker_vehicle_id;
        if (vehicleId === '0') {
          logMessage = `got a kill using a ${weapon}`;
        } else {
          vehicle = vehicleMap[vehicleId]
          logMessage = `got a kill using a ${vehicle} (${weapon})`;
        }

        activeChar = (attackerId in charMap) ? charMap[attackerId] : '?';
        passiveChar = (charId in charMap) ? charMap[charId] : '?';
      }


      const infantryClass = loadoutMap[loadoutId].class;
      const faction = factionMap[loadoutMap[loadoutId].factionId];

      const msg = `${formattedDate}: ${activeChar} ${logMessage} as ${faction} ${infantryClass} on ${passiveChar}`;
      
      if (eventName === 'Death') {
        console.log(msg);
      }
      
      if ((eventName == 'Death' && (p.attacker_character_id in charMap)) || (eventName == 'GainExperience' && (charId in charMap))) {
        eventHistory.push({
          t: formattedDate, 
          char: activeChar, 
          otherChar: passiveChar, 
          event: eventName, 
          class: infantryClass, 
          vehicle: vehicle,
          faction: faction, 
          meta: metadata
        });
        uniqueChars.add(activeChar);
      } */
      /*
      // Send a message to a Discord channel
      const channelId = '695500966690029590';
      const channel = client.channels.cache.get(channelId); // Replace with your channel ID
      channel.send(msg);
      */
    }
  });

  ws.on('close', function close() {
    console.log('WebSocket disconnected');
  });
}

main();