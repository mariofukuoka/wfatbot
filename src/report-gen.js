const fs = require('fs');
const louvain = require('louvain');
const { JSDOM } = require('jsdom');
const { db } = require('./database-api');
const vehicleStatusMap = require('../api-maps/vehicle-activity-events.json');
const { 
  generalizeEmpireSpecificName, 
  assertValidDateFormat, 
  inputDateToFilenameFormat, 
  inputDateFormatToTimestamp, 
  getDateAndTimeString 
} = require('./helper-funcs');
const path = require('path');

const outputFilename = '../output/output-report.html'
// time axis bin/bucket size in seconds
const intervalLength = 60;
// tolerance in seconds for time difference between a character's death and vehicle destruction 
// events for it to count for that characte
const deathInVehicleTimeDiffTolerance = 8;

const roundToNearestMinute = timestamp => timestamp - timestamp % intervalLength;

const getInitialData = (startTimestamp, endTimestamp) => {
  const startInterval = roundToNearestMinute(startTimestamp);
  const endInterval = roundToNearestMinute(endTimestamp);
  const initialData = {};
  for (let interval = startInterval; interval <= endInterval; interval += 60) {
    initialData[interval] = 0;
  }
  return initialData;
}

const getClassesOverTimeForTeam = (startTimestamp, endTimestamp, teamTag) => {
  const events = db.prepare(
    `SELECT timestamp, character, class FROM (
      SELECT timestamp, character, class, teamId FROM experienceEvents 
      UNION
      SELECT timestamp, character, type as class, teamId FROM playerSessionEvents
      WHERE type LIKE 'PlayerLogout'
    ) AS events
    JOIN teams ON teams.teamId=events.teamId
    WHERE timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    AND teamTag LIKE '${teamTag}'
    ORDER BY timestamp ASC`
  ).all();
  return getClassesOverTime(startTimestamp, endTimestamp, events);
}

const getClassesOverTimeForCharacters = (startTimestamp, endTimestamp, characterNames) => {
  const events = db.prepare(
    `SELECT timestamp, character, class FROM (
      SELECT timestamp, character, class FROM experienceEvents 
      UNION
      SELECT timestamp, character, type as class FROM playerSessionEvents
      WHERE type LIKE 'PlayerLogout'
    ) AS events
    WHERE timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    AND LOWER(character) IN (${characterNames.map(c=>`'${c.toLowerCase()}'`)})
    ORDER BY timestamp ASC`
  ).all();
  return getClassesOverTime(startTimestamp, endTimestamp, events);
}

const getClassesOverTime = (startTimestamp, endTimestamp, events) => {
  const initialData = getInitialData(startTimestamp, endTimestamp);
  let classesOverTime = {
    'Light Assault': structuredClone(initialData),
    'Heavy Assault': structuredClone(initialData),
    'Combat Medic': structuredClone(initialData),
    'Engineer': structuredClone(initialData),
    'Infiltrator': structuredClone(initialData),
    'MAX': structuredClone(initialData),
    'Defector': structuredClone(initialData)
  };
  // last class and last timestamp per player
  const lastClass = {};
  const lastInterval = {};
  events.forEach(event => {
    const interval = roundToNearestMinute(event.timestamp); // quantize to minutes
    if (interval === lastInterval[event.character]) return;
    else if (event.class === lastClass[event.character]) return;
    else {
      if (event.class !== 'PlayerLogout') classesOverTime[event.class][interval] += 1; // increment new class unless it's a logout event case
      if (lastClass[event.character]) {
        classesOverTime[lastClass[event.character]][interval] -= 1; // decrement previous class if character had one recorded
      }
      lastInterval[event.character] = interval;
      lastClass[event.character] = (event.class !== 'PlayerLogout') ? event.class : null;
    }
  });
  for (let class_ in classesOverTime) {
    const dataPoints = [];
    let runningTotal = 0;
    Object.entries(classesOverTime[class_]).forEach(([interval, count]) => {
      runningTotal += count;
      //dataPoints.push({interval: timestampToDate(interval), count: runningTotal});
      dataPoints.push({ x: interval*1000, y: runningTotal });
    });
    classesOverTime[class_] = dataPoints;
  }
  return classesOverTime;
}

