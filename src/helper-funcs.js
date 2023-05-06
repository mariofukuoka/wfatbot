
const fs = require('fs');
const { basename } = require('path');

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class FileTooBigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileTooBigError';
  }
}

const getFileSizeInMb = async filePath => {
  const stats = await fs.promises.stat(filePath);
  return stats.size / (1024*1024);
}

const discordFileSizeLimit = 8; //mb
const assertFileSizeWithinDiscordLimit = async filePath => {
  const sizeMb = await getFileSizeInMb(filePath)
  if (sizeMb > discordFileSizeLimit) throw new FileTooBigError(`${basename(filePath)} (${sizeMb.toFixed(2)}mb) is over the discord file size limit of ${discordFileSizeLimit}`);
}

class InvalidInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

const sanitizedWord = /^[a-zA-Z0-9]*$/;
const isSanitized = word => {
  return /^[a-zA-Z0-9]*$/.test(word);
}
const assertSanitizedInput = (input) => {
  if (!sanitizedWord.test(input)) throw new InvalidInputError(`Invalid characters in ${input}`);
}

const sanitizedSentence = /^[a-zA-Z0-9\s.,;:'()?!]+$/i;
const assertSanitizedSentenceInput = (input) => {
  if (!sanitizedSentence.test(teamName)) throw new InvalidInputError(`Invalid characters in ${input}`);
}

const psbCharNameRegex = /\w{1,4}x\w+(TR|NC|VS)/;
const insertPsbCharNameFactionVariants = psbCharNames => {
  const outputNames = new Set();
  psbCharNames.forEach(psbCharName => {
    if (psbCharNameRegex.test(psbCharName)) {
      const nameCommonPart = psbCharName.slice(0, -2);
      ['TR', 'NC', 'VS'].forEach(factionTag => outputNames.add(nameCommonPart + factionTag));
    }
    else outputNames.add(psbCharName);
  });
  return [...outputNames];
}

// valid character ids are odd, npc ids are even
const charIdIsValid = characterId => characterId.slice(-1) % 2 === 1

const getDateAndTimeString = dateObj => {
  // in: Date object
  // out: YYYY-MM-DD hh:mm:ss
  const dateStr = dateObj.toJSON();
  const formattedDateStr = `${dateStr.slice(0, 10)} ${dateStr.slice(11, 19)}`;
  return formattedDateStr;
}

const timestampToDate = timestamp => {
  // in: timestamp in sec
  // out: YYYY-MM-DD hh:mm:ss
  return getDateAndTimeString(new Date(timestamp*1000));
}

const timestampToInputDateFormat = timestamp => {
  // in: timestamp in sec
  // out: YY-MM-DD hh:mm
  const dateStr = new Date(timestamp*1000).toJSON();
  const formattedDateStr = `${dateStr.slice(2, 10)} ${dateStr.slice(11, 16)}`;
  return formattedDateStr;
}

const currDateAsFilenameFormat = () => {
  const dateStr = new Date().toJSON();
  return dateStr.slice(0, 10) + '-' + dateStr.slice(11, 16).replace(':', '');
}

const logCaughtException = (error) => {
  const dateStr = getDateAndTimeString(new Date());
  const logStr = `${dateStr} [EXCEPTION] ${error.name} ${error.message}`;
  console.log(logStr);
  console.log(error);
  return logStr;
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

const logDateFormatToTimestamp = dateStr => {
  const [year, month, day, hour, minute, second] = dateStr.split(/[- :]/).map(str=>parseInt(str));
  //console.log(`year:${year} month:${month} day:${day} hour:${hour} minute:${minute}`);
  const timestamp = parseInt(Date.UTC(year, month - 1, day, hour, minute, second)/1000);
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
    logCaughtException,
    timestampToDate,
    charIdIsValid,
    randomColorStr,
    generalizeEmpireSpecificName,
    InvalidDateFormatError,
    assertValidDateFormat,
    InvalidInputError,
    isSanitized,
    assertSanitizedInput,
    assertSanitizedSentenceInput,
    FileTooBigError,
    getFileSizeInMb,
    assertFileSizeWithinDiscordLimit,
    currDateAsFilenameFormat,
    getDateAndTimeString,
    timestampToInputDateFormat,
    inputDateFormatToTimestamp,
    inputDateToFilenameFormat,
    NotFoundError,
    logDateFormatToTimestamp,
    insertPsbCharNameFactionVariants
}