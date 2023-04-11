
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

const getTimeline = () => {
  const characters = ['BlackAdlerTR', 'judex23', 'geekFR']
  const events = db.prepare(
    `SELECT id, timestamp, attacker, character, attackerWeapon as weapon, attackerVehicle as vehicle, isHeadshot FROM deathEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)}) OR attacker in (${characters.map(c=>`'${c}'`)})
    ORDER BY timestamp ASC`
    ).all();
  //console.log(events);
  const deathItems = [];
  const characterSet = new Set(characters);
  events.forEach( event => {
    const item = {
      start: event.timestamp * 1000
    }
    if (characterSet.has(event.attacker)) {
      item.group = event.attacker;
      item.subgroup = 'kill/death';
      item.type = 'box';
      item.content = 'Kill'
      item.style = 'background-color: MediumSeaGreen;'
      item.title = `Killed: <b>${event.character}</b><br>Using: ${event.weapon}${event.vehicle ? ` (${event.vehicle})` : ''}<br>Headshot: ${event.headshot == true}`;
      deathItems.push(item);
    }
    if (characterSet.has(event.character)) {
      item.group = event.character;
      item.subgroup = 'kill/death';
      item.type = 'box';
      item.content = 'Death'
      item.style = 'background-color: IndianRed;'
      item.title = `Killed by: <b>${event.attacker}</b><br>Using: ${event.weapon}${event.vehicle ? ` (${event.vehicle})` : ''}<br>Headshot: ${event.headshot == true}`;
      deathItems.push(item);
    }
  });
  const experienceEvents = db.prepare(
    `SELECT id, timestamp, character, other, description, class, amount, experienceId FROM experienceEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)})
    ORDER BY timestamp ASC`
    ).all();
  const experienceItems = [];
  const eventStreaks = {};
  const classPlaytime = {};
  let lastEventTimestamp = null;

  const initStreak = (event) => {
    return {
      id: event.id,
      start: event.timestamp,
      end: event.timestamp,
      count: 1,
      amount: event.amount,
      others: event.other ? [event.other] : [],
      experienceId: event.experienceId
    }
  };

  experienceEvents.forEach( event => {
    const char = event.character;
    // class playtime logic
    classPlaytime[char] = classPlaytime[char] || [{class: event.class, start: event.timestamp}];
    const lastIdx = classPlaytime[char].length - 1;
    classPlaytime[char][lastIdx].end = event.timestamp;
    if (classPlaytime[char][lastIdx].class !== event.class) {
      classPlaytime[char].push({class: event.class, start: event.timestamp})
    }
    lastEventTimestamp = event.timestamp;

    // streak logic
    eventStreaks[char] = eventStreaks[char] || {};
    if (event.description in eventStreaks[char]) {
      const streak = eventStreaks[char][event.description];
      // continue streak
      if (event.timestamp - streak.end < 5) {
        eventStreaks[char][event.description].end = event.timestamp;
        eventStreaks[char][event.description].count += 1;
        eventStreaks[char][event.description].amount += event.amount;
        if (event.other) eventStreaks[char][event.description].others.push(event.other);
      }
      // reset streak and add last streak as item
      else { 
        const item = {
          start: streak.start * 1000,
          id: streak.id,
          group: char,
          content: event.description,
          subgroup: event.experienceId,
          title: `Other: ${streak.others.join(', ')}<br>XP: ${streak.amount}`,
        }
        if (streak.start !== streak.end) { 
          item.end = streak.end * 1000;
          item.content += ` (x${streak.count})`
          item.title += ` from ${streak.count} events over ${streak.end - streak.start} seconds`
          //item.type = 'range';
        }
        experienceItems.push(item);
        eventStreaks[char][event.description] = initStreak(event);
      }
    }
    else {
      eventStreaks[char][event.description] = initStreak(event);
      
    }
  });
  Object.keys(eventStreaks).forEach( char => {
    Object.entries(eventStreaks[char]).forEach( ([eventName, streak]) => {
      const item = {
        id: streak.id,
        group: char,
        content: eventName,
        subgroup: streak.experienceId,
        start: streak.start * 1000,
        title: `Other: ${streak.others.join(', ')}<br>XP: ${streak.amount}`
      };
      if (streak.start !== streak.end) {
        item.end = streak.end * 1000;
        item.content += ` (x${streak.count})`;
        item.title += ` from ${streak.count} events over ${streak.end - streak.start} seconds`;
        //item.type = 'range';
      }
      experienceItems.push(item);
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
        style: `color: Black; background-color: ${classColorMap[playtime.class]}; opacity: 0.5;`
      }
      classPlaytimeItems.push(item);
    });
  });
  

  
  const items = [...deathItems, ...experienceItems, ...classPlaytimeItems]
  const groups = characters.map( char => {
     return { 
      id: char,
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