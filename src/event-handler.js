const { serviceId } = require('../config/config.json');
const WebSocket = require('ws');
const { worldId } = require('../config/config.json');
const { charIdIsValid, timestampToDate } = require('./helper-funcs');
const { getCharacter, getMemberMap, filterOnline } = require('./census-funcs');
const { 
  db,
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
var ws = null;
var charMap = null;
var teamMap = null;
var trackedIds = null;

const vrZoneIds = new Set('95', '96', '97', '98');

// todo: make a command to read curr teamMap and charMap counts

const getEventMsg = (eventName, event) => {
  const involvedTeams = [];
  ['attackerTeamId', 'teamId', 'otherTeamId'].forEach(teamIdProperty => {
    if (teamIdProperty in event) involvedTeams.push(teamMap[event[teamIdProperty]]?.tag || '?');
  });
  let msg = `${timestampToDate(event.timestamp)} [${eventName}] [${involvedTeams.join('/')}]`;
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
    else if (event.otherId > 0) msg += ` through NPC ${event.otherId}`;
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
    if (event.name) msg += ` ${event.name} (${event.skillLine}, ${event.skillPoints} points})`; else msg += ` unknown skill (${event.skillId})`;
    if (event.grantItemId) msg += ` grant item: ${itemMap[event.grantItemId].name} (ID ${event.grantItemId})`;
    msg += ` [${event.continent}]`;
  } 
  else if (eventName === 'ItemAdded') {
    msg += `${event.character} unlocked`
    if (event.itemCount) msg += ` ${event.itemCount}`;
    if (event.name) msg += ` ${event.name} (${event.type}, ${event.category})`; else msg += ` unknown item (${event.itemId})`;
    if (event.itemId in itemMap && itemMap[event.itemId].parentItems.length > 0) msg += ` for ${itemMap[itemMap[event.itemId].parentItems[0]].name}`;
    //if (event.itemId in itemMap && itemMap[event.itemId].parentItems.length > 0) msg += ` for ${itemMap[event.itemId].parentItems.map(parentId => itemMap[parentId].name)}`;
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

const logEventToConsole = (eventName, event) => {
  console.log(getEventMsg(eventName, event));
}

const getCharAndTeamMap = async () => {
  
  let charMap = {};
  
  const outfits = db.prepare(`SELECT outfitTag AS tag, teamId FROM trackedOutfits`).all();
  const memberPromises = outfits.map( outfit => getMemberMap(outfit.tag, outfit.teamId));
  const memberMaps = await Promise.all(memberPromises);
  memberMaps.forEach( memberMap => {
    charMap = Object.assign(charMap, memberMap);
  });

  const characters = db.prepare(`SELECT characterId AS id, character AS name, teamId FROM trackedCharacters`).all();
  characters.forEach( char => {
    charMap[char.id] = { name: char.name, teamId: char.teamId };
  });

  const teams = db.prepare(`SELECT teamId as id, teamTag as tag FROM teams`).all();
  const teamMap = {};
  teams.forEach( team => {
    teamMap[team.id] = { tag: team.tag, currOnline: new Set() };
  });
  const onlineCharIds = await filterOnline(Object.keys(charMap));
  onlineCharIds.forEach( charId => {
    if (charId in charMap) {
      teamMap[ charMap[charId].teamId ].currOnline.add(charId);
    }
  });
  //console.log(teamMap);
  return [charMap, teamMap];
}



const fetchIfMissing = async characterId => {
  if (!charIdIsValid(characterId)) return null;
  else if (characterId in charMap) {
      return charMap[characterId].name;
  } 
  else { // attempt to fetch from census API
    try {
      newChar = await getCharacter(characterId);
      if (newChar != null) charMap[characterId] = { name: newChar, team: null }; // cache new char
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
    attackerTeamId: charMap[p.attacker_character_id]?.teamId || null,
    attackerClass: loadoutMap[p.attacker_loadout_id]?.class,
    attackerFaction: factionMap[p.attacker_team_id],
    attackerVehicle: vehicleMap[p.attacker_vehicle_id],
    attackerWeaponId: p.attacker_weapon_id,
    attackerWeapon: itemMap[p.attacker_weapon_id]?.name,
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    teamId: charMap[p.character_id]?.teamId || null,
    class: loadoutMap[p.character_loadout_id]?.class,
    faction: factionMap[p.team_id],
    vehicle: vehicleMap[p.vehicle_id],
    isHeadshot: parseInt(p.is_headshot),
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  logEventToConsole(p.event_name, deathEvent);
  saveDeathEvent.run(deathEvent);
}

const handleVehicleDestroyPayload = async (p) => {
  const vehicleDestroyEvent = {
    timestamp: parseInt(p.timestamp),
    attackerId: p.attacker_character_id,
    attacker: await fetchIfMissing(p.attacker_character_id),
    attackerTeamId: charMap[p.attacker_character_id]?.teamId || null,
    attackerClass: loadoutMap[p.attacker_loadout_id]?.class,
    attackerFaction: factionMap[loadoutMap[p.attacker_loadout_id]?.factionId],
    attackerVehicle: vehicleMap[p.attacker_vehicle_id],
    attackerWeaponId: p.attacker_weapon_id,
    attackerWeapon: itemMap[p.attacker_weapon_id]?.name,
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    teamId: charMap[p.character_id]?.teamId || null,
    faction: factionMap[p.faction_id],
    vehicle: vehicleMap[p.vehicle_id],
    facilityId: p.facility_id,
    facility: regionMap[p.facility_id],
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  logEventToConsole(p.event_name, vehicleDestroyEvent);
  saveVehicleDestroyEvent.run(vehicleDestroyEvent);
}

const handleExperiencePayload = async (p) => {
  const experienceEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    teamId: charMap[p.character_id]?.teamId || null,
    class: loadoutMap[p.loadout_id]?.class,
    faction: factionMap[loadoutMap[p.loadout_id]?.factionId],
    otherId: p.other_id,
    other: await fetchIfMissing(p.other_id),
    otherTeamId: charMap[p.other_id]?.teamId || null,
    experienceId: p.experience_id,
    description: experienceMap[p.experience_id]?.desc, 
    amount: p.amount,
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  //console.log(p.event_name, experienceEvent);
  logEventToConsole(p.event_name, experienceEvent);
  saveExperienceEvent.run(experienceEvent);
}

const handlePlayerFacilityPayload = async (p) => {
  const playerFacilityEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    teamId: charMap[p.character_id]?.teamId || null,
    type: p.event_name,
    facilityId: p.facility_id,
    facility: regionMap[p.facility_id],
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  logEventToConsole(p.event_name, playerFacilityEvent);
  savePlayerFacilityEvent.run(playerFacilityEvent);
}

const handleSkillAddedPayload = async (p) => {
  skill = skillMap[p.skill_id];
  const skillAddedEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    teamId: charMap[p.character_id]?.teamId || null,
    skillId: p.skill_id,
    name: skill?.name,
    skillLine: skill?.skillLine,
    skillPoints: skill?.skillPoints,
    grantItemId: skill?.grantItemId,
    continent: zoneMap[p.zone_id],
    server: worldMap[p.world_id]
  }
  logEventToConsole(p.event_name, skillAddedEvent);
  saveSkillAddedEvent.run(skillAddedEvent);
}

const handleItemAddedPayload = async (p) => {
  const item = itemMap[p.item_id];
  const itemAddedEvent = {
    timestamp: parseInt(p.timestamp),
    characterId: p.character_id,
    character: await fetchIfMissing(p.character_id),
    teamId: charMap[p.character_id]?.teamId || null,
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
  logEventToConsole(p.event_name, itemAddedEvent);
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
    teamId: charMap[p.character_id]?.teamId || null,
    type: p.event_name,
    server: worldMap[p.world_id]
  }
  logEventToConsole(p.event_name, playerSessionEvent);
  savePlayerSessionEvent.run(playerSessionEvent);  
  if (trackedIds.has(p.character_id)) {
    
    let msg = `Team ${teamMap[charMap[p.character_id].teamId].tag} online count updated from ${teamMap[charMap[p.character_id].teamId].currOnline.size} to `
    if (p.event_name === 'PlayerLogin') {
      teamMap[charMap[p.character_id].teamId].currOnline.add(p.character_id);
    }
    else {
      teamMap[charMap[p.character_id].teamId].currOnline.delete(p.character_id);
    }
    console.log(msg + `${teamMap[charMap[p.character_id].teamId].currOnline.size}`)
  }
}

const getSubscription = trackedIds => {
  return {
    service: 'event',
    action: 'subscribe',
    characters: ['all'],
    worlds: [worldId], // jaeger
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
    ],
    logicalAndCharactersWithWorlds:true
  }
}

var recentStats = {
  uniquePlayers: new Set(),
  eventCount: 0,
  lastClear: Date.now()
}

const updateRecentStats = p => {
  if (charIdIsValid(p.character_id)) recentStats.uniquePlayers.add(p.character_id);
  if (p?.attacker_character_id && charIdIsValid(p.attacker_character_id)) recentStats.uniquePlayers.add(p.attacker_character_id);
  if (p?.other_id && charIdIsValid(p.other_id)) recentStats.uniquePlayers.add(p.other_id);
  recentStats.eventCount += 1;
}

const clearRecentStats = () => {
  const temp = structuredClone(recentStats);
  recentStats = { uniquePlayers: new Set(), eventCount: 0, lastClear: Date.now() };
  return temp;
}

const startWebsocket = async () => {
  [charMap, teamMap] = await getCharAndTeamMap();
  console.log('Character & team map acquired.');
  console.log(`Listening to ${worldMap[worldId]}`);
  //console.log(charMap, teamMap)
  let msg = '';
  const trackedPerTeam = Object.values(charMap).reduce((acc, c) => {
    //console.log(c)
    acc[c.teamId] = acc[c.teamId] + 1 || 1;
    return acc;
  }, {});
  //console.log(trackedPerTeam)
  Object.entries(trackedPerTeam).forEach( ([teamId, count]) => {
    msg += `[${teamMap[teamId].tag}]\ttracked: ${count}\tonline: ${teamMap[teamId].currOnline.size}\n`;
  })
  console.log(msg);
  trackedIds = new Set(Object.keys(charMap));

  const subscription = getSubscription(Array.from(trackedIds));

  // Websocket
  ws = new WebSocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${serviceId}`);

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
      if (('attacker_character_id' in p && p.attacker_character_id === '0') || vrZoneIds.has(p?.zone_id)) { // filter out tutorial and vr events
        //console.log('Event from tutorial zone', p);
        return;
      }
      updateRecentStats(p);
      
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
      let msg = `${timestampToDate(timestamp)} [SERVER] ${JSON.stringify(data)}`;
      console.log(msg);
    }
  });
  ws.on('error', err => {
    console.log('error:', err);
  });
  ws.on('close', (event) => {
    console.log('WebSocket disconnected', event);
    setTimeout(startWebsocket, 5000);
  });
}

const closeWebsocket = () => {
  ws.close();
}

module.exports = {
  startWebsocket,
  handleDeathPayload,
  handleVehicleDestroyPayload,
  handleExperiencePayload,
  handlePlayerFacilityPayload,
  handleSkillAddedPayload,
  handleItemAddedPayload,
  handlePlayerSessionPayload,
  getCharAndTeamMap,
  closeWebsocket,
  clearRecentStats
}