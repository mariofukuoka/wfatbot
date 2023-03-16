const WebSocket = require('ws');
const request = require('sync-request');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// Read the contents of the config file
const rawConfig = fs.readFileSync('config.json');

// Parse the config file as a JSON object
const config = JSON.parse(rawConfig);

// Replace with your own Daybreak API service ID
const serviceId = config.sid;

// Create a new WebSocket connection to the Daybreak API websocket endpoint
const ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);


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
  if (msg.content === '!ping') {
    msg.reply('Pong!');
  }
});

client.login(config.token);

// subscribe to outfit member events
subJSON = {
  service: 'event',
  action: 'subscribe',
  //characters: memberIds,
  worlds: ['all'],
  eventNames: ['PlayerLogin']
  //logicalAndCharactersWithWorlds:true
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
    //console.log(memberIds.includes(characterId));
    const timestamp = data.payload.timestamp;
    const date = new Date(timestamp * 1000)
    const formattedDate = date.toLocaleString('en-GB', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit',
      minute: '2-digit',
      hour12: false 
    });
    console.log(`Player ${characterId} logged in at ${formattedDate}`);
    
    // Send a message to a Discord channel
    const channelId = '695500966690029590';
    const channel = client.channels.cache.get(channelId); // Replace with your channel ID
    channel.send(`Player ${characterId} logged in at ${formattedDate}`);
  }
});

ws.on('close', function close() {
  console.log('WebSocket disconnected');
});


/*
// get list of outfit member ids 
function getMemberIds(outfitTag) {
  let memberIds = [];
  url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:resolve=member_character(name,members_character_id)`
  const res = request('GET', url);
  const data = JSON.parse(res.getBody('utf8'));
  for(member of data.outfit_list[0].members) {
    memberIds.push(member.character_id);
  }
  return memberIds;
}

memberIds = getMemberIds('axig');
console.log(memberIds[0]);

// subscribe to outfit member events
subJSON = {
  service: 'event',
  action: 'subscribe',
  characters: memberIds,
  worlds: ['all'],
  eventNames: ['Death'],
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
    console.log(memberIds.includes(characterId));
    const timestamp = data.payload.timestamp;
    const date = new Date(timestamp * 1000)
    const formattedDate = date.toLocaleString('en-GB', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit',
      minute: '2-digit',
      hour12: false 
    });
    console.log(`Player ${characterId} logged in at ${formattedDate}`);
  }
});

*/