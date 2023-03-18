const WebSocket = require('ws');
const request = require('sync-request');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');


// todo: use actual attribute names in the json here, then replace the 
// key names with "x" and "y" used by chart.js when sending it over


// ============================== Config ===========================

// Read the contents of the config file
const rawConfig = fs.readFileSync('config.json');

// Parse the config file as a JSON object
const config = JSON.parse(rawConfig);

// Replace with your own Daybreak API service ID
const serviceId = config.sid;

var trackedPlayers = ['kurohagane', 'lukas1233', 'yippys'];

var output_filename = 'output_report.html'

// ============================= Functions ==============================

function createReport(eventHistory) {

  fs.readFile('report_template.html', 'utf-8', (err, html) => {
    if (err) throw err;

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const element = document.querySelector('#script');
    element.setAttribute('report-data', JSON.stringify(eventHistory));

    presentUniquePlayers = Array.from(eventHistory.reduce((uniquePlayerSet, currEvent) => {
      uniquePlayerSet.add(currEvent.y);
      return uniquePlayerSet;
    }, new Set()));
    console.log(presentUniquePlayers);
    element.setAttribute('y-labels', JSON.stringify(presentUniquePlayers));
    fs.writeFile(output_filename, dom.serialize(), (err) => {
      if (err) throw err;
      console.log('HTML saved to output.html');
    });
  });
}


async function getGainExperienceIdDescMap() {
  const url = 'https://census.daybreakgames.com/get/ps2/experience?c:limit=10000'
  const response = await axios.get(url);
  const map = response.data.experience_list.reduce( (acc, currEvent) => {
    acc[currEvent.experience_id] = currEvent.description;
    return acc;
  }, {});
  return map;
}

function getMemberNames(outfitTag) {
  let memberNames = [];
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:resolve=member_character(name,members_character_id)`
  const res = request('GET', url);
  const data = JSON.parse(res.getBody('utf8'));
  for(member of data.outfit_list[0].members) {
    memberNames.push(member.name.first);
  }
  return memberNames;
}

async function getPlayerIdNameMap(playerNames) {
  // map names onto promises of requests for corresponding ids
  const promises = playerNames.map(name => {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/character/?name.first_lower=${name.toLowerCase()}`;
    return axios.get(url);
  });

  // resolve promises to responses
  const responses = await Promise.all(promises);

  // map responses onto ids
  let playerIds = responses.map(response => {
    const data = response.data;
    if (data.character_list.length > 0) {
      return data.character_list[0].character_id;
    } else {
      return null;
    }
  });
  return mapTwoArrays(playerIds, playerNames);
}

function mapTwoArrays(keys, values) {
  map = keys.reduce( (accumulated, currKey, currIndex) => {
    accumulated[currKey] = values[currIndex];
    return accumulated;
  }, {});
  return map;
}

// =================================== MAIN EXECUTION ===================
async function main() {


  //idNameMap = await getPlayerIdNameMap(trackedPlayers);
  const idNameMap = await getPlayerIdNameMap(getMemberNames('bgla'));

  const trackedIds = Object.keys(idNameMap);
  console.log(idNameMap);
  //console.log(trackedIds);

  var eventHistory = [];

  const gainXpIdDescMap = await getGainExperienceIdDescMap();
  //console.log(gainXpIdDescMap);


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
      
      createReport(eventHistory);
      await interaction.reply({ files: [output_filename]})
    }
  });
  

  client.login(config.token);

  // =============================== PS2 STREAMING API ===================================

  // Create a new WebSocket connection to the Daybreak API websocket endpoint
  const ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);

  // subscribe to outfit member events
  subJSON = {
    service: 'event',
    action: 'subscribe',
    characters: trackedIds,
    worlds: ['all'],
    eventNames: ['GainExperience'], //'Death', 'PlayerLogin', 'PlayerLogout'],
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
      const characterId = data.payload.character_id;
      if( !(characterId in idNameMap) ) {
        console.log(`unknown ID: ${characterId}`);
        return;
      }
      //console.log(memberIds.includes(characterId));
      const timestamp = data.payload.timestamp;
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

      let eventName = data.payload.event_name;
      if (eventName === 'GainExperience') {
        eventName = gainXpIdDescMap[data.payload.experience_id];
      }
      const characterName = idNameMap[characterId];
      msg = `${formattedDate}: ${eventName} event for ${characterName}`
      console.log(msg);
      //eventHistory.push({timestamp: date, player: characterName, event: eventName})
      eventHistory.push({x: formattedDate, y: characterName, event: eventName})
      
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