const itemMap = require('../api-maps/item-map.json');

// valid character ids are odd, npc ids are even
const charIdIsValid = characterId => characterId.slice(-1) % 2 === 1

const timestampToDate = timestamp => {
  const date = new Date(timestamp * 1000)
  const formattedDate = date.toLocaleString('ja-JP', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false 
  });
  return formattedDate;
}


const randomColorStr = () => {
  let randChannelVal = () => {
    return Math.floor(Math.random() * 256);
  }
  return `rgba(${randChannelVal()}, ${randChannelVal()}, ${randChannelVal()}, 0.5)`;
}

function generalizeEmpireSpecificName(vehicleName) {
  return specificToGeneral = {
    'Scythe': 'ESF',
    'Mosquito': 'ESF',
    'Reaver': 'ESF',
    'Magrider': 'MBT',
    'Prowler': 'MBT',
    'Vanguard': 'MBT'
  }[vehicleName] || vehicleName;
}

module.exports = {
    timestampToDate,
    charIdIsValid,
    randomColorStr,
    generalizeEmpireSpecificName
}