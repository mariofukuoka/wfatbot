const axios = require('axios');
const { serviceId } = require('./config.json');
const limit = 5000;

function mapTwoArrays(keys, values) {
    map = keys.reduce( (accumulated, currKey, currIndex) => {
        accumulated[currKey] = values[currIndex];
        return accumulated;
    }, {});
    return map;
}

async function getCharacter(charId) {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/character/?character_id=${charId}&c:show=name.first`;
  const res = await axios.get(url);
  try {
    return res.data.character_list[0].name.first;
  }
  catch (e) {
    //console.log(e);
    return null;
  }
}

async function getCharacterMap(charNames) {
    // map names onto promises of requests for corresponding ids
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/character_name?name.first_lower=${charNames}&c:limit=${limit}`;

    //console.log(url);
    // resolve promises to responses
    const response = await axios.get(url);
  
    let charMap = {};
    response.data.character_name_list.forEach(char => {
      charMap[char.character_id] = char.name.first;
    });
    return charMap;
}

async function getMemberNames(outfitTag) {
    let memberNames = [];
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:resolve=member_character(name,members_character_id)`;
    const response = await axios.get(url);
    for(member of response.data.outfit_list[0].members) {
        try {
            memberNames.push(member.name.first);
        } catch(e) {
            console.log(`error: couldn't read ${member.character_id}`);
        }
    }
    return memberNames;
}

/**
 * @returns {{experienceId: {desc:string, xp:string}}}
 */
async function getExperienceMap() {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2/experience?c:limit=${limit}`;
    const response = await axios.get(url);
    const map = response.data.experience_list.reduce( (acc, currEvent) => {
        acc[currEvent.experience_id] = {desc: currEvent.description, xp: currEvent.xp};
        return acc;
    }, {});
    return map;
}

// TODO: use desc instead of name.en, refactor to 1 joined request
/**
 * returns a map of faction infantry classes to their names
 * @returns {{loadoutId: {class:, factionId:}}}
 */
async function getLoadoutMap() {
    const url1 = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/profile/?c:limit=${limit}`
    const url2 = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/loadout/?c:limit=${limit}`
    const promises = [axios.get(url1), axios.get(url2)];

    const responses = await Promise.all(promises);

    const profileMap = responses[0].data.profile_list.reduce( (map, currProfile) => {
        map[currProfile.profile_id] = currProfile.name.en;
        return map;
    }, {});

    //console.log(profileMap);
    let loadoutMap = responses[1].data.loadout_list.reduce( (map, currLoadout) => {
        map[currLoadout.loadout_id] = {class: profileMap[currLoadout.profile_id], factionId: currLoadout.faction_id};
        return map;
    }, {});
    return loadoutMap;
}


/**
 * returns a map of factions to their code tags (TR, NC, VS, NSO)
 * @returns {{factionId: string}}
 */
async function getFactionMap() {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/faction/?c:limit=${limit}`
    const response = await axios.get(url);
    const factionMap = response.data.faction_list.reduce( (map, currFaction) => {
        map[currFaction.faction_id] = currFaction.code_tag;
        return map;
    }, {});
    return factionMap;
}


/**
 * returns a map of vehicles to their names
 * @returns {{vehicleId: String}}
 */
async function getVehicleMap() {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/vehicle/?c:limit=${limit}`
    const response = await axios.get(url);
    const vehicleMap = response.data.vehicle_list.reduce( (map, currVehicle) => {
        map[currVehicle.vehicle_id] = currVehicle.name.en;
        return map;
    }, {});
    return vehicleMap;
}

/**
 * returns a map of weapon item ids to their names
 * @returns {{itemId: String}}
 */
async function getItemMap() {
  const countUrl = `https://census.daybreakgames.com/s:${serviceId}/count/ps2:v2/item/`
  const countResponse = await axios.get(countUrl);
  const itemCount = countResponse.data.count;
  let promises = [];
  for (let start = 0; start < itemCount; start += limit) {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/item/?c:start=${start}&c:limit=${limit}`
    promises.push(axios.get(url));
  }
  console.log(promises.length);
  const responses = await Promise.all(promises);
  /* const itemList = [];
  responses.forEach(res => {itemList.concat(res.data.item_list)}) */
  const itemMap = {};
  responses.forEach(res => {
    partialMap = res.data.item_list.reduce( (map, currItem) => {
      try {
        map[currItem.item_id] = currItem.name.en;
      } catch(e) {
        //console.log(`item ${currItem.item_id} has an undefined name`);
      }
      return map;
    }, {});
    Object.assign(itemMap, partialMap);
  });
  console.log(Object.keys(itemMap).length);
  return itemMap;
}

/**
 * returns a map of region ids to their names
 * @returns {{regionId: String}}
 */
async function getRegionMap() {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/map_region/?&c:limit=${limit}`
  const response = await axios.get(url);
  const regionMap = response.data.map_region_list.reduce( (map, currRegion) => {
    try {
      map[currRegion.facility_id] = currRegion.facility_name;
    } catch(e) {
      //console.log(`region ${currRegion.region_id} has an undefined name`);
    }
    return map;
  }, {});
  return regionMap;
}

/**
 * returns a map of zone ids to their names
 * @returns {{zoneId: String}}
 */
async function getZoneMap() {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/zone/?&c:limit=${limit}`
  const response = await axios.get(url);
  const zoneMap = response.data.zone_list.reduce( (map, currZone) => {
    try {
      map[currZone.zone_id] = currZone.name.en;
    } catch(e) {
      //console.log(`zone ${currZone.zone_id} has an undefined name`);
    }
    return map;
  }, {});
  return zoneMap;
}


/**
 * returns a map of world ids to their names
 * @returns {{worldId: String}}
 */
async function getWorldMap() {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/world/?&c:limit=${limit}`
  const response = await axios.get(url);
  const worldMap = response.data.world_list.reduce( (map, currWorld) => {
    try {
      map[currWorld.world_id] = currWorld.name.en;
    } catch(e) {
      //console.log(`world ${currWorld.world_id} has an undefined name`);
    }
    return map;
  }, {});
  return worldMap;
}


/**
 * returns a map of skill ids to their names
 * @returns {{skillId: String}}
 */
async function getSkillMap() {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/skill/?&c:limit=${limit}`
  const response = await axios.get(url);
  const skillMap = response.data.skill_list.reduce( (map, currSkill) => {
    try {
      map[currSkill.skill_id] = currSkill.name.en;
    } catch(e) {
      //console.log(`skill ${currSkill.skill_id} has an undefined name`);
    }
    return map;
  }, {});
  return skillMap;
}

(async () => {
  await getCharacterMap(await getMemberNames('vcbc'));
})(); 


// set exports to allow main file to access funcs
module.exports = {
    getCharacter,
    getCharacterMap,
    getMemberNames,
    getExperienceMap,
    getLoadoutMap,
    getFactionMap,
    getVehicleMap,
    getItemMap,
    getRegionMap,
    getZoneMap,
    getWorldMap,
    getSkillMap
}