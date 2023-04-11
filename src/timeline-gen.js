
const { JSDOM } = require('jsdom');
const { db } = require('./database-api');
const fs = require('fs');

const outputFilename = '../output/output_timeline.html'

const getTimeline = () => {
  const characters = ['BlackAdlerTR', 'Fareanor']
  const events = db.prepare(
    `SELECT id, timestamp, attacker, character, attackerWeapon as weapon, attackerVehicle as vehicle, isHeadshot FROM deathEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)}) OR attacker in (${characters.map(c=>`'${c}'`)})
    ORDER BY timestamp ASC`
    ).all();
  console.log(events);
  const deathItems = [];
  const characterSet = new Set(characters);
  events.forEach( event => {
    const item = {
      start: event.timestamp * 1000
    }
    if (characterSet.has(event.attacker)) {
      item.group = event.attacker;
      item.subgroup = 'kill';
      item.type = 'box';
      item.content = 'Kill'
      item.label = `Killed ${event.character}${event.vehicle ? ` while in ${event.vehicle}` : ''} with ${event.weapon}${event.isHeadshot ? ' (headshot)' : ''}`;
      deathItems.push(item);
    }
    if (characterSet.has(event.character)) {
      item.group = event.character;
      item.subgroup = 'death';
      item.type = 'box';
      item.content = 'Death'
      item.style = 'background-color: IndianRed;'
      item.label = `Died to ${event.attacker}${event.vehicle ? `'s ${event.vehicle}` : ''} from ${event.weapon}${event.isHeadshot ? ' (headshot)' : ''}`;
      deathItems.push(item);
    }
  });
  const experienceItems = db.prepare(
    `SELECT id, timestamp * 1000 AS start, character AS 'group', description AS content, experienceId AS subgroup FROM experienceEvents
    WHERE character IN (${characters.map(c=>`'${c}'`)})
    ORDER BY timestamp ASC`
    ).all();
  
  const items = [...deathItems, ...experienceItems]
  const groups = characters.map( char => {
     return { 
      id: char,
    }
  });
  console.log(groups)
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