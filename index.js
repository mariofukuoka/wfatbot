const WebSocket = require('ws');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const census = require('./census-funcs')
const { token, serviceId } = require('./config.json');
const fs = require('fs');
const itemMap = require('./item-map.json');
const trackedExperienceEvents = require('./tracked-experience-events.json');
const dbApi = require('./database-api');

// todo: use actual attribute names in the json here, then replace the 
// key names with "x" and "y" used by chart.js when sending it over

// different colors in legend for different kinds of events
// deaths, infantry, air, ground vehicle, support?

// sometimes bot sends 0kb file, why?


// ============================== Config ===========================

var outputFilename = 'output_report.html'

// ============================= Variables =======================

async function asyncMain() {
  // Census API calls
  const censusPromises = [
    census.getCharacterMap(await census.getMemberNames('vcbc')),
    //census.getCharacterMap(['nmaxlukas1233nc', '1rpcxnerotr']),
    census.getFactionMap(),
    census.getLoadoutMap(),
    census.getVehicleMap(),
    census.getExperienceMap(),
    census.getZoneMap(),
    census.getRegionMap(),
    census.getWorldMap(),
    census.getSkillMap()
  ];

  const [
    charMap,
    factionMap,
    loadoutMap,
    vehicleMap,
    experienceMap,
    zoneMap,
    regionMap,
    worldMap,
    skillMap
  ] = await Promise.all(censusPromises);
  console.log('Census: promises resolved!');
  const trackedIds = new Set(Object.keys(charMap));
  console.log(charMap);

  // Discord client
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Websocket
  const ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);

  // Websocket subscription JSON
  subJSON = {
    service: 'event',
    action: 'subscribe',
    characters: Array.from(trackedIds),
    worlds: ['all'],
    eventNames: [      
      //...trackedExperienceEvents,
      'GainExperience',
      'Death', 
      'VehicleDestroy', 
      'PlayerFacilityCapture',
      'PlayerFacilityDefend',
      'ItemAdded',
      'SkillAdded',
      'PlayerLogin',
      'PlayerLogout'
    ], //'PlayerLogin', 'PlayerLogout'],
    logicalAndCharactersWithWorlds:true
  }

  var eventHistory = [];
  var uniqueChars = new Set();
  // ============================= Functions ==============================

  function getEventMsg(eventName, event) {
    let msg = `${timestampToDate(event.timestamp)} [${eventName}] `;
    msg += ' '.repeat('PlayerFacilityCapture'.length - eventName.length);
    if (eventName === 'Death') {
      msg += `${event.attacker} (${event.attackerFaction} ${event.attackerClass}`;
      if (event.attackerVehicle) msg += ` in ${event.attackerVehicle}`;
      msg += `) killed ${event.character} (${event.faction} ${event.class}`;
      if (event.vehicle) msg += ` in ${event.vehicle}`;
      msg += `) with ${event.attackerWeapon}`;
      if (event.headshot) msg += ' (headshot)';
      msg += ` [${event.continent}]`;
    } 
    else if (eventName === 'GainExperience') {
      msg += `${event.character} (${event.faction} ${event.class}) got ${event.amount}XP for ${event.description}`
      if (event.other) msg += ` through ${event.other}`;
      msg += ` [${event.continent}]`;
    } 
    else if (eventName === 'VehicleDestroy') {
      msg += `${event.attacker} (${event.attackerFaction} ${event.attackerClass}`;
      if (event.attackerVehicle) msg += ` in ${event.attackerVehicle}`;
      msg += `) destroyed ${event.character}'s ${event.vehicle} (${event.faction}) with ${event.attackerWeapon} [${event.continent}]`;
    } 
    else if (eventName === 'PlayerFacilityCapture') {
      msg +=  `${event.character} captured ${event.facility} [${event.continent}]`;
    }
    else if (eventName === 'PlayerFacilityDefend') {
      msg += `${event.character} defended ${event.facility} [${event.continent}]`;
    } 
    else if (eventName === 'SkillAdded') {
      msg += `${event.character} unlocked`
      if (event.skill) msg += ` ${event.skill}`; else msg += ` unknown skill (${event.skillId})`;
      msg += ` [${event.continent}]`;
    } 
    else if (eventName === 'ItemAdded') {
      msg += `${event.character} unlocked`
      if (event.itemCount) msg += ` ${event.itemCount}`;
      if (event.name) msg += ` ${event.name} (${event.type}, ${event.category})`; else msg += ` unknown item (${event.itemId})`;
      if (event.context) msg += ` (context: ${event.context})`;
      msg += ` [${event.continent}]`;
    } 
    else if (eventName === 'PlayerLogin') {
      msg += `${event.character} logged in`;
    } else if (eventName === 'PlayerLogout') {
      msg += `${event.character} logged out`;
    } else return 'unknown event';
    msg += ` [${event.server}]`
    return msg;
  }

  function charIdIsValid(characterId) {
    // valid character ids are odd, npc ids are even
    return characterId.slice(-1) % 2 === 1;
  }

  async function fetchIfMissing (characterId) {
    if (!charIdIsValid(characterId)) return null;
    else if (characterId in charMap) {
      //console.log('present:', charMap[characterId]);
      return charMap[characterId];
    } 
    else { // attempt to fetch from census API
      try {
        newChar = await census.getCharacter(characterId);
        if (newChar != null) charMap[characterId] = newChar; // cache new char
        //console.log('fetched:', fetchedCharacter);
        return newChar;
      } 
      catch (e) {
        console.log('character retrieval error:', characterId)
        return null;
      }
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


  // ================================== DISCORD LISTENERS =====================================
  // Create a new client instance

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
      console.log(dbApi.db.prepare('SELECT * FROM playerFacilityEvents').all());
      console.log(dbApi.db.prepare('SELECT * FROM skillAddedEvents').all());
      console.log(dbApi.db.prepare('SELECT * FROM itemAddedEvents').all());
      console.log(dbApi.db.prepare('SELECT * FROM playerSessionEvents').all());
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
    if (data.type === 'serviceMessage') {
      const p = data.payload;

      if ('attacker_character_id' in p && p.attacker_character_id === '0') { // filter out tutorial events
        //console.log('Event from tutorial zone', p);
        return;
      }

      //console.log(p.event_name);
      try {
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
              attackerWeapon: itemMap[p.attacker_weapon_id].name,
              characterId: p.character_id,
              character: await fetchIfMissing(p.character_id),
              class: loadoutMap[p.character_loadout_id].class,
              faction: factionMap[p.team_id],
              vehicle: vehicleMap[p.vehicle_id],
              isHeadshot: parseInt(p.is_headshot),
              continent: zoneMap[p.zone_id],
              server: worldMap[p.world_id]
            }
            console.log(getEventMsg(p.event_name, deathEvent));
            dbApi.saveDeathEvent.run(deathEvent);
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
              attackerWeapon: itemMap[p.attacker_weapon_id].name,
              characterId: p.character_id,
              character: await fetchIfMissing(p.character_id),
              faction: factionMap[p.faction_id],
              vehicle: vehicleMap[p.vehicle_id],
              facilityId: p.facility_id,
              facility: regionMap[p.facility_id],
              continent: zoneMap[p.zone_id],
              server: worldMap[p.world_id]
            }
            console.log(getEventMsg(p.event_name, vehicleDestroyEvent));
            dbApi.saveVehicleDestroyEvent.run(vehicleDestroyEvent);
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
            //console.log(p.event_name, experienceEvent);
            console.log(getEventMsg(p.event_name, experienceEvent));
            dbApi.saveExperienceEvent.run(experienceEvent);
          })();
        }
        else if (p.event_name === 'PlayerFacilityCapture' || p.event_name === 'PlayerFacilityDefend') {
          const playerFacilityEvent = {
            timestamp: parseInt(p.timestamp),
            characterId: p.character_id,
            character: charMap[p.character_id],
            type: p.event_name,
            facilityId: p.facility_id,
            facility: regionMap[p.facility_id],
            continent: zoneMap[p.zone_id],
            server: worldMap[p.world_id]
          }
          console.log(getEventMsg(p.event_name, playerFacilityEvent));
          dbApi.savePlayerFacilityEvent.run(playerFacilityEvent);
        }
        else if (p.event_name === 'SkillAdded') {
          const skillAddedEvent = {
            timestamp: parseInt(p.timestamp),
            characterId: p.character_id,
            character: charMap[p.character_id],
            skillId: p.skill_id,
            skill: skillMap[p.skill_id],
            continent: zoneMap[p.zone_id],
            server: worldMap[p.world_id]
          }
          console.log(getEventMsg(p.event_name, skillAddedEvent));
          dbApi.saveSkillAddedEvent.run(skillAddedEvent);
        }
        else if (p.event_name === 'ItemAdded') {
          const item = itemMap[p.item_id];
          const itemAddedEvent = {
            timestamp: parseInt(p.timestamp),
            characterId: p.character_id,
            character: charMap[p.character_id],
            itemId: p.item_id,
            name: item.name,
            type: item.type,
            category: item.category,
            skillSet: item.skillSet,
            itemCount: p.item_count,
            context: p.context,
            continent: zoneMap[p.zone_id],
            server: worldMap[p.world_id]
          }

          console.log(getEventMsg(p.event_name, itemAddedEvent));
          if (item != null && item.parentItems.length > 0) {
            console.log(`Attachment for: ${item.parentItems.map(id => console.log(itemMap[id].name))}`);
          }
          
          dbApi.saveItemAddedEvent.run(itemAddedEvent);
        }
        else if ((p.event_name === 'PlayerLogin' || p.event_name === 'PlayerLogout') && p.character_id in trackedIds) {
          const playerSessionEvent = {
            timestamp: p.timestamp,
            characterId: p.character_id,
            character: charMap[p.character_id],
            type: p.event_name,
            server: worldMap[p.world_id]
          }
          console.log(getEventMsg(p.event_name, playerSessionEvent));
          dbApi.savePlayerSessionEvent.run(playerSessionEvent);
        }
      } catch (e) {
        console.log('error:', e);
        console.log(p)
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