const fs = require('fs');
const louvain = require('louvain');
const { JSDOM } = require('jsdom');
const { db } = require('./database-api');
const vehicleStatusMap = require('../api-maps/vehicle-activity-events.json');
const { timestampToDate, generalizeEmpireSpecificName } = require('./helper-funcs');

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

const getClassesOverTime = (startTimestamp, endTimestamp, teamId) => {
  const events = db.prepare(
    `SELECT * FROM (
      SELECT timestamp, character, class FROM experienceEvents 
      UNION
      SELECT timestamp, character, type FROM playerSessionEvents
      WHERE type LIKE 'PlayerLogout'
    ) AS events
    WHERE timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  startTimestamp = events.at(0).timestamp;
  endTimestamp = events.at(-1).timestamp;
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
      dataPoints.push({ x: timestampToDate(interval), y: runningTotal });
    });
    classesOverTime[class_] = dataPoints;
  }
  return classesOverTime;
}

const getVehiclesOverTime = (startTimestamp, endTimestamp) => {
  const events = db.prepare(
    `SELECT timestamp, otherId, experienceId FROM experienceEvents 
    WHERE timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();

  startTimestamp = events.at(0).timestamp;
  endTimestamp = events.at(-1).timestamp;
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
      dataPoints.push({ x: timestampToDate(interval), y: runningTotal });
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

const getInteractionsOverTime = (startTimestamp, endTimestamp) => {
  const events = db.prepare(
    `SELECT * FROM (
      SELECT timestamp, attackerVehicle, vehicle, character, 'VehicleDestroy' AS type FROM vehicleDestroyEvents
      UNION
      SELECT timestamp, attackerVehicle, NULL AS vehicle, character, 'Death' as type FROM deathEvents
    ) AS events
    WHERE timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();

  startTimestamp = events.at(0).timestamp;
  endTimestamp = events.at(-1).timestamp;
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
      dataPoints.push({ x: timestampToDate(interval), y: count });
    });
    interactionsOverTime[interaction] = dataPoints;
  }
  return interactionsOverTime;
}


const getNodesAndEdgesFromEvents = (startTimestamp, endTimestamp) => {
  squadExperiencesSet = new Set([
    '51', '53', '55', '56', '142', '439'
  ]);
  const events = db.prepare(
    `SELECT timestamp, character, faction, other, experienceId, description, amount FROM experienceEvents
    WHERE otherId % 2 = 1
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  //console.log(events.length)
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

  //console.log(interactions.squad);
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

const getLouvainParsedNodesAndEdges = (startTimestamp, endTimestamp) => {
  const [nodeData, edgeData, otherEdgeData, characterFactions] = getNodesAndEdgesFromEvents(startTimestamp, endTimestamp);
  const louvainNodeData = getLouvainNodeFormat(nodeData);
  const louvainEdgeData = getLouvainEdgeFormat(edgeData);
  let community = louvain.jLouvain().nodes(louvainNodeData).edges(louvainEdgeData);
  let result  = community();
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

const generateReport = (startTimestamp, endTimestamp) => {
  fs.readFile('../resources/report-template.html', 'utf-8', (err, html) => {
    if (err) throw err;
    const dom = new JSDOM(html);
    const document = dom.window.document;
    for (let [elementId, chartData] of [
        ['classesOverTimeChart', getClassesOverTime(startTimestamp, endTimestamp)],
        ['vehiclesOverTimeChart', getVehiclesOverTime(startTimestamp, endTimestamp)],
        ['interactionsOverTimeChart', getInteractionsOverTime(startTimestamp, endTimestamp)]
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
    
    const [nodes, edges] = getLouvainParsedNodesAndEdges(startTimestamp, endTimestamp);
    const graphElement = document.getElementById('characterInteractionGraph');
    graphElement.setAttribute('nodes', JSON.stringify(nodes));
    graphElement.setAttribute('edges', JSON.stringify(edges));

    fs.writeFile(outputFilename, dom.serialize(), (err) => {
      if (err) throw err;
      console.log(`HTML saved to ${outputFilename}`);
    });
  });
  return outputFilename;
}

//generateReport(0, Number.MAX_SAFE_INTEGER);

module.exports = {
  generateReport
}