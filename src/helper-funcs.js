const itemMap = require('../api-maps/item-map.json');

// valid character ids are odd, npc ids are even
const charIdIsValid = characterId => characterId.slice(-1) % 2 === 1

const timestampToInputDateFormat = timestamp => {
  // in: timestamp in sec
  // out: YY-MM-DD hh:mm
  const dateStr = new Date(timestamp*1000).toJSON();
  console.log(dateStr)
  const formattedDateStr = `${dateStr.slice(2, 10)} ${dateStr.slice(11, 16)}`;
  return formattedDateStr;
}

const inputDateToFilenameFormat = dateStr => {
  // in: YY-MM-DD hh:mm
  // out: YYMMDDhhmm
  return dateStr.split(/[-:]/).join('').replace(' ','-');
}

const inputDateFormatToTimestamp = dateStr => {
  const [year, month, day, hour, minute] = dateStr.split(/[- :]/).map(str=>parseInt(str));
  //console.log(`year:${year} month:${month} day:${day} hour:${hour} minute:${minute}`);
  const timestamp = parseInt(Date.UTC(2000+year, month - 1, day, hour, minute)/1000);
  return timestamp;
}

class InvalidDateFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidDateFormatError';
  }
}

const assertValidDateFormat = dateString => {
  const dateFormat = /^(\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\s([01]\d|2[0-3]):([0-5]\d)$/;
  if (!dateFormat.test(dateString)) throw new InvalidDateFormatError(`"${dateString}" is not a valid date format`);
}

const timestampToDate = timestamp => {
  // in: timestamp in sec
  // out: YYYY-MM-DD hh:mm:ss
  const dateStr = new Date(timestamp*1000).toJSON();
  const formattedDateStr = `${dateStr.slice(0, 10)} ${dateStr.slice(11, 19)}`;
  return formattedDateStr;
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
    generalizeEmpireSpecificName,
    InvalidDateFormatError,
    assertValidDateFormat,
    timestampToInputDateFormat,
    inputDateFormatToTimestamp,
    inputDateToFilenameFormat
}