
const { JSDOM } = require('jsdom');
const { db } = require('./database-api');
const fs = require('fs');
const itemMap = require('../api-maps/item-map.json');
const { 
  assertValidDateFormat, 
  inputDateFormatToTimestamp, 
  inputDateToFilenameFormat, 
  getDateAndTimeString 
} = require('./helper-funcs');
const path = require('path');


const boxHightlightStyle = 'border-color: gold; color: gold;'
const pointHightlightStyle = 'color: #ffd700;'
const boxKillStyle = 'background-color: #25744d; color: #33CC33;';
const boxDeathStyle = 'background-color: #990000; color: #ff5959;';

function toDate(timestamp) {
  const dateStr = new Date(timestamp*1000).toJSON();
  const formattedDateStr = `${dateStr.slice(2, 10)} ${dateStr.slice(11, 16)}`;
  return formattedDateStr;
}

const getTimeline = (characters, startTimestamp, endTimestamp) => {
  
  //console.log(startTimestamp, toDate(startTimestamp), endTimestamp, toDate(endTimestamp));
  const quoteEnclosedCharacters = characters.map(c=>`'${c}'`);

  const getOtherRepr = (otherId, other) => {
    if (other) return other;
    else if (otherId > 0) return `NPC...${otherId.slice(-5, -1)}`;
    else return 'null';
  }
  
  const initStreak = (event) => {
    return {
      id: event.id,
      start: event.timestamp,
      end: event.timestamp,
      count: 1,
      amount: event.amount,
      others: [getOtherRepr(event.otherId, event.other)],
    }
  };
  
  const getExperienceItem = (char, eventName, streak) => {
    const parsedOtherList = Object.entries(streak.others.reduce( (obj , other) => {
      obj[other] = obj[other] + 1 || 1;
      return obj;
    }, {})).map( ([other, count]) => {
      if (count > 1) return `${other} (x${count})`;
      else return other;
    });
    const item = {
      id: streak.id,
      group: char,
      content: eventName,
      subgroup: 'experience',
      start: streak.start * 1000,
      title: `With: ${parsedOtherList.join(', ')}<br>XP: ${streak.amount}`
    };
    if (streak.start !== streak.end) {
      item.end = streak.end * 1000;
      item.content += ` (x${streak.count})`;
      item.title += ` from ${streak.count} events over ${streak.end - streak.start} seconds`;
    }
    // if any of the 'others' are one of the tracked chars, highlight item
    if (streak.others.reduce((otherInChars, other) => otherInChars || (characterSet.has(other) && other !== char), false)) {
      item.style = pointHightlightStyle;
    }
    return item;
  }
  
  const classCheckpoints = [];
  const deathEvents = db.prepare(
    `SELECT * FROM deathEvents
    WHERE (character IN (${quoteEnclosedCharacters}) OR attacker in (${quoteEnclosedCharacters}))
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}`
    ).all();
  //console.log(events);
  const deathItems = [];
  const vehicleDestroyItems = [];
  const characterSet = new Set(characters);
  deathEvents.forEach( event => {
    classCheckpoints.push({timestamp: event.timestamp, character: event.character, class: event.class});
    classCheckpoints.push({timestamp: event.timestamp, character: event.attacker, class: event.attackerClass});
    const item = {
      start: event.timestamp * 1000,
      subgroup: 'death',
      type: 'box',
      title: `Continent: ${event.continent}</br>`
    }
    if (characterSet.has(event.attacker) && event.attacker !== event.character) {
      const killItem = {...item};
      killItem.group = event.attacker;
      killItem.content = `⚔️ ${event.faction} ${event.class}`
      killItem.style = boxKillStyle;
      killItem.title += `Killed: <b>${event.character}</b> (${event.faction} ${event.class})<br>Using: ${event.attackerWeapon || 'unknown'}${event.attackerVehicle ? ` (${event.attackerVehicle})` : ''}${event.headshot ? '<br>Headshot' : ''}`;
      if (characterSet.has(event.character)) {
        killItem.style += boxHightlightStyle;
        killItem.content = `⚔️ <b>${event.character}</b>'s ${event.faction} ${event.class}`;
      }
      killItem.content += `${event.attackerVehicle ? ` as ${event.attackerVehicle}` : ''}`;
      deathItems.push(killItem);
    }
    if (characterSet.has(event.character)) {
      const deathItem = {...item};
      deathItem.group = event.character;
      if (event.attacker !== event.character) deathItem.content = `💀 to ${event.attackerFaction} ${event.attackerClass}`;
      else deathItem.content = 'Suicide';
      deathItem.style = boxDeathStyle;
      deathItem.title += `Killed by: <b>${event.attacker}</b> (${event.attackerFaction} ${event.attackerClass})<br>Using: ${event.attackerWeapon || 'unknown'}${event.attackerVehicle ? ` (${event.attackerVehicle})` : ''}${event.headshot ? '<br>Headshot' : ''}`;
      if (characterSet.has(event.attacker) && event.attacker !== event.character) {
        deathItem.style += boxHightlightStyle;
        deathItem.content = `💀 to <b>${event.attacker}</b>'s ${event.attackerFaction} ${event.attackerVehicle ? ` ${event.attackerVehicle}` : ` ${event.attackerClass}`}`;
      }
      deathItems.push(deathItem);
    }
  });


  const vehicleDestroyEvents = db.prepare(
    `SELECT * FROM vehicleDestroyEvents
    WHERE (character IN (${quoteEnclosedCharacters}) OR attacker in (${quoteEnclosedCharacters}))
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}`
    ).all();
  vehicleDestroyEvents.forEach( event => {
    classCheckpoints.push({timestamp: event.timestamp, character: event.attacker, class: event.attackerClass});
    const item = {
      start: event.timestamp * 1000,
      subgroup: 'vehicleDestroy',
      type: 'box',
      title: `Continent: ${event.continent}</br>`
    }
    if (characterSet.has(event.attacker) && event.attacker !== event.character) {
      const vehicleKillItem = {...item};
      vehicleKillItem.group = event.attacker;
      vehicleKillItem.content = `Destroyed ${event.faction} ${event.vehicle}`;
      vehicleKillItem.style = boxKillStyle;
      vehicleKillItem.title += `Destroyed: ${event.faction} ${event.vehicle || 'unknown'}<br>Owner: <b>${event.character}</b><br>Using: ${event.attackerWeapon || 'unknown'}${event.attackerVehicle ? ` (${event.attackerVehicle})` : ''}`;
      if (characterSet.has(event.character)) {
        vehicleKillItem.style += boxHightlightStyle;
        vehicleKillItem.content = `Destroyed <b>${event.character}</b>'s ${event.faction} ${event.vehicle}`;
      }
      vehicleKillItem.content += `${event.attackerVehicle ? ` as ${event.attackerVehicle}` : ''}`;
      deathItems.push(vehicleKillItem);
    }
    if (characterSet.has(event.character)) {
      const vehicleLossItem = {...item};
      vehicleLossItem.group = event.character;
      vehicleLossItem.content = `Lost ${event.vehicle} to ${event.attackerFaction} ${event.attackerVehicle ? `${event.attackerVehicle}` : `${event.attackerClass}`}`;
      vehicleLossItem.style = boxDeathStyle;
      vehicleLossItem.title += `Vehicle lost: ${event.vehicle || 'unknown'}<br>Destroyed by: <b>${event.attacker}</b> (${event.attackerFaction} ${event.attackerClass})<br>Using: ${event.attackerWeapon || 'unknown'}${event.attackerVehicle ? ` (${event.attackerVehicle})` : ''}`;
      if (characterSet.has(event.attacker) && event.attacker !== event.character) {
        vehicleLossItem.style += boxHightlightStyle;
        vehicleLossItem.content = `Lost ${event.vehicle} to <b>${event.attacker}</b>'s ${event.attackerFaction} ${event.attackerVehicle ? `${event.attackerVehicle}` : `${event.attackerClass}`}`;
      }
      if (event.character === event.attacker && !event.attackerWeapon) vehicleLossItem.content = `Crashed ${event.vehicle}`;
      deathItems.push(vehicleLossItem);
    }
  });


  const experienceEvents = db.prepare(
    `SELECT id, timestamp, character, otherId, other, description, class, amount FROM experienceEvents
    WHERE character IN (${quoteEnclosedCharacters})
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
    ).all();
  const experienceItems = [];
  const eventStreaks = {};
  experienceEvents.forEach( event => {
    classCheckpoints.push({timestamp: event.timestamp, character: event.character, class: event.class});
    const char = event.character;
    // streak logic
    eventStreaks[char] = eventStreaks[char] || {};
    if (event.description in eventStreaks[char]) {
      const streak = eventStreaks[char][event.description];
      // continue streak
      if (event.timestamp - streak.end < 10) {
        eventStreaks[char][event.description].end = event.timestamp;
        eventStreaks[char][event.description].count += 1;
        eventStreaks[char][event.description].amount += event.amount;
        eventStreaks[char][event.description].others.push(getOtherRepr(event.otherId, event.other));
      }
      // reset streak and add last streak as item
      else { 
        experienceItems.push(getExperienceItem(char, event.description, streak));
        eventStreaks[char][event.description] = initStreak(event);
      }
    }
    else eventStreaks[char][event.description] = initStreak(event);
  });
  Object.keys(eventStreaks).forEach( char => {
    Object.entries(eventStreaks[char]).forEach( ([eventName, streak]) => {
      experienceItems.push(getExperienceItem(char, eventName, streak));
    });
  });

  const playerSessionEvents = db.prepare(
    `SELECT * FROM playerSessionEvents
    WHERE character IN (${quoteEnclosedCharacters})
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}`
    ).all();
  const playerSessionItems = [];
  playerSessionEvents.forEach( event => {
    classCheckpoints.push({timestamp: event.timestamp, character: event.character, class: null});
    const item = {
      start: event.timestamp * 1000,
      group: event.character,
      subgroup: 'session',
      type: 'box',
      content: `${event.type === 'PlayerLogin' ? '📡 <i>Logged in to' : '💤 <i>Logged out of'} ${event.server}</i>`,
      title: `Type: ${event.type}<br>Server: ${event.server}`,
      style: 'color: #d2dcdf; background-color: #222233; border-color: #d2dcdf;'
    }
    playerSessionItems.push(item);
  });

  classCheckpoints.sort((a, b) => a.timestamp - b.timestamp);
  const classPlaytime = {};
  classCheckpoints.forEach( checkpoint => {
    char = checkpoint.character;
    classPlaytime[char] = classPlaytime[char] || [{class: checkpoint.class, start: checkpoint.timestamp, end: checkpoint.timestamp}];
    const lastIdx = classPlaytime[char].length - 1;
    if (classPlaytime[char][lastIdx].class !== checkpoint.class) {
      classPlaytime[char].push({class: checkpoint.class, start: checkpoint.timestamp, end: checkpoint.timestamp});
    }
    else if (checkpoint.class) {
      classPlaytime[char][lastIdx].end = checkpoint.timestamp;
    }
  });
  
  const classPlaytimeItems = [];
  Object.entries(classPlaytime).forEach( ([char, playtimes]) => {
    playtimes.forEach( playtime => {
      const secondsPlayed = playtime.end - playtime.start;
      const item = {
        group: char,
        start: playtime.start * 1000,
        end: playtime.end * 1000,
        content: `<b>${playtime.class}</b> (${Math.floor(secondsPlayed/60)}m${secondsPlayed % 60}s)`,
        type: 'background',
        style: `color: white; background-color: #282838; opacity: 0.5; border: 1px solid white;`
      }
      classPlaytimeItems.push(item);
    });
  });

  const playerFacilityEvents = db.prepare(
    `SELECT timestamp, character, type, facility, facilityId, continent FROM playerFacilityEvents
    WHERE character IN (${quoteEnclosedCharacters})
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}`
    ).all();
  const playerFacilityItems = [];
  playerFacilityEvents.forEach( event => {
    const item = {
      start: event.timestamp * 1000,
      group: event.character,
      subgroup: 'facility',
      type: 'box',
      content: `${event.type === 'PlayerFacilityCapture' ? '🚩 Captured' : '🛡️ Defended'} ${event.facility ? `<b>${event.facility}</b>`: `unknown facility ${event.facilityId}`}`,
      title: `Type: ${event.type}<br>Facility: ${event.facility}<br>Continent: ${event.continent}`,
      style: 'color: #d2dcdf; background-color: #222233; border-color: #d2dcdf;'
    }
    playerFacilityItems.push(item);
  });

  const skillAddedEvents = db.prepare(
    `SELECT * FROM skillAddedEvents
    WHERE character IN (${quoteEnclosedCharacters})
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}`
    ).all();
  const skillAddedItems = [];
  skillAddedEvents.forEach( event => {
    const item = {
      start: event.timestamp * 1000,
      group: event.character,
      subgroup: 'skillAdded',
      type: 'box',
      content: `🔓 Unlocked ${event.name}`,
      title: `Skill: ${event.name}<br>Skill line: ${event.skillLine}<br>Skill points: ${event.skillPoints}`,
      style:  'color: #d2dcdf; background-color: #222233; border-color: #d2dcdf;'
    }
    skillAddedItems.push(item);
  });

  const itemAddedEvents = db.prepare(
    `SELECT * FROM itemAddedEvents
    WHERE character IN (${quoteEnclosedCharacters})
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}`
    ).all();
  const itemAddedItems = [];
  itemAddedEvents.forEach( event => {
    const unlockedItem = itemMap[event.itemId];
    const parentItems = unlockedItem.parentItems.map(item=>itemMap[item].name);
    const item = {
      start: event.timestamp * 1000,
      group: event.character,
      subgroup: 'itemAdded',
      type: 'box',
      content: `💰 Bought ${event.name}${parentItems.length > 0 ? ` for ${parentItems[0]}` : ''}`,
      title: `Item: ${event.name}<br>Type: ${event.type}<br>Category: ${event.category}<br>Skill set: ${event.skillSet}<br>Item count: ${event.itemCount}<br>Context: ${event.context}`,
      style:  'color: #d2dcdf; background-color: #222233; border-color: #d2dcdf;'
    }
    if (unlockedItem.classes.length > 0) item.title += `<br>For: ${unlockedItem.classes.join(', ')}`;
    itemAddedItems.push(item);
  });

  const items = [
    ...deathItems, 
    ...vehicleDestroyItems, 
    ...experienceItems, 
    ...classPlaytimeItems, 
    ...playerFacilityItems, 
    ...playerSessionItems,
    ...skillAddedItems,
    ...itemAddedItems
  ];
  const groups = characters.map( char => {
     return { 
      id: char,
      subgroupStack: {
        'death': false,
        'vehicleDestroy': false,
        'experience': true
      }
    }
  });
  //console.log(experienceItems)
  /* experienceItems.forEach( i=> {
    console.log(i.title)
  }) */
  return [items, groups]
}

const generateTimeline = async (characters, startTime, length) => {
  assertValidDateFormat(startTime);
  //YY-MM-DD hh:mm
  const startTimestamp = inputDateFormatToTimestamp(startTime);
  const endTimestamp = startTimestamp + length*60;
  const charCountLimit = 6;
  const charListStr = characters.length > charCountLimit 
    ? `${characters.slice(0, charCountLimit).join('-')}+${characters.length-charCountLimit}-more` 
    : characters.join('-');
  const outputFilename = `../output/timeline-${inputDateToFilenameFormat(startTime)}-${length}min-${charListStr}.html`

  const html = await fs.promises.readFile('../resources/timeline-template.html', 'utf-8');
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const [items, groups] = getTimeline(characters, startTimestamp, endTimestamp);
  const timelineElement = document.getElementById('timeline');
  timelineElement.setAttribute('items', JSON.stringify(items));
  timelineElement.setAttribute('groups', JSON.stringify(groups));

  await fs.promises.writeFile(outputFilename, dom.serialize());

  console.log(`${getDateAndTimeString(new Date())} [COMMAND] Event timeline HTML saved to ${path.resolve(outputFilename)}`);
  return outputFilename;
}

module.exports = {
  generateTimeline
}