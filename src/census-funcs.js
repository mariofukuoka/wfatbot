const axios = require('axios');
const { generalizeEmpireSpecificName } = require('./helper-funcs');
const { serviceId } = require('../config/config.json');
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

const getCharacterDetails = async charName => {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/character`
  + `?name.first_lower=${charName.toLowerCase()}&c:lang=en&c:show=character_id,name,battle_rank.value,prestige_level,faction_id`
  + `&c:join=outfit_member^on:character_id^to:character_id^inject_at:member^show:outfit_id'character_id`
  +   `(outfit^inject_at:outfit^show:name'alias'outfit_id)`
  + `&c:join=characters_world^inject_at:characters_world(world^inject_at:world^hide:state)`
  + `&c:join=faction^inject_at:faction^show:code_tag`;
  try {
    const res = await axios.get(url);
    const resChar = res.data.character_list[0];
    const characterDetails = {
      characterId: resChar.character_id,
      character: resChar.name.first,
      faction: resChar.faction.code_tag,
      server: resChar.characters_world.world.name.en,
      outfitTag: resChar?.member?.outfit?.alias || null,
      battleRank: `${parseInt(resChar.prestige_level)*100 + parseInt(resChar.battle_rank.value)}`
    }
    return characterDetails;
  } catch (e) {
    console.log(`Failed to resolve character ${charName}:`, e);
    return null;
  }
}

