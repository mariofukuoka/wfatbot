const axios = require('axios');
const { serviceId } = require('./config.json');
const limit = 10000;

function mapTwoArrays(keys, values) {
    map = keys.reduce( (accumulated, currKey, currIndex) => {
        accumulated[currKey] = values[currIndex];
        return accumulated;
    }, {});
    return map;
}

async function getCharacterMap(charNames) {
    // map names onto promises of requests for corresponding ids
    const promises = charNames.map(name => {
        const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/character/?name.first_lower=${name.toLowerCase()}`;
        return axios.get(url);
    });
  
    // resolve promises to responses
    const responses = await Promise.all(promises);
  
    // map responses onto ids
    let charIds = responses.map(response => {
        const data = response.data;
        if (data.character_list.length > 0) {
            return data.character_list[0].character_id;
        } else {
            return null;
        }
    });
    return mapTwoArrays(charIds, charNames);
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
async function getGainXpMap() {
    const url = `https://census.daybreakgames.com/s:${serviceId}/get/ps2/experience?c:limit=${limit}`;
    const response = await axios.get(url);
    const map = response.data.experience_list.reduce( (acc, currEvent) => {
        acc[currEvent.experience_id] = {desc: currEvent.description, xp: currEvent.xp};
        return acc;
    }, {});
    return map;
}


/**
 * @returns {{weaponId: {name:string, factionId:string}}}
 */
async function getWeaponMap() {
    // returns { weaponId: {name:, factionId:} }
    const url1 = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/item_to_weapon?c:limit=${limit}`;
    const url2 = `https://census.daybreakgames.com/s:${serviceId}/get/ps2:v2/item?c:limit=${limit}`;
    const promises = [axios.get(url1), axios.get(url2)];
    const responses = await Promise.all(promises);

    const itemToWeapMap = responses[0].data.item_to_weapon_list.reduce( (map, currEntry) => {
        map[currEntry.item_id] = currEntry.weapon_id;
        return map;
    }, {});
    //console.log(Object.keys(itemToWeapMap).length);
    //console.log(itemToWeapMap);

    const weaponMap = responses[1].data.item_list.reduce( (map, currItem) => {
        if(currItem.item_id in itemToWeapMap && currItem.name != undefined) {
            let currWeapon = itemToWeapMap[currItem.item_id];
            if(currWeapon in map) {
                //console.log(`weapon_id ${currWeapon} already in map, old item_id: ${map[currWeapon].item_id}, new item_id: ${currItem.item_id}`);
                // if multiple items are assigned to the same weapon, it means it's a common pool weapon, so set faction to 0 i.e. none
                map[currWeapon].faction_id = '0';
            }
            let faction_id = ('faction_id' in currItem) ? currItem.faction_id : '0';
            map[currWeapon] = {name: currItem.name.en, factionId: faction_id}; //, item_id: currItem.item_id};
        }
        return map;
    }, {});
    return weaponMap;
}


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

    //console.log(loadoutMap);
    /*
    // 28 190 4 NSO Infiltrator 
    loadoutMap['28'] = {class: 'Infiltrator', factionId: '4'};
    // 29 191 4 NSO Light Assault 
    loadoutMap['29'] = {class: 'Light Assault', factionId: '4'};
    // 30 192 4 NSO Medic 
    loadoutMap['30'] = {class: 'Medic', factionId: '4'};
    // 31 193 4 NSO Engineer 
    loadoutMap['31'] = {class: 'Infiltrator', factionId: '4'};
    // 32 194 4 NSO Heavy Assault 
    loadoutMap['32'] = {class: 'Heavy Assault', factionId: '4'};
    // 45 252 4 NSO MAX
    loadoutMap['45'] = {class: 'MAX', factionId: '4'};
    */
    //console.log(loadoutMap);
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

/* (async () => {
    console.log(await getVehicleMap());
})(); */


// set exports to allow main file to access funcs
module.exports = {
    getCharacterMap,
    getMemberNames,
    getGainXpMap,
    getWeaponMap,
    getLoadoutMap,
    getFactionMap,
    getVehicleMap
}