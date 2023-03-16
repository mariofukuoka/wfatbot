const WebSocket = require('ws');
const axios = require('axios');

// Replace with your own Daybreak API service ID
const serviceId = 'vcbcgeneraluse';

// Create a new WebSocket connection to the Daybreak API websocket endpoint
const ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);

async function getMemberIds(outfitTag) {
  let memberIds = [];
  req = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:resolve=member_character(name,members_character_id)`
  const res = await axios.get(req);
  for(member of res.data.outfit_list[0].members) {
    memberIds.push(member.character_id);
  }
  return memberIds;
}

async function printMemberIds(outfitTag) {
  const memberIds = await getMemberIds(outfitTag)
  console.log(memberIds)
}

await printMemberIds('dig')


subJSON = {
  service: 'event',
  action: 'subscribe',
  worlds: ['all'],
  eventNames: ['PlayerLogin']
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
  if (data.type === 'serviceMessage' && data.payload.event_name === 'PlayerLogin') {
    const characterId = data.payload.character_id;
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
