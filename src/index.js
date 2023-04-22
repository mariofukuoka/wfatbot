
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { token } = require('../config/config.json');
//const trackedExperienceEvents = require('../resources/tracked-experience-events.json');
const { startWebsocket, clearRecentStats } = require('./event-handler');
const commands = require('./commands');

const statusUpdatePeriod = 10; // minutes

async function asyncMain() {

  // ================================== DISCORD LISTENERS =====================================
  // Discord client
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Discord bot setup
  client.on('ready', () => {
    console.log(`Discord: Logged in as ${client.user.tag}!`);
    setInterval( () => {
      const recentStats = clearRecentStats();
      const now = new Date();
      const statusMsg = 
        `${recentStats.eventCount} events, ${recentStats.uniquePlayers.size} players during last ${((now.getTime()-recentStats.lastClear)/60000).toFixed(0)} min as of ${now.toTimeString()}`;
      client.user.setPresence({ activities: [{ name: statusMsg, type: ActivityType.Listening }], status: 'online' });
    }, 60000*statusUpdatePeriod);
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