getVehiclesOverTimeForTeam = (startTimestamp, endTimestamp, teamTag) => {
  const events = db.prepare(
    `SELECT timestamp, otherId, experienceId FROM experienceEvents
    JOIN teams ON teams.teamId=experienceEvents.teamId 
    WHERE teamTag LIKE '${teamTag}'
    AND otherId % 2 = 0
    AND otherId <> 0
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  return getVehiclesOverTime(startTimestamp, endTimestamp, events);
}

getVehiclesOverTimeForCharacters = (startTimestamp, endTimestamp, characterNames) => {
  const events = db.prepare(
    `SELECT timestamp, character, otherId, experienceId FROM experienceEvents
    WHERE LOWER(character) IN (${characterNames.map(c=>`'${c.toLowerCase()}'`)})
    AND otherId % 2 = 0
    AND otherId <> 0
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  return getVehiclesOverTime(startTimestamp, endTimestamp, events);
}

const getVehiclesOverTime = (startTimestamp, endTimestamp, events) => {
  const initialData = getInitialData(startTimestamp, endTimestamp);
  const vehicles = [...new Set(Object.values(vehicleStatusMap).map(o => o.vehicle))];
  const vehiclesOverTime = vehicles.reduce((acc, vehicle) => {
    acc[vehicle] = structuredClone(initialData);
    return acc;
  }, {});
  const activeList = {}; // also maps to last active timestamp
  const destroyedList = new Set();
  events.forEach(event => {
    const interval = roundToNearestMinute(event.timestamp);
    const vehicleStatus = vehicleStatusMap[event.experienceId] || null;
    const vehicleId = event.otherId;
    if (vehicleStatus) {
      if (!(vehicleId in activeList)) {
        activeList[vehicleId] = { lastActive: interval, vehicle: vehicleStatus.vehicle };
        vehiclesOverTime[vehicleStatus.vehicle][interval] += 1;
      }
      if (vehicleStatus.status === 'destroyed' && !destroyedList.has(vehicleId)) {
        destroyedList.add(vehicleId);
        const intervalMarkedDestroyed = parseInt(interval) + intervalLength;
        if (intervalMarkedDestroyed <= endTimestamp) vehiclesOverTime[vehicleStatus.vehicle][intervalMarkedDestroyed] -= 1;
      }
    }
  });

  Object.entries(activeList).forEach(([vehicleId, activity]) => {
    if (!destroyedList.has(vehicleId)) {
      const intervalMarkedInactive = parseInt(activity.lastActive) + 2 * intervalLength;
      if (intervalMarkedInactive <= endTimestamp) vehiclesOverTime[activity.vehicle][intervalMarkedInactive] -= 1;
    }
  });

  for (let vehicle in vehiclesOverTime) {
    const dataPoints = [];
    let runningTotal = 0;
    Object.entries(vehiclesOverTime[vehicle]).forEach(([interval, count]) => {
      runningTotal += count;
      //dataPoints.push({interval: timestampToDate(interval), count: runningTotal});
      dataPoints.push({ x: interval*1000, y: runningTotal });
    });
    vehiclesOverTime[vehicle] = dataPoints;
  }
  return vehiclesOverTime;
}

const getVehicleType = (vehicle) => {
  return {
    'Flash': 'Ground Vehicle',
    'Harasser': 'Ground Vehicle',
    'Sunderer': 'Ground Vehicle',
    'MBT': 'Ground Vehicle',
    'ESF': 'Aircraft',
    'Liberator': 'Aircraft',
    'Galaxy': 'Aircraft'
  } [vehicle] || 'Infantry';
}

const getInteractionType = (attackerVehicle, victimVehicle) => {
  const typePriority = {
    'Infantry': 1,
    'Ground Vehicle': 2,
    'Aircraft': 3,
  };
  return [getVehicleType(attackerVehicle), getVehicleType(victimVehicle)].sort((a, b) => typePriority[a] - typePriority[b]).join(' vs ');
}

const getInteractionsOverTimeForTeam = (startTimestamp, endTimestamp, teamTag) => {
  const events = db.prepare(
    `SELECT timestamp, attackerVehicle, vehicle, character, type FROM (
      SELECT timestamp, attackerVehicle, vehicle, character, attackerTeamId, teamId, 'VehicleDestroy' AS type FROM vehicleDestroyEvents
      UNION
      SELECT timestamp, attackerVehicle, NULL AS vehicle, character, attackerTeamId, teamId, 'Death' as type FROM deathEvents
    ) AS events
    JOIN teams t1 ON t1.teamId=events.teamId
    JOIN teams t2 ON t2.teamId=events.attackerTeamId
    WHERE (t1.teamTag LIKE '${teamTag}' OR t2.teamTag LIKE '${teamTag}')
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  return getInteractionsOverTime(startTimestamp, endTimestamp, events);
}

const getInteractionsOverTimeForCharacters = (startTimestamp, endTimestamp, characterNames) => {
  const quoteEnclosedCharacterNames = characterNames.map(c=>`'${c.toLowerCase()}'`);
  const events = db.prepare(
    `SELECT timestamp, attackerVehicle, vehicle, character, type FROM (
      SELECT timestamp, attackerVehicle, vehicle, character, attacker, 'VehicleDestroy' AS type FROM vehicleDestroyEvents
      UNION
      SELECT timestamp, attackerVehicle, NULL AS vehicle, character, attacker, 'Death' as type FROM deathEvents
    ) AS events
    WHERE (LOWER(attacker) IN (${quoteEnclosedCharacterNames}) OR LOWER(character) IN (${quoteEnclosedCharacterNames}))
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  return getInteractionsOverTime(startTimestamp, endTimestamp, events);
}

const getInteractionsOverTime = (startTimestamp, endTimestamp, events) => {
  const initialData = getInitialData(startTimestamp, endTimestamp);
  const interactionsOverTime = {
    'Infantry vs Infantry': structuredClone(initialData),
    'Infantry vs Ground Vehicle': structuredClone(initialData),
    'Infantry vs Aircraft': structuredClone(initialData),
    'Ground Vehicle vs Ground Vehicle': structuredClone(initialData),
    'Ground Vehicle vs Aircraft': structuredClone(initialData),
    'Aircraft vs Aircraft': structuredClone(initialData)
  }
  lastEventTimestamp = {};
  events.forEach(event => {
    const interval = roundToNearestMinute(event.timestamp);
    const interactionType = getInteractionType( generalizeEmpireSpecificName(event.attackerVehicle), generalizeEmpireSpecificName(event.vehicle));
    lastEventTimestamp[event.character] = lastEventTimestamp[event.character] || {};
    lastCharTimestamp = lastEventTimestamp[event.character];
    lastCharTimestamp[event.type] = event.timestamp;
    if (event.type === 'Death') lastCharTimestamp.interactionType = interactionType;
    if (Math.abs(lastCharTimestamp['Death'] - lastCharTimestamp['VehicleDestroy']) < deathInVehicleTimeDiffTolerance) { //seconds between
      interactionsOverTime[lastCharTimestamp.interactionType][roundToNearestMinute(lastCharTimestamp['Death'])] -= 1;
    }
    interactionsOverTime[interactionType][interval] += 1;
  })

  for (let interaction in interactionsOverTime) {
    const dataPoints = [];
    Object.entries(interactionsOverTime[interaction]).forEach(([interval, count]) => {
      //dataPoints.push({interval: timestampToDate(interval), count: count});
      dataPoints.push({ x: interval*1000, y: count });
    });
    interactionsOverTime[interaction] = dataPoints;
  }
  return interactionsOverTime;
}
const getNodesAndEdgesForTeam = (startTimestamp, endTimestamp, teamTag) => {
  const events = db.prepare(
    `SELECT timestamp, character, faction, other, experienceId, description, amount FROM experienceEvents
    JOIN teams t1 ON t1.teamId=experienceEvents.teamId
    JOIN teams t2 ON t2.teamId=experienceEvents.otherTeamId
    WHERE otherId % 2 = 1
    AND (t1.teamTag LIKE '${teamTag}' OR t2.teamTag LIKE '${teamTag}')
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  return getNodesAndEdges(startTimestamp, endTimestamp, events);
}

const getNodesAndEdgesForCharacters = (startTimestamp, endTimestamp, characterNames) => {
  const quoteEnclosedCharacterNames = characterNames.map(c=>`'${c.toLowerCase()}'`);
  const events = db.prepare(
    `SELECT timestamp, character, faction, other, experienceId, description, amount FROM experienceEvents
    WHERE otherId % 2 = 1
    AND (LOWER(character) IN (${quoteEnclosedCharacterNames}) OR LOWER(other) IN (${quoteEnclosedCharacterNames}))
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  return getNodesAndEdges(startTimestamp, endTimestamp, events);
}
const getNodesAndEdges = (startTimestamp, endTimestamp, events) => {
  const squadExperiencesSet = new Set([
    '51', '53', '55', '56', '142', '439'
  ]);
  const interactions = {'squad': {}, 'other': {}};
  const characterFactions = {};
  events.forEach( event => {
    if (event.character === event.other) return;
    const type = (squadExperiencesSet.has(event.experienceId)) ? 'squad' : 'other';
    //if (type === 'other') return;
    interactions[type][event.character] = interactions[type][event.character] || {};
    interactions[type][event.character][event.other] = interactions[type][event.character][event.other] || {};
    interactions[type][event.character][event.other][event.description] = 
      interactions[type][event.character][event.other][event.description] + event.amount || event.amount;
    characterFactions[event.character] = event.faction;
  });

  //console.log(interactions);
  const uniqueCharacters = Object.keys(characterFactions);
  const squadEdges = [];
  const otherEdges = [];
  //const visited = new Set();
  uniqueCharacters.forEach( character1 => {
    uniqueCharacters.forEach( character2 => {
      Object.keys(interactions).forEach( type => {
        //
        const charPairInteractions = interactions[type][character1]?.[character2] || {}
        if (Object.keys(charPairInteractions).length > 0) {
          //console.log(type === 'squad')
          const totalXp = Object.values(charPairInteractions).reduce((sum, currVal) => sum + currVal, 0);
          const sorted = Object.entries(charPairInteractions).sort((e1, e2) => e2[1] - e1[1]);
          //console.log(charPairInteractions)
          const edge = {
            from: character1,
            to: character2,
            value: totalXp,
            label: `${sorted[0][0]}`,
            title: `[${character1}] => [${character2}]\nTotal XP (${type}): ${totalXp}\n${sorted.map( e => `- ${e[0]}: ${e[1]}`).join('\n')}`,
            hidden: type === 'other',
            physics: type !== 'other',
            interactionType: type
          };
          if (type === 'squad') {
            edge.color = 'rgb(44, 149, 44)';
            squadEdges.push(edge);
          }
          else otherEdges.push(edge);
        }
      });
    });
    //visited.add(character1);
  });
  //console.log(edges)
  const nodes = uniqueCharacters.map( character => { return {id: character, label: character} });
  return [nodes, squadEdges, otherEdges, characterFactions];
}

const randomColorStr = (faction) => {
  const randChannelVal = (min, max) => min + Math.floor(Math.random() * (max - min));
  let temp = null;
  switch(faction) {
    case 'VS':
      temp = randChannelVal(120, 210);
      return `rgb(${temp}, ${randChannelVal(40, 80)}, ${temp})`;
    case 'TR':
      temp = randChannelVal(40, 80);
      return `rgb(${randChannelVal(120, 210)}, ${temp}, ${temp})`;
    case 'NC':
      temp = randChannelVal(40, 80);
      return `rgb(${temp}, ${temp}, ${randChannelVal(120, 210)})`;
    default:
      temp = randChannelVal(80, 190);
      return `rgb(${temp}, ${temp}, ${temp})`;
  }
}

const getLouvainNodeFormat = nodeData => nodeData.map( n => n.id );

const getLouvainEdgeFormat = (edgeData) => {
  const louvainEdgeData = [];
  for (e of edgeData) {
    louvainEdgeData.push({source: e.from, target: e.to, weight: e.value})
  }
  return louvainEdgeData;
}

const getLouvainParsedNodesAndEdges = (nodeData, edgeData, otherEdgeData, characterFactions) => {
  const louvainNodeData = getLouvainNodeFormat(nodeData);
  const louvainEdgeData = getLouvainEdgeFormat(edgeData);
  let community = louvain.jLouvain().nodes(louvainNodeData).edges(louvainEdgeData);
  let result  = community() || {};
  colorMap = {};
  nsoCommunities = new Set();
  Object.entries(result).forEach( ([char, community]) => {
    if (!(community in colorMap) && characterFactions[char] !== 'NSO' && characterFactions[char]) {
      colorMap[community] = randomColorStr(characterFactions[char]);
    } else nsoCommunities.add(community);
  });
  
  Array.from(nsoCommunities).forEach( community => {
    if (!(community in colorMap)) colorMap[community] = randomColorStr('NSO');
  })
  
  Object.values(result).forEach( (community, idx) => {
    nodeData[idx].group = community;
    nodeData[idx].color = colorMap[community];
  });
  
  const nodeMap = nodeData.reduce( (total, curr) => {
    total[curr.id] = curr;
    return total;
  }, {});
  
  edgeData.forEach( edge => {
    if (nodeMap[edge.from].group !== nodeMap[edge.to].group) edge.dashes = true;
  });
  return [nodeData, [...edgeData, ...otherEdgeData]];
}

const generateReportForTeam = async (teamTag, startTime, length) => {
  assertValidDateFormat(startTime);
  const startTimestamp = inputDateFormatToTimestamp(startTime);
  const endTimestamp = startTimestamp + length*60;
  const outputFilename = `../output/session-report-${inputDateToFilenameFormat(startTime)}-${length}min-${teamTag}.html`;
  return generateReport(
    outputFilename,
    getClassesOverTimeForTeam(startTimestamp, endTimestamp, teamTag),
    getVehiclesOverTimeForTeam(startTimestamp, endTimestamp, teamTag),
    getInteractionsOverTimeForTeam(startTimestamp, endTimestamp, teamTag),
    getNodesAndEdgesForTeam(startTimestamp, endTimestamp, teamTag)
  );
}

const generateReportForCharacters = async (characterNames, startTime, length) => {
  const startTimestamp = inputDateFormatToTimestamp(startTime);
  const endTimestamp = startTimestamp + length*60;
  const charCountLimit = 6;
  const charListStr = characterNames.length > charCountLimit 
    ? `${characterNames.slice(0, charCountLimit).join('-')}-and-${characterNames.length-charCountLimit}-more` 
    : characterNames.join('-');
  const outputFilename = path.resolve(`../output/session-report-${inputDateToFilenameFormat(startTime)}-${length}min-${charListStr}.html`);
  return generateReport(
    outputFilename,
    getClassesOverTimeForCharacters(startTimestamp, endTimestamp, characterNames),
    getVehiclesOverTimeForCharacters(startTimestamp, endTimestamp, characterNames),
    getInteractionsOverTimeForCharacters(startTimestamp, endTimestamp, characterNames),
    getNodesAndEdgesForCharacters(startTimestamp, endTimestamp, characterNames)
  );
}

const generateReport = async (outputFilename, classesOverTime, vehiclesOverTime, interactionsOverTime, nodeGraphObj, startTime, length) => {
  const html = await fs.promises.readFile('../resources/report-template.html', 'utf-8');
  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (let [elementId, chartData] of [
    ['classesOverTimeChart', classesOverTime],
    ['vehiclesOverTimeChart', vehiclesOverTime],
    ['interactionsOverTimeChart', interactionsOverTime]
  ]) {
    const chartElement = document.getElementById(elementId);
    datasets = [];
    for (let key in chartData) {
      datasets.push({
        label: key,
        data: chartData[key],
        fill: 'stack'
      });
    }
    chartElement.setAttribute('data', JSON.stringify(datasets));
  }
  const [ nodeData, edgeData, otherEdgeData, characterFactions ] = nodeGraphObj;
  const [nodes, edges] = getLouvainParsedNodesAndEdges(nodeData, edgeData, otherEdgeData, characterFactions);
  const graphElement = document.getElementById('characterInteractionGraph');
  graphElement.setAttribute('nodes', JSON.stringify(nodes));
  graphElement.setAttribute('edges', JSON.stringify(edges));

  await fs.promises.writeFile(outputFilename, dom.serialize());

  console.log(`${getDateAndTimeString(new Date())} [COMMAND] Session report HTML saved to ${outputFilename}`);
  return outputFilename;
};


//generateReport(0, Number.MAX_SAFE_INTEGER);

module.exports = {
  generateReportForCharacters,
  generateReportForTeam
}