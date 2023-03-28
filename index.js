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

// ============================= Variables =========================
async function asyncMain() {
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
  console.log('Census: promises resolved!');
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


  // ============================= Functions ==============================

  /* 
  fetchIfMissing either returns the character name if it's already in charMap, or if not, 
  asynchronously fetches it from the census API and then caches is it in charMap (or returns null if invalid id)*/
  async function fetchIfMissing (characterId) {
    if (characterId in charMap) { // if char already in charMap, just return that
      console.log('present:', charMap[characterId]);
      return charMap[characterId];
    } else if (characterId === '0' || characterId % 2 === 1) { // if char's id is invalid, return null
      console.log('invalid:', characterId);
      return null;
    } else { // else retrieve it form the census API
      const fetchedCharacter = await census.getCharacter(characterId);
      if (fetchedCharacter != null) {
        charMap[characterId] = fetchedCharacter;
      }
      console.log('fetched:', fetchedCharacter);
      return fetchedCharacter;
    }
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


  // ================================== DISCORD =====================================
  // Create a new client instance
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'

  // Discord bot setup
  client.on('ready', () => {
    console.log(`Discord: Logged in as ${client.user.tag}!`);
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

  // =============================== WEBSOCKET LISTENERS ===================================

  // Listen for the 'open' event, indicating that the connection to the websocket has been established
  ws.on('open', () => {
    console.log('Websocket: Connected to Daybreak streaming API');
    
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

      if ('attacker_character_id' in p && p.attacker_character_id === '0') { // filter out tutorial events
        //console.log('Event from tutorial zone', p);
        return;
      }

      console.log(p.event_name);

      if (p.event_name === 'Death') {
        (async () => {
          const deathEvent = {
            timestamp: parseInt(p.timestamp),
            attackerId: p.attacker_character_id,
            attacker: await fetchIfMissing(p.attacker_character_id),
            attackerClass: loadoutMap[p.attacker_loadout_id].class,
            attackerFaction: factionMap[p.attacker_team_id],
            attackerVehicle: vehicleMap[p.attacker_vehicle_id],
            attackerWeaponId: p.attacker_weapon_id,
            attackerWeapon: itemMap[p.attacker_weapon_id],
            characterId: p.character_id,
            character: await fetchIfMissing(p.character_id),
            class: loadoutMap[p.character_loadout_id].class,
            faction: factionMap[p.team_id],
            vehicle: vehicleMap[p.vehicle_id],
            isHeadshot: parseInt(p.is_headshot),
            continent: zoneMap[p.zone_id],
            server: worldMap[p.world_id]
          }
          console.log(JSON.stringify(deathEvent));
          dbApi.logDeathEvent.run(deathEvent);
        })();
      }
      else if (p.event_name === 'VehicleDestroy') {
        (async () => {
          const vehicleDestroyEvent = {
            timestamp: parseInt(p.timestamp),
            attackerId: p.attacker_character_id,
            attacker: await fetchIfMissing(p.attacker_character_id),
            attackerClass: (p.attacker_loadout_id in loadoutMap) ? loadoutMap[p.attacker_loadout_id].class : null,
            attackerFaction: (p.attacker_loadout_id in loadoutMap) ? factionMap[loadoutMap[p.attacker_loadout_id].factionId] : null,
            attackerVehicle: vehicleMap[p.attacker_vehicle_id],
            attackerWeaponId: p.attacker_weapon_id,
            attackerWeapon: itemMap[p.attacker_weapon_id],
            characterId: p.character_id,
            character: await fetchIfMissing(p.character_id),
            faction: factionMap[p.faction_id],
            vehicle: vehicleMap[p.vehicle_id],
            facility: regionMap[p.facility_id],
            continent: zoneMap[p.zone_id],
            server: worldMap[p.world_id]
          }
          console.log(JSON.stringify(vehicleDestroyEvent));
          dbApi.logVehicleDestroyEvent.run(vehicleDestroyEvent);
        })();
      }
      else if (p.event_name === 'GainExperience') {
        (async () => {
          const experienceEvent = {
            timestamp: parseInt(p.timestamp),
            characterId: p.character_id,
            character: await fetchIfMissing(p.character_id),
            class: loadoutMap[p.loadout_id].class,
            faction: factionMap[loadoutMap[p.loadout_id].factionId],
            otherId: p.other_id,
            other: await fetchIfMissing(p.other_id),
            experienceId: p.experience_id,
            description: experienceMap[p.experience_id].desc, 
            amount: p.amount,
            continent: zoneMap[p.zone_id],
            server: worldMap[p.world_id]
          }
          console.log(JSON.stringify(experienceEvent));
          dbApi.logExperienceEvent.run(experienceEvent);
        })();
      }
      else if (p.event_name === 'PlayerFacilityCapture' || p.event_name === 'PlayerFacilityDefend') {
        const playerFacilityEvent = {
          timestamp: parseInt(p.timestamp),
          characterId: p.character_id,
          character: charMap[p.character_id],
          type: p.event_name,
          facility: regionMap[p.facility_id],
          continent: zoneMap[p.zone_id],
          server: worldMap[p.world_id]
        }
        if (!(p.character_id in charMap)) console.log('CHAR NOT IN MAP', p.character_id);
        console.log(p.event_name, playerFacilityEvent);
        dbApi.logPlayerFacilityEvent.run(playerFacilityEvent);
      }
    }
  });
  ws.on('error', err => {
    console.log('error:', err);
  });
  ws.on('close', function close() {
    console.log('WebSocket disconnected');
  });
}

asyncMain();