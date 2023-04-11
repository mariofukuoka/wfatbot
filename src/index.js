
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { JSDOM } = require('jsdom');
const census = require('./census-funcs')
const dbApi = require('./database-api');
const { token } = require('../config/config.json');
const fs = require('fs');
const { timestampToDate, getEventMsg, charIdIsValid } = require('./helper-funcs');
//const trackedExperienceEvents = require('../resources/tracked-experience-events.json');
const { generateReport } = require('./report-gen');
const {
  startWebsocket,
  setCharMap,
  handleDeathPayload,
  handleVehicleDestroyPayload,
  handleExperiencePayload,
  handlePlayerFacilityPayload,
  handleSkillAddedPayload,
  handleItemAddedPayload,
  handlePlayerSessionPayload
} = require('./event-handler');

const worldMap = require('../api-maps/world-map.json');

// sometimes bot sends 0kb file, why?

var trackedServer = process.argv.slice(2)[0];
console.log(`tracked outfit: ${trackedServer}`);
//var trackedOutfit = process.argv.slice(2)[0];
//console.log(`tracked outfit: ${trackedOutfit}`);
//var trackedPlayers = process.argv.slice(2);
//console.log(`tracked players: ${trackedPlayers}`);
async function asyncMain() {
  //let charMap = await census.getCharacterMap(trackedPlayers);
  //const charMap = await census.getCharacterMap(await census.getMemberNames(trackedOutfit))
  setCharMap({});
  console.log('Census: promises resolved!');
  const trackedIds = new Set(Object.keys(charMap));
  console.log(`tracked id count: ${trackedIds.size}`);

  // ================================== DISCORD LISTENERS =====================================
  // Discord client
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Discord bot setup
  client.on('ready', () => {
    console.log(`Discord: Logged in as ${client.user.tag}!`);
  });

  // Command handlers
  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
    if (commandName === 'ping') {
      await interaction.reply('Pong!');
    } else if (commandName === 'debug') {
      generateReport(0, Number.MAX_SAFE_INTEGER);
      console.log(outputFilename);
      await interaction.reply({ files: [outputFilename]})
    }
  });
  client.login(token);

  const worldName = Object.entries(worldMap).reduce((acc, [k, v]) => { if (v === trackedServer) acc = k; return acc; }, '');

  // =============================== WEBSOCKET ===================================
  subscription = {
    service: 'event',
    action: 'subscribe',
    characters: ['all'], //Array.from(trackedIds),
    worlds: [worldName],
    eventNames: [      
      //...trackedExperienceEvents,
      'GainExperience',
      'Death', 
      'VehicleDestroy', 
      'PlayerFacilityCapture',
      'PlayerFacilityDefend',
      'ItemAdded',
      'SkillAdded',
      'PlayerLogin',
      'PlayerLogout'
    ],
    logicalAndCharactersWithWorlds:true
  }
  startWebsocket(subscription);
}

asyncMain();