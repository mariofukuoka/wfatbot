
const { JSDOM } = require('jsdom');
const { db } = require('./database-api');
const fs = require('fs');

const outputFilename = '../output/output_timeline.html'

const classColorMap = {
  'Light Assault': 'Cyan',
  'Heavy Assault': 'OrangeRed',
  'Combat Medic': 'ForestGreen',
  'Engineer': 'DeepPink',
  'Infiltrator': 'SlateBlue',
  'MAX': 'Gold',
  'Defector': 'Gray'
}

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
  return item;
}


const getTimeline = () => {
  const characters = ['BlackAdlerTR', 'judex23', 'geekFR', 'Airturret']
  /* const characters = db.prepare(
    `SELECT DISTINCT character FROM (
      SELECT DISTINCT character FROM experienceEvents
      UNION
      SELECT DISTINCT other AS character FROM experienceEvents)`
    ).all().slice(1,21).map(c=>c.character);
  console.log(characters) */
  const deathEvents = db.prepare(
    `SELECT id, timestamp, attacker, character, attackerWeapon as weapon, attackerVehicle as vehicle, isHeadshot FROM deathEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)}) OR attacker in (${characters.map(c=>`'${c}'`)})`
    ).all();
  //console.log(events);
  const deathItems = [];
  const vehicleDestroyItems = [];
  const characterSet = new Set(characters);
  deathEvents.forEach( event => {
    const item = {
      start: event.timestamp * 1000,
      subgroup: 'death',
      type: 'box'
    }
    if (characterSet.has(event.attacker)) {
      item.group = event.attacker;
      item.content = 'Kill'
      item.style = 'background-color: #25744d;'
      item.title = `Killed: <b>${event.character}</b><br>Using: ${event.weapon}${event.vehicle ? ` (${event.vehicle})` : ''}<br>Headshot: ${event.headshot == true}`;
      deathItems.push(item);
    }
    if (characterSet.has(event.character)) {
      item.group = event.character;
      item.subgroup = 'death';
      item.type = 'box';
      item.content = 'Death'
      item.style = 'background-color: IndianRed;'
      item.title = `Killed by: <b>${event.attacker}</b><br>Using: ${event.weapon}${event.vehicle ? ` (${event.vehicle})` : ''}<br>Headshot: ${event.headshot == true}`;
      deathItems.push(item);
    }
  });
  const vehicleDestroyEvents = db.prepare(
    `SELECT id, timestamp, attacker, character, attackerWeapon as weapon, attackerVehicle, vehicle FROM vehicleDestroyEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)}) OR attacker in (${characters.map(c=>`'${c}'`)})`
    ).all();
  vehicleDestroyEvents.forEach( event => {
    const item = {
      start: event.timestamp * 1000,
      subgroup: 'vehicleDestroy',
      type: 'box'
    }
    if (characterSet.has(event.attacker)) {
      item.group = event.attacker;
      item.content = 'Vehicle Kill'
      item.style = 'background-color: #25744d;'
      item.title = `Destroyed: ${event.vehicle || 'unknown'}<br>Owner: <b>${event.character}</b><br>Using: ${event.weapon || 'unknown'}${event.attackerVehicle ? ` (${event.attackerVehicle})` : ''}`;
      deathItems.push(item);
    }
    if (characterSet.has(event.character)) {
      item.group = event.character;
      item.content = 'Vehicle Lost'
      item.style = 'background-color: IndianRed;'
      item.title = `Vehicle lost: ${event.vehicle || 'unknown'}<br>Destroyed by: <b>${event.attacker}</b><br>Using: ${event.weapon || 'unknown'}${event.attackerVehicle ? ` (${event.attackerVehicle})` : ''}`;
      deathItems.push(item);
    }
  });
  const experienceEvents = db.prepare(
    `SELECT id, timestamp, character, otherId, other, description, class, amount FROM experienceEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)})
    ORDER BY timestamp ASC`
    ).all();
  const experienceItems = [];
  const eventStreaks = {};
  const classPlaytime = {};
  let lastEventTimestamp = null;
  experienceEvents.forEach( event => {
    const char = event.character;
    // class playtime logic
    classPlaytime[char] = classPlaytime[char] || [{class: event.class, start: event.timestamp, end: event.timestamp}];
    const lastIdx = classPlaytime[char].length - 1;
    classPlaytime[char][lastIdx].end = event.timestamp;
    if (classPlaytime[char][lastIdx].class !== event.class) {
      classPlaytime[char].push({class: event.class, start: event.timestamp, end: event.timestamp})
    }
    lastEventTimestamp = event.timestamp;

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
  
  const classPlaytimeItems = [];
  Object.entries(classPlaytime).forEach( ([char, playtimes]) => {
    playtimes.forEach( playtime => {
      const item = {
        group: char,
        start: playtime.start * 1000,
        end: playtime.end * 1000,
        content: playtime.class,
        type: 'background',
        style: `color: white; background-color: black; opacity: 0.5; border: 1px solid white;`
      }
      classPlaytimeItems.push(item);
    });
  });
  const items = [...deathItems, ...vehicleDestroyItems, ...experienceItems, ...classPlaytimeItems]
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

const generateReport = () => {
  fs.readFile('../resources/timeline-template.html', 'utf-8', (err, html) => {
    if (err) throw err;
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const [items, groups] = getTimeline();
    const timelineElement = document.getElementById('timeline');
    timelineElement.setAttribute('items', JSON.stringify(items));
    timelineElement.setAttribute('groups', JSON.stringify(groups));

    fs.writeFile(outputFilename, dom.serialize(), (err) => {
      if (err) throw err;
      console.log(`HTML saved to ${outputFilename}`);
    });
  });
  return outputFilename;
}

generateReport()