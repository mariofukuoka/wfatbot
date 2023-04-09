let louvain = require('louvain');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { db } = require('./database-api');

const getNodesAndEdgesFromEvents = (startTimestamp, endTimestamp) => {
  squadExperiencesList = [
    51, 53, 55, 56, 142, 439
  ];
  const events = db.prepare(
    `SELECT timestamp, character, faction, other, description, amount FROM experienceEvents
    WHERE experienceId IN (${squadExperiencesList})
    AND other IS NOT NULL
    AND timestamp BETWEEN ${startTimestamp} AND ${endTimestamp}
    ORDER BY timestamp ASC`
  ).all();
  console.log(events.length)
  const squadInteractions = {};
  const characterFactions = {};
  events.forEach( event => {
    if (event.character === event.other) return;
    squadInteractions[event.character] = squadInteractions[event.character] || {};
    squadInteractions[event.character][event.other] = squadInteractions[event.character][event.other] || {};
    squadInteractions[event.character][event.other][event.description] = 
      squadInteractions[event.character][event.other][event.description] + event.amount || event.amount;
    characterFactions[event.character] = event.faction;
    characterFactions[event.other] = event.faction;
  });
  
  
  console.log(squadInteractions);
  const uniqueCharacters = Object.keys(characterFactions);
  const edges = [];
  //const visited = new Set();
  uniqueCharacters.forEach( character1 => {
    uniqueCharacters.forEach( character2 => {
      const totalInteractions = squadInteractions[character1]?.[character2] || {}
      if (Object.keys(totalInteractions).length === 0) return;
      const totalInteractionCount = Object.values(totalInteractions).reduce((sum, currVal) => sum + currVal, 0);
      const sortedInteractions = Object.entries(totalInteractions).sort((e1, e2) => e2[1] - e1[1]);
      console.log(totalInteractions)
      edges.push({
        from: character1,
        to: character2,
        value: totalInteractionCount,
        label: `${sortedInteractions[0][0]}`,
        title: `Total ${totalInteractionCount}xp:\n${sortedInteractions.map( e => `- ${e[0]} ${e[1]}xp`).join('\n')}`
      });
    });
    //visited.add(character1);
  });
  const nodes = uniqueCharacters.map( character => { return {id: character, label: character} });
  return [nodes, edges, characterFactions];
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

const outputFilename = '../output/output-graph.html';

const generateGraph = (nodes, edges) => {
  fs.readFile('../resources/graph-template.html', 'utf-8', (err, html) => {
    if (err) throw err;

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const element = document.getElementById('mynetwork');
    element.setAttribute('nodes', JSON.stringify(nodes));
    element.setAttribute('edges', JSON.stringify(edges));
    
    fs.writeFile(outputFilename, dom.serialize(), (err) => {
      if (err) throw err;
      console.log(`HTML saved to ${outputFilename}`);
    });
  });
  return outputFilename;
}

const getLouvainNodeFormat = nodeData => nodeData.map( n => n.id );

const getLouvainEdgeFormat = (edgeData) => {
  const louvainEdgeData = [];
  for (e of edgeData) {
    louvainEdgeData.push({source: e.from, target: e.to, weight: e.value})
  }
  return louvainEdgeData;
}


const [nodeData, edgeData, characterFactions] = getNodesAndEdgesFromEvents(1680737888,1680748652);
const louvainNodeData = getLouvainNodeFormat(nodeData);
const louvainEdgeData = getLouvainEdgeFormat(edgeData);
let community = louvain.jLouvain().nodes(louvainNodeData).edges(louvainEdgeData);
let result  = community();
console.log(result);
/* count = Math.max(...Object.values(result)) + 1;
console.log('groups:', count);
colors = [];
for (let i = 0; i < count; i++) {
  colors.push(randomColorStr());
} */
colorMap = {};
nsoCommunities = new Set();
Object.entries(result).forEach( ([char, community]) => {
  if (!(community in colorMap) && characterFactions[char] !== 'NSO') {
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

console.log(edgeData);

generateGraph(nodeData, edgeData);