const getOutfitDetails = async outfitTag => {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/outfit`
  + `?alias_lower=${outfitTag.toLowerCase()}&c:lang=en`
  + `&c:join=characters_world^on:leader_character_id^to:character_id^inject_at:leaders_world(world^hide:state^inject_at:world)`
  + `&c:join=character^on:leader_character_id^to:character_id^inject_at:leader^show:character_id'name.first'faction_id(faction^inject_at:faction^show:faction_id'code_tag)`;
  try {
    const res = await axios.get(url);
    const resOutfit = res.data.outfit_list[0];
    const outfitDetails = {
      outfitId: resOutfit.outfit_id,
      outfitTag: resOutfit.alias,
      outfitName: resOutfit.name,
      leader: resOutfit.leader.name.first,
      memberCount: resOutfit.member_count,
      faction: resOutfit?.leader.faction.code_tag,
      server: resOutfit?.leaders_world.world.name.en
    }
    return outfitDetails;
  } catch (e) {
    console.log(e, outfitTag);
    return null;
  }
}


async function getCharacterMap(charNames) {
    // map names onto promises of requests for corresponding ids
    let promises = [];
    const urlCharLimit = 2000 - 200;
    let namesBuffer = [];
    let currNameIdx = 0;

    // get a list of requests asking for batches of game characters, such that each request's url string stays under the character limit
    while (currNameIdx < charNames.length) {
      while (`${namesBuffer + charNames[currNameIdx]}`.length < urlCharLimit) {
        if (currNameIdx >= charNames.length) break;
        namesBuffer.push(charNames[currNameIdx].toLowerCase());
        currNameIdx += 1;
      }
      const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/character_name`
      + `?name.first_lower=${namesBuffer}&c:limit=${limit}`
      + `&c:join=characters_online_status^on:character_id^to:character_id^inject_at:characters_online`;
      promises.push(axios.get(url));
      namesBuffer = [];
    }
    const responses = await Promise.all(promises);
    let charMap = {};
    responses.forEach(response => {
      response.data.character_name_list.forEach(char => {
        charMap[char.character_id] = char.name.first;
      })
    });
    return charMap;
}

/* async function getMemberNames(outfitTag) {
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
} */

async function getMemberMap(outfitTag, teamId=null) {
  const memberMap = {};
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:show=outfit_id,alias_lower&c:join=outfit_member^inject_at:members^list:1^show:outfit_id'character_id(character_name^on:character_id^to:character_id^inject_at:character)`;
  const response = await axios.get(url);
  //console.log(response.data)
  response.data.outfit_list[0].members.forEach(member => {
      if (member?.character?.name?.first) memberMap[member.character_id] = { name: member.character.name.first, teamId: teamId };
  });
  return memberMap;
}

async function filterOnline(charIds) {
  const promises = [];
  charIds.forEach( charId => {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/characters_online_status?character_id=${charId}`;
    promises.push(axios.get(url));
  });
  const responses = await Promise.all(promises);
  const onlineChars = [];
  responses.forEach( response => {
    try {
      const char = response.data.characters_online_status_list[0];
      if (!!parseInt(char.online_status)) {
        onlineChars.push(char.character_id);
      }
    } catch (e) {
      console.log('Failed to filter char ids', e);
    }
  });
  return onlineChars;
}

/* (async () => {
  const a = await getMemberMap('vcbc', 'WFAT');
  console.log(a);
  console.log(await filterOnline(Object.keys(a)));
})();  */

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

function isTrackedVehicle(vehicleName) {
  return new Set([
    'Flash',
    'Harasser',
    'Lightning',
    'Magrider',
    'Prowler',
    'Vanguard',
    'Sunderer',
    'Scythe',
    'Mosquito',
    'Reaver',
    'Valkyrie',
    'Liberator',
    'Galaxy'
  ]).has(vehicleName);
}

async function getVehicleActivityEvents() {
  const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2/experience?c:limit=${limit}`;
  const response = await axios.get(url);
  const map = {};
  response.data.experience_list.forEach( (event) => {
    const desc = event.description;
    let vehicleName = null;
    let status = null;
    if ( desc.includes('HIVE') || desc.includes('Protostatus') ) return;
    if ( desc.startsWith('Vehicle Repair - ') || desc.startsWith('Squad Repair - ') ) {
      vehicleName = desc.slice(desc.indexOf('-') + 2);
      status = 'active';
    } 
    else if ( desc.includes('Damage') && !desc.includes('Bastion') ) {
      vehicleName = desc.slice( 0, desc.indexOf('Damage') - 1 );
      status = 'active';
    } 
    else if ( desc.startsWith('Vehicle Destruction - ') ) {
      vehicleName = desc.slice(desc.indexOf('-') + 2);
      status = 'destroyed';
    }
    else return;
    if (isTrackedVehicle(vehicleName)) {
      map[event.experience_id] = {vehicle: generalizeEmpireSpecificName(vehicleName), status: status};
    }
    
  });
  map['201'] = {vehicle: 'Galaxy', status: 'active'}; // galaxy spawn bonus
  map['233'] = {vehicle: 'Sunderer', status: 'active'}; // sunderer spawn bonus
  //map['1988'] = {vehicle: 'ANT', status: 'active'}; // ANT spawn bonus
  //console.log(map)
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
 */
const getItemMap = async () => {
  const countUrl = `https://census.daybreakgames.com/s:${serviceId}/count/ps2:v2/item/`
  const countResponse = await axios.get(countUrl);
  const itemCount = countResponse.data.count;
  const promises = [];
  for (let start = 0; start < itemCount; start += limit) {
      const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2/`
      + `item?c:start=${start}&c:limit=${limit}&c:lang=en`
      + `&c:show=item_id,item_type_id,item_category_id,name,faction_id,skill_set_id`
      + `&c:join=item_type^inject_at:type^show:name`
      + `&c:join=item_category^inject_at:category^show:name`
      + `&c:join=skill_set^inject_at:skill_set^show:name`
      + `&c:join=faction^inject_at:faction^show:code_tag`
      + `&c:join=item_profile^inject_at:item_profile^list:1`
        + `(profile^inject_at:profile^show:profile_type_description)`
      + `&c:join=item_attachment^on:item_id^to:attachment_item_id^inject_at:parent_items^list:1`
      promises.push(axios.get(url));
  }
  const responses = await Promise.all(promises);
  const itemMap = {};
  responses.forEach(response => {
    response.data.item_list.forEach(item => {
      try {
        itemMap[item.item_id] = {
          name: ('name' in item) ? item.name.en : null,
          type: ('type' in item) ? item.type.name : null,
          category: ('category' in item) ? item.category.name.en : null,
          skillSet: ('skill_set' in item) ? item.skill_set.name.en : null,
          faction: ('faction' in item) ? item.faction.code_tag : null,
          classes: ('item_profile' in item) ? [...new Set(item.item_profile.map(obj => obj.profile.profile_type_description))] : [],
          parentItems: ('parent_items' in item) ? [...new Set(item.parent_items.map(obj => obj.item_id))] : []
        }
      } catch(e) {
          console.log(`item ${item.item_id} err: ${e}`);
          console.log(item);
      }
    })
  });
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
  const countUrl = `https://census.daybreakgames.com/s:${serviceId}/count/ps2:v2/skill/`
  const countResponse = await axios.get(countUrl);
  const skillCount = countResponse.data.count;
  const promises = [];
  for (let start = 0; start < skillCount; start += limit) {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/skill`
    + `?c:start=${start}&c:limit=${limit}`
    + `&c:lang=en&c:show=skill_id,skill_line_id,skill_line_index,skill_points,grant_item_id,name`
    + `&c:join=skill_line^inject_at:skill_line^show:skill_line_id'name'skill_points`
    promises.push(axios.get(url));
  }
  const responses = await Promise.all(promises);
  const skillMap = {};
  responses.forEach( response => {
    response.data.skill_list.forEach( skill => {
      skillMap[skill.skill_id] = {
        name: (skill.name?.en || null),
        skillLine: (skill.skill_line?.name?.en || null),
        skillPoints: (skill.skill_points || null),
        grantItemId: (skill.grant_item_id || null)
      }
    })
  });
  return skillMap;
}



// set exports to allow main file to access funcs
module.exports = {
    getCharacter,
    getCharacterMap,
    //getMemberNames,
    getExperienceMap,
    getVehicleActivityEvents,
    getLoadoutMap,
    getFactionMap,
    getVehicleMap,
    getItemMap,
    getRegionMap,
    getZoneMap,
    getWorldMap,
    getSkillMap,
    getCharacterDetails,
    getOutfitDetails,
    getMemberMap,
    filterOnline
}