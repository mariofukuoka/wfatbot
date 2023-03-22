const WebSocket = require('ws');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const xpMap = require('./xpmap.json')
const census = require('./census-funcs')
const { token, serviceId } = require('./config.json');
const fs = require('fs');

// todo: use actual attribute names in the json here, then replace the 
// key names with "x" and "y" used by chart.js when sending it over

// different colors in legend for different kinds of events
// deaths, infantry, air, ground vehicle, support?

// sometimes bot sends 0kb file, why?


// ============================== Config ===========================

var trackedPlayers = ['kurohagane', 'lukas1233', 'yippys'];

var outputFilename = 'output_report.html'

// ============================= Functions ==============================

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

function categorizeEvents(eventHistory, property) {
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
      const eventHistoryStr = JSON.stringify(eventHistory, null, '\t');
      //console.log(eventHistoryStr)
      createReport(eventHistory, uniqueChars);
      await interaction.reply({ files: [outputFilename]})
    }
  });
  
  client.login(token);

  // =============================== PS2 STREAMING API ===================================

  const census_promises = [
    census.getFactionMap(),
    census.getLoadoutMap(),
    census.getWeaponMap(),
    census.getVehicleMap(),
    census.getGainXpMap()
  ];

  const [
    factionMap,
    loadoutMap,
    weaponMap,
    vehicleMap,
    gainXpMap
  ] = await Promise.all(census_promises);
  console.log('Census promises resolved!');

  const charMap = await census.getCharacterMap(await census.getMemberNames('hhzs'));
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
    eventNames: ['GainExperience', 'Death'], //'PlayerLogin', 'PlayerLogout'],
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
      p = data.payload;
      const charId = p.character_id;
      let eventName = p.event_name;
      const timestamp = p.timestamp;
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


      //console.log(memberIds.includes(charId));
      
      // todo: refactor this whole bit to make more sense

      let activeChar = '';
      let passiveChar = '';
      let loadoutId = '';
      let metadata = '';
      let logMessage = '';
      let vehicle = '';
      if (eventName === 'GainExperience') {
        const xpEvent = gainXpMap[p.experience_id];
        logMessage = `got ${xpEvent.xp}xp for "${xpEvent.desc}"`;
        metadata = `${xpEvent.desc} (${xpEvent.xp}xp)`;
        activeChar = (charId in charMap) ? charMap[charId] : '?';
        passiveChar = (p.other_id in charMap) ? charMap[p.other_id] : '?';

        loadoutId = p.loadout_id;
        
      } else if (eventName === 'Death') {
        const weaponId = p.attacker_weapon_id;
        //const weapon = (weaponId in weaponMap) ? weaponMap[weaponId].name : `weapon ${weaponId}`;
        const weapon = (weaponId in weaponMap) ? weaponMap[weaponId].name : '?';
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
      
      console.log(msg);
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
      }
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