const WebSocket = require('ws');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const census = require('./census-funcs')
const { token, serviceId } = require('./config.json');
const fs = require('fs');
const trackedExperienceEvents = require('./tracked-experience-events.json');
const dbApi = require('./database-api');

// todo: use actual attribute names in the json here, then replace the 
// key names with "x" and "y" used by chart.js when sending it over

// different colors in legend for different kinds of events
// deaths, infantry, air, ground vehicle, support?

// sometimes bot sends 0kb file, why?


// ============================== Config ===========================

var trackedPlayers = ['kurohagane', 'lukas1233', 'yippys'];

var outputFilename = 'output_report.html'

// ============================= Database setup =========================



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
      console.log(dbApi.db.prepare('SELECT * FROM experienceEvents').all());
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
      then logs the event with the updated name into the db so that when called without awaiting it will wait for the REST 
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
        
        // if either one of the ids is missing from the charMap, fetch it and update the map
        if (!(deathEvent.attackerId in charMap)) {
          fetchCharAndUpdateMap(deathEvent, 'attackerId', 'attacker', dbApi.logDeathEvent);
        } else if (!(deathEvent.characterId in charMap)) {
          fetchCharAndUpdateMap(deathEvent, 'characterId', 'character', dbApi.logDeathEvent);
        } else {
          dbApi.logDeathEvent.run(deathEvent);
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

        // if either one of the ids is missing from the charMap, fetch it and update the map
        if (!(xpEvent.characterId in charMap)) {
          fetchCharAndUpdateMap(xpEvent, 'characterId', 'character', dbApi.logExperienceEvent);
        } else if (!(xpEvent.otherId in charMap && xpEvent.otherId % 2 === 1)) { // only try fetching for player (odd) ids, not npc ids
          fetchCharAndUpdateMap(xpEvent, 'otherId', 'other', dbApi.logExperienceEvent);
        } else {
          dbApi.logExperienceEvent.run(xpEvent);
          console.log('GainExperience', xpEvent);
        }
      }
    
    }
  });

  ws.on('close', function close() {
    console.log('WebSocket disconnected');
  });
}

main();