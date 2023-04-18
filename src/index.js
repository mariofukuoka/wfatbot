
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { JSDOM } = require('jsdom');
const census = require('./census-funcs')
const dbApi = require('./database-api');
const { token } = require('../config/config.json');
const fs = require('fs');
const { timestampToDate, getEventMsg, charIdIsValid } = require('./helper-funcs');
//const trackedExperienceEvents = require('../resources/tracked-experience-events.json');
const { generateReport } = require('./report-gen');
const { db } = require('./database-api');
const {
  startWebsocket,
  setCharMap,
  setTeamMap,
  getCharAndTeamMap
} = require('./event-handler');

const worldMap = require('../api-maps/world-map.json');
const commands = require('./commands');
async function asyncMain() {

  // ================================== DISCORD LISTENERS =====================================
  // Discord client
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Discord bot setup
  client.on('ready', () => {
    console.log(`Discord: Logged in as ${client.user.tag}!`);
  });

  // Command handlers
  client.on('interactionCreate', async interaction => {
    const command = commands[interaction.commandName];
    if (command) {
      if (interaction.isCommand()) await command.execute(interaction);
      else if (interaction.isAutocomplete()) await command.autocomplete(interaction);
    }
  });
  client.login(token);
  
  await startWebsocket();
}

asyncMain();