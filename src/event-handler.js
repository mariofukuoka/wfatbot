const { serviceId } = require('../config/config.json');
const WebSocket = require('ws');
const { getEventMsg, charIdIsValid, timestampToDate } = require('./helper-funcs');
const { getCharacter } = require('./census-funcs');
const { 
  saveDeathEvent,
  saveVehicleDestroyEvent,
  saveExperienceEvent,
  savePlayerFacilityEvent,
  saveSkillAddedEvent,
  saveItemAddedEvent,
  savePlayerSessionEvent
 } = require('./database-api');

 const itemMap = require('../api-maps/item-map.json');
 const skillMap = require('../api-maps/skill-map.json');
 const factionMap = require('../api-maps/faction-map.json');
 const vehicleMap = require('../api-maps/vehicle-map.json');
 const loadoutMap = require('../api-maps/loadout-map.json');
 const experienceMap = require('../api-maps/experience-map.json');
 const zoneMap = require('../api-maps/zone-map.json');
 const regionMap = require('../api-maps/region-map.json');
 const worldMap = require('../api-maps/world-map.json');

// global var
var charMap = null;
const setCharMap = newCharMap => charMap = newCharMap;

const fetchIfMissing = async characterId => {
  if (!charIdIsValid(characterId)) return null;
  else if (characterId in charMap) {
      return charMap[characterId];
  } 
  else { // attempt to fetch from census API
    try {
      newChar = await getCharacter(characterId);
      if (newChar != null) charMap[characterId] = newChar; // cache new char
        return newChar;
    } 
    catch (e) {
      console.log('character retrieval error:', characterId, e)
      return null;
    }
  }
}

const handleDeathPayload= async (p) => {
  const deathEvent = {
    timestamp: parseInt(p.timestamp),
    attackerId: p.attacker_character_id,
    attacker: await fetchIfMissing(p.attacker_character_id),
    attackerClass: loadoutMap[p.attacker_loadout_id]?.class,
    attackerFaction: factionMap[p.attacker_team_id],
    attackerVehicle: vehicleMap[p.attacker_vehicle_id],
    attackerWeaponId: p.attacker_weapon_id,
    attackerWeapon: itemMap[p.attacker_weapon_id]?.name,
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    class: loadoutMap[p.character_loadout_id]?.class,
    faction: factionMap[p.team_id],
    vehicle: vehicleMap[p.vehicle_id],
    isHeadshot: parseInt(p.is_headshot),
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  console.log(getEventMsg(p.event_name, deathEvent));
  saveDeathEvent.run(deathEvent);
}

const handleVehicleDestroyPayload = async (p) => {
  const vehicleDestroyEvent = {
    timestamp: parseInt(p.timestamp),
    attackerId: p.attacker_character_id,
    attacker: await fetchIfMissing(p.attacker_character_id),
    attackerClass: loadoutMap[p.attacker_loadout_id]?.class,
    attackerFaction: factionMap[loadoutMap[p.attacker_loadout_id]?.factionId],
    attackerVehicle: vehicleMap[p.attacker_vehicle_id],
    attackerWeaponId: p.attacker_weapon_id,
    attackerWeapon: itemMap[p.attacker_weapon_id]?.name,
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
  saveVehicleDestroyEvent.run(vehicleDestroyEvent);
}

const handleExperiencePayload = async (p) => {
  const experienceEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    class: loadoutMap[p.loadout_id]?.class,
    faction: factionMap[loadoutMap[p.loadout_id]?.factionId],
    otherId: p.other_id,
    other: await fetchIfMissing(p.other_id),
    experienceId: p.experience_id,
    description: experienceMap[p.experience_id]?.desc, 
    amount: p.amount,
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  //console.log(p.event_name, experienceEvent);
  console.log(getEventMsg(p.event_name, experienceEvent));
  saveExperienceEvent.run(experienceEvent);
}

const handlePlayerFacilityPayload = async (p) => {
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
  savePlayerFacilityEvent.run(playerFacilityEvent);
}

const handleSkillAddedPayload = async (p) => {
  skill = skillMap[p.skill_id];
  const skillAddedEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    skillId: p.skill_id,
    name: skill?.name,
    skillLine: skill?.skillLine,
    skillPoints: skill?.skillPoints,
    grantItemId: skill?.grantItemId,
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  console.log(getEventMsg(p.event_name, skillAddedEvent));
  saveSkillAddedEvent.run(skillAddedEvent);
}

const handleItemAddedPayload = async (p) => {
  const item = itemMap[p.item_id];
  const itemAddedEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    itemId: p.item_id,
    name: item?.name,
    type: item?.type,
    category: item?.category,
    skillSet: item?.skillSet,
    itemCount: p.item_count,
    context: p.context,
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  console.log(getEventMsg(p.event_name, itemAddedEvent));
  /* if (item != null && item.parentItems.length > 0) {
    console.log(`Attachment for: ${item.parentItems.map(id => console.log(itemMap[id].name))}`);
  } */
  saveItemAddedEvent.run(itemAddedEvent);
}

const handlePlayerSessionPayload = async (p) => {
  const playerSessionEvent = {
    timestamp: p.timestamp,
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    type: p.event_name,
    server: worldMap[p.world_id]
  }
  console.log(getEventMsg(p.event_name, playerSessionEvent));
  savePlayerSessionEvent.run(playerSessionEvent);  
}

const startWebsocket = (subscribtion) => {
  // Websocket
  let ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);

  // Websocket subscription JSON

  // Listen for the 'open' event, indicating that the connection to the websocket has been established
  ws.on('open', () => {
    console.log('Websocket: Connected to Daybreak streaming API');
    // Subscribe to the player login event stream
    ws.send(JSON.stringify(subscription));
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
          handleDeathPayload(p);
        }
        else if (p.event_name === 'VehicleDestroy') {
          handleVehicleDestroyPayload(p);
        }
        else if (p.event_name === 'GainExperience') {
          handleExperiencePayload(p);
        }
        else if (p.event_name === 'PlayerFacilityCapture' || p.event_name === 'PlayerFacilityDefend') {
          handlePlayerFacilityPayload(p);
        }
        else if (p.event_name === 'SkillAdded') {
          handleSkillAddedPayload(p);
        }
        else if (p.event_name === 'ItemAdded') {
          handleItemAddedPayload(p);
        }
        else if ((p.event_name === 'PlayerLogin' || p.event_name === 'PlayerLogout')) { // && p.character_id in charMap) {
          handlePlayerSessionPayload(p);
        }
      } catch (e) {
        console.log('error:', e);
        console.log(p)
      }
    }
    else if (data.type === 'heartbeat') return;
    else {
      const timestamp = Math.floor(Date.now() / 1000);
      let msg = `[${timestampToDate(timestamp)}] [SERVER] ${JSON.stringify(data)}`;
      console.log(msg);
    }
  });
  ws.on('error', err => {
    console.log('error:', err);
  });
  ws.on('close', function close() {
    console.log('WebSocket disconnected');
    setTimeout(startWebsocket, 5000);
  });
}


module.exports = {
  startWebsocket,
  setCharMap,
  handleDeathPayload,
  handleVehicleDestroyPayload,
  handleExperiencePayload,
  handlePlayerFacilityPayload,
  handleSkillAddedPayload,
  handleItemAddedPayload,
  handlePlayerSessionPayload
}