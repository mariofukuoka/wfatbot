itemMap = require('../api-maps/item-map.json');

// valid character ids are odd, npc ids are even
const charIdIsValid = characterId => characterId.slice(-1) % 2 === 1

const timestampToDate = timestamp => {
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

const getEventMsg = (eventName, event) => {
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

const randomColorStr = () => {
  let randChannelVal = () => {
    return Math.floor(Math.random() * 256);
  }
  return `rgba(${randChannelVal()}, ${randChannelVal()}, ${randChannelVal()}, 0.5)`;
}

function generalizeEmpireSpecificName(vehicleName) {
  return specificToGeneral = {
    'Scythe': 'ESF',
    'Mosquito': 'ESF',
    'Reaver': 'ESF',
    'Magrider': 'MBT',
    'Prowler': 'MBT',
    'Vanguard': 'MBT'
  }[vehicleName] || vehicleName;
}

module.exports = {
    timestampToDate,
    getEventMsg,
    charIdIsValid,
    randomColorStr,
    generalizeEmpireSpecificName
}