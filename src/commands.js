const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, addTrackedCharacter, addTrackedOutfit, addTeam } = require('./database-api');
const { getCharacterDetails, getOutfitDetails } = require('./census-funcs');
const { closeWebsocket } = require('./event-handler');
const { generateTimeline } = require('./timeline-gen');
const { generateReport } = require('./report-gen');
const { InvalidDateFormatError, assertValidDateFormat, timestampToInputDateFormat, inputDateFormatToTimestamp } = require('./helper-funcs');

const sanitizedWord = /^[a-zA-Z0-9]*$/;
const sanitizedSentence = /^[a-zA-Z0-9\s.,;:'()?!]+$/i;

class InvalidInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

const assertSanitizedInput = (input) => {
  if (!sanitizedWord.test(input)) throw new InvalidInputError(`Invalid characters in ${input}`);
}

module.exports = {
  /* debug: {
    data: new SlashCommandBuilder()
      .setName('debug')
      .setDescription('Debug command')
      .addStringOption(option =>
        option.setName('string')
              .setDescription('String option')
              .setAutocomplete(true)),
    execute: async interaction => {
      interaction.reply(interaction.options.getString('string'));
    },
    autocomplete: async interaction => {
      const vehicles = db.prepare(
        `SELECT DISTINCT vehicle AS name, vehicle AS value FROM vehicleDestroyEvents 
        WHERE vehicle IS NOT NULL`
        ).all();
      const focusedValue = interaction.options.getFocused();
      const filtered = vehicles.filter(entry=>entry.name.startsWith(focusedValue)).slice(0, 25);
      await interaction.respond(filtered); 
    }
  }, */
  track: {
    data: new SlashCommandBuilder()
      .setName('track')
      .setDescription('Add players to a team to be tracked.')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand(subcommand => 
        subcommand.setName('character')
                  .setDescription('Add tracked character to a team')
                  .addStringOption(option =>
                    option.setName('team_tag')
                          .setDescription('Team tag')
                          .setAutocomplete(true)
                          .setRequired(true))
                  .addStringOption(option =>
                    option.setName('character_names')
                          .setDescription('Character names separated by space')
                          .setRequired(true)))
      .addSubcommand(subcommand =>
        subcommand.setName('outfit')
                  .setDescription('Add tracked outfit to a team')
                  .addStringOption(option =>
                    option.setName('team_tag')
                          .setDescription('Team tag')
                          .setAutocomplete(true)
                          .setRequired(true))
                  .addStringOption(option =>
                    option.setName('outfit_tag')
                          .setDescription('Outfit tag')
                          .setRequired(true))),
    execute: async interaction => {
      await interaction.deferReply();
      const teamTag = interaction.options.getString('team_tag');
      assertSanitizedInput(teamTag);
      const teamId = db.prepare(`SELECT teamId FROM teams WHERE teamTag LIKE '${teamTag}'`).get()?.teamId;
      
      if (!teamId) {
        await interaction.editReply(`Error: no such team \`${teamTag}\``);
        return;
      }
      console.log(interaction.options.getSubcommand());
      if (interaction.options.getSubcommand() === 'character') {
        const charNames = interaction.options.getString('character_names').split(' ');
        try {
          charNames.forEach(name=>assertSanitizedInput(name));
        } catch (e) {
          console.log('Exception caught:', e.name, e.message);
          await interaction.editReply("Error: invalid input argument");
          return
        }
        const promises = [];
        charNames.forEach( charName => {
          promises.push(getCharacterDetails(charName))
        });
        let characterDetails = null;
        try {
          characterDetails = await Promise.all(promises);
        } catch (e) {
          await interaction.editReply("Error: Failed to resolve character requests");
          console.log('Exception caught:', e.name, e.message);
          return;
        }
        let msg = '';
        let failedCount = 0;
        characterDetails.forEach( cd => {
          try {
            const row = {
              characterId: cd.characterId,
              character: cd.character,
              teamId: teamId,
              faction: cd.faction,
              server: cd.server
            };
            const insertionResult = addTrackedCharacter.run(row);
            //console.log(insertionResult);
            msg += `\`${cd.outfitTag ? `[${cd.outfitTag}] ` : ''}${cd.character}\` (${cd.faction} ${cd.server}) assigned to \`${teamTag}\`\n`;
          } catch (e) {
            if (e.name === 'SqliteError' && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              msg += `\`${cd.character}\` is already assigned to a team\n`;
            }
            else {
              console.log(e.name, e.message);
              failedCount += 1;
            }
          }
        })
        if (failedCount > 0) msg += `Error: failed to resolve ${failedCount} characters`
        await interaction.editReply(msg);
      } 
      else if (interaction.options.getSubcommand() === 'outfit') {
        const outfitTag = interaction.options.getString('outfit_tag');
        try {
          assertSanitizedInput(outfitTag);
        } catch (e) {
          await interaction.editReply(`Error: invalid input argument`);
        }
        const od = await getOutfitDetails(outfitTag);
        
        try {
          if (od.memberCount > 1000) {
            await interaction.editReply(`Error: \`${od.outfitTag} - ${od.outfitName}\` (${od.faction} ${od.server}) has ${od.memberCount} members. Zergfits have too many players to track at once.`);
          }
          const row = {
            outfitId: od.outfitId,
            outfitTag: od.outfitTag,
            outfitName: od.outfitName,
            teamId: teamId,
            faction: od.faction,
            server: od.server
          };
          const insertionResult = addTrackedOutfit.run(row);
          await interaction.editReply(`\`${od.outfitTag} - ${od.outfitName}\` (${od.server} ${od.faction}) assigned to \`${teamTag}\``);
        } catch (e) {
          console.log('Exception caught:', e.name, e.message);
          if (e.name === 'SqliteError' && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            await interaction.editReply(`\`${od.outfitTag}\` is already assigned to a team`)
          } else {
            await interaction.editReply(`Error: failed to resolve/assign outfit`);
          }
        }
      } else await interaction.editReply('Error: invalid subcommand');
    },
    autocomplete: async interaction => {
      try {
        const focusedValue = interaction.options.getFocused();
        assertSanitizedInput(focusedValue);
        const teams = db.prepare(`SELECT teamTag FROM teams WHERE teamTag LIKE '${focusedValue}%' ORDER BY teamTag ASC`).all();
        const filtered = teams.slice(0, 25).map(entry => ({name: entry.teamTag, value: entry.teamTag}));
        await interaction.respond(filtered);
      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        await interaction.respond([]);
      }
    }
  },

  untrack: {
    data: new SlashCommandBuilder()
    .setName('untrack')
    .setDescription('Remove players from being tracked.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand => 
      subcommand.setName('character')
                .setDescription('Remove tracked character from team')
                .addStringOption(option =>
                  option.setName('character_name')
                        .setDescription('Character names separated by space')
                        .setRequired(true)
                        .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand.setName('outfit')
                .setDescription('Remove tracked outfit from team')
                .addStringOption(option =>
                  option.setName('outfit_tag')
                        .setDescription('Outfit tag')
                        .setRequired(true)
                        .setAutocomplete(true))),
    execute: async interaction => {
      await interaction.deferReply();
      if (interaction.options.getSubcommand() === 'character') {
        try {
          const charToRemove = interaction.options.getString('character_name');
          assertSanitizedInput(charToRemove);
          const removed = db.prepare(
            `SELECT character, teams.teamTag FROM trackedCharacters 
            INNER JOIN teams ON teams.teamId = trackedCharacters.teamId 
            WHERE character LIKE '${charToRemove}'`).get();
          const results = db.prepare(
            `DELETE FROM trackedCharacters
            WHERE character LIKE '${charToRemove}'`).run();
          if (results.changes === 1) await interaction.editReply(`Removed \`${removed.character}\` from \`${removed.teamTag}\``);
          else await interaction.editReply(`Error: no such character \`${charToRemove}\``);
        } catch (e) {
          console.log('Exception caught:', e.name, e.message);
          if (e instanceof InvalidInputError) {
            await interaction.editReply(`Error: invalid input argument`);
          } else {
            await interaction.editReply(`Error: couldn't remove character \`${charToRemove}\``);
          }
        }
      }
      else {
        try {
          const outfitToRemove = interaction.options.getString('outfit_tag');
          assertSanitizedInput(outfitToRemove);
          const removed = db.prepare(
            `SELECT outfitTag, teams.teamTag FROM trackedOutfits 
            INNER JOIN teams ON teams.teamId = trackedOutfits.teamId 
            WHERE outfitTag LIKE '${outfitToRemove}'`).get();
          const results = db.prepare(
            `DELETE FROM trackedOutfits
            WHERE outfitTag LIKE '${outfitToRemove}'`).run();
          if (results.changes === 1) await interaction.editReply(`Removed \`${removed.outfitTag}\` from \`${removed.teamTag}\``);
          else await interaction.editReply(`Error: no such outfit \`${outfitToRemove}\``);
        } catch (e) {
          console.log('Exception caught:', e.name, e.message);
          if (e instanceof InvalidInputError) {
            await interaction.editReply(`Error: invalid input argument`);
          } else {
            await interaction.editReply(`Error: couldn't remove character \`${outfitToRemove}\``);
          }
        }
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value;
        assertSanitizedInput(focusedValue);
        if (focusedOption.name === 'character_name') {
          const characters = db.prepare(
            `SELECT character, teams.teamTag FROM trackedCharacters 
            INNER JOIN teams ON teams.teamId = trackedCharacters.teamId 
            WHERE character LIKE '%${focusedValue}%'
            ORDER BY character ASC`).all();
          const filtered = characters.slice(0, 25).map(entry => ({name: `${entry.character} (${entry.teamTag})`, value: entry.character}));
          await interaction.respond(filtered);
        } else {
          const outfits = db.prepare(
            `SELECT outfitTag, teams.teamTag FROM trackedOutfits 
            INNER JOIN teams ON teams.teamId = trackedOutfits.teamId 
            WHERE outfitTag LIKE '${focusedValue}%'
            ORDER BY outfitTag ASC`).all();
          const filtered = outfits.slice(0, 25).map(entry => ({name: `${entry.outfitTag} (${entry.teamTag})`, value: entry.outfitTag}));
          await interaction.respond(filtered);
        }
      } catch {
        console.log('Exception caught:', e.name, e.message);
        await interaction.respond([]);
      }
    }
  },

  addteam: {
    data: new SlashCommandBuilder()
      .setName('addteam')
      .setDescription('Add new team')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addStringOption(option =>
        option.setName('team_tag')
              .setDescription('Team tag')
              .setRequired(true))
      .addStringOption(option =>
        option.setName('full_name')
              .setDescription('Full team name')
              .setRequired(true)),
    execute: async interaction => {
      await interaction.deferReply();
      const teamTag = interaction.options.getString('team_tag');
      const teamName = interaction.options.getString('full_name');
      try {
        assertSanitizedInput(teamTag);
        if (!sanitizedSentence.test(teamName)) throw new InvalidInputError(`team name "${teamName}" is invalid`);
        addTeam.run({teamTag: teamTag, teamName: teamName});
        await interaction.editReply(`Added \`${teamTag}\` as a team`)
      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        if (e.name === 'SqliteError' && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          await interaction.editReply(`\`${teamTag}\` already exists`)
        } else {
          await interaction.editReply(`Error: couldn't add team`)
        }
      }
    }
  },
  removeteam: {
    data: new SlashCommandBuilder()
      .setName('removeteam')
      .setDescription('Remove existing team')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addStringOption(option =>
        option.setName('team_tag')
              .setDescription('Team tag')
              .setRequired(true)
              .setAutocomplete(true)),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const teamTag = interaction.options.getString('team_tag');
        assertSanitizedInput(teamTag);
        const result = db.prepare(`DELETE FROM teams WHERE teamTag LIKE '${teamTag}'`).run();
        console.log(result);
        if (result.changes > 0) await interaction.editReply(`Removed \`${teamTag}\` from teams`);
        else await interaction.editReply(`Error: no such team \`${teamTag}\``)
      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        if (e instanceof InvalidInputError) {
          await interaction.editReply(`Error: invalid input argument`) ; 
        } else {
          await interaction.editReply(`Error: couldn't remove team`);
        }
      }
    },
    autocomplete: async interaction => {
      const focusedValue = interaction.options.getFocused();
      try {
        assertSanitizedInput(focusedValue);
        const teams = db.prepare(
          `SELECT teamTag FROM teams 
          WHERE teamTag LIKE '${focusedValue}%'
          ORDER BY teamTag ASC`).all();
        const filtered = teams.slice(0, 25).map(entry => ({name: entry.teamTag, value: entry.teamTag}));
        await interaction.respond(filtered);

      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        await interaction.respond([]);
      }
    }
  },
  teams: {
    data: new SlashCommandBuilder()
      .setName('teams')
      .setDescription('Show tracked teams')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false),
    execute: async interaction => {
      try {
        const teams = db.prepare(`SELECT teamTag, teamName FROM teams ORDER BY teamTag ASC`).all();
        const msg = `Tracked teams:\n\`\`\`${teams.map(row=>row.teamTag).join(', ') || ' '}\`\`\``
        await interaction.reply(msg);
      } catch (e) {
        await interaction.reply("Error: couldn't execute command")
      }
    }
  },
  players: {
    data: new SlashCommandBuilder()
      .setName('players')
      .setDescription('Show outfits and characters assigned to a team')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addStringOption(option => 
        option.setName('team_tag')
              .setDescription('Team tag')
              .setRequired(true)
              .setAutocomplete(true)),
    execute: async interaction => {
      try {
        const inputTeamTag = interaction.options.getString('team_tag');
        assertSanitizedInput(inputTeamTag);
        const teamTag = db.prepare(
          `SELECT teamTag FROM teams WHERE teamTag LIKE '${inputTeamTag}'`).get().teamTag;
        if (!teamTag) {
          await interaction.reply(`Error: no team called "${inputTeamTag}"`);
          return;
        }
        const outfits = db.prepare(
          `SELECT outfitTag FROM trackedOutfits 
          INNER JOIN teams ON teams.teamId = trackedOutfits.teamId 
          WHERE teamTag LIKE '${teamTag}'
          ORDER BY teamTag ASC`).all();
        const characters = db.prepare(
          `SELECT character FROM trackedCharacters 
          INNER JOIN teams ON teams.teamId = trackedCharacters.teamId 
          WHERE teamTag LIKE '${teamTag}'
          ORDER BY character ASC`).all();
        let msg = `Characters tracked in \`${teamTag}\`:\n\`\`\`${characters.map(c=>c.character).join(', ') || ' '}\`\`\`\nOutfits tracked in \`${teamTag}\`:\n\`\`\`${outfits.map(o=>o.outfitTag).join(', ') || ' '}\`\`\``;
        await interaction.reply(msg);
      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        if (e instanceof InvalidInputError) {
          await interaction.reply(`Error: invalid input argument`) ; 
        } else {
          await interaction.reply(`Error: couldn't execute command`);
        }
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedValue = interaction.options.getFocused();
        assertSanitizedInput(focusedValue);
        const teams = db.prepare(
          `SELECT teamTag FROM teams 
          WHERE teamTag LIKE '${focusedValue}%' 
          ORDER BY teamTag ASC`).all();
        const filtered = teams.slice(0, 25).map(entry => ({name: entry.teamTag, value: entry.teamTag}));
        await interaction.respond(filtered);
      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        await interaction.respond([]);
      }
    }
  },
  restart_tracking: {
    data: new SlashCommandBuilder()
      .setName('restart_tracking')
      .setDescription('Restart the websocket and update the tracked characters/outfits')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false),
    execute: async interaction => {
      closeWebsocket(); // will restart on its own
      await interaction.reply('Tracking restarted');
    }
  },
  timeline: {
    data: new SlashCommandBuilder()
      .setName('timeline')
      .setDescription('Generate event timeline for specified characters')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addStringOption(option=>
        option.setName('character_names')
              .setDescription('Character names separated by space')
              .setRequired(true)
              .setAutocomplete(true))
      .addStringOption(option=>
        option.setName('start_time')
              .setDescription('Start time in "YYMMDD HH:MM"')
              .setRequired(true)
              .setAutocomplete(true))
      .addIntegerOption(option=>
        option.setName('length')
              .setDescription('Timeline length in minutes')
              .setRequired(true)),
    execute: async interaction => {
      await interaction.deferReply();
      const charNames = interaction.options.getString('character_names').split(' ');
      try {
        charNames.forEach(name=>assertSanitizedInput(name));
        const startTime = interaction.options.getString('start_time');
        assertValidDateFormat(startTime);
        const length = interaction.options.getInteger('length');
        if (length < 0 || length > 60*24) throw new InvalidInputError(); // reject less than 0 or more than day
        const timelineFile = await generateTimeline(charNames, startTime, length);
        await interaction.editReply({content: `Event timeline for \`${charNames.join(', ')}\` starting at <t:${inputDateFormatToTimestamp(startTime)}:F> (${length} min)`, files: [timelineFile]});
      } catch (e) {
        console.log('Exception caught:', e.name, e.message);
        if (e instanceof InvalidInputError) {
          await interaction.editReply("Error: invalid input argument");
        } else if (e instanceof InvalidDateFormatError) {
          await interaction.editReply("Error: invalid date format");
        } else {
          await interaction.editReply("Error: couldn't execute function");
        }        
        return;
      }
    },
    autocomplete: async interaction => {
      const focusedOption = interaction.options.getFocused(true);
      const focusedValue = focusedOption.value;
      if (focusedOption.name === 'character_names') {
        try {
          let charNames = focusedValue.split(' ');
          //console.log(charNames);
          const charSet = new Set(charNames);
          charNames = charNames.filter(charName => sanitizedWord.test(charName));
          let charSuggestions = db.prepare(`SELECT character AS name FROM trackedCharacters WHERE character LIKE '%${charNames.at(-1)}%'`).all();
          let showNext = false;
          if (charSuggestions && charSuggestions.at(-1).name === charNames.at(-1)) {
            charSuggestions = db.prepare(`SELECT character AS name FROM trackedCharacters`).all();
            showNext = true;
          }
          let filtered = charSuggestions
            .filter(suggestion => !charSet.has(suggestion.name)) // filter duplicates
            .slice(0, 25) // trim to allowed autocomplete length
            .map(suggestion => `${[...(showNext ? charNames : charNames.slice(0, -1)), suggestion.name].join(' ')}`); // map to strings of current focusedValue + the suggestion
          filtered = filtered.map(autocompleteStr => ({name:autocompleteStr, value:autocompleteStr}));
          await interaction.respond(filtered);
        } catch (e) {
          console.log('timeline autocomplete error:', e.name, e.message);
          await interaction.respond([]);
        }
      } else if (focusedOption.name === 'start_time') {
        try {
          const charNames = interaction.options.getString('character_names').split(' ');
          charNames.forEach(c => assertSanitizedInput(c));
          console.log(charNames);
          const intervals = db.prepare(
            `SELECT CAST(timestamp/3600 AS INT)*3600 AS interval, COUNT(DISTINCT character) AS charCount 
            FROM experienceEvents WHERE character IN (${charNames.map(c=>`'${c}'`)}) GROUP BY interval ORDER BY interval DESC`).all();
          const filtered = intervals
            .slice(0, 25)
            .map(entry => ({name: `${timestampToInputDateFormat(entry.interval)} (${entry.charCount} players active)`, value: timestampToInputDateFormat(entry.interval)}));
            console.log(filtered.map(f=>f.value));
            await interaction.respond(filtered);
        } catch (e) {
          console.log(e.name, e.message);
          await interaction.respond([]);
        }
      }
    }
  },
  session_report: {
    data: new SlashCommandBuilder()
      .setName('session_report')
      .setDescription('Generate session report for specified team')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addStringOption(option=>
        option.setName('team_tag')
              .setDescription('Team tag')
              .setRequired(true)
              .setAutocomplete(true))
      .addStringOption(option=>
        option.setName('start_time')
              .setDescription('Session start time in "YYMMDD HH:MM"')
              .setRequired(true)
              .setAutocomplete(true))
      .addIntegerOption(option=>
        option.setName('length')
              .setDescription('Session length in minutes')
              .setRequired(true)),
    execute: async interaction => {
      await interaction.deferReply();
      const teamTag = interaction.options.getString('team_tag');
      try {
        assertSanitizedInput(teamTag);
        const startTime = interaction.options.getString('start_time');
        assertValidDateFormat(startTime);
        const length = interaction.options.getInteger('length');
        if (length < 0 || length > 60*24) throw new InvalidInputError(); // reject less than 0 or more than day
        const reportFile = await generateReport(teamTag, startTime, length);
        await interaction.editReply({content: `Session report for \`${teamTag}\` starting at <t:${inputDateFormatToTimestamp(startTime)}:F> (${length} min)`, files: [reportFile]});
      } catch (e) {
        console.log('Exception caught:', e.name, e.message, e);
        if (e instanceof InvalidInputError) {
          await interaction.editReply("Error: invalid input argument");
        } else if (e instanceof InvalidDateFormatError) {
          await interaction.editReply("Error: invalid date format");
        } else {
          await interaction.editReply("Error: couldn't execute function");
        }        
        return;
      }
    },
    autocomplete: async interaction => {
      const focusedOption = interaction.options.getFocused(true);
      const focusedValue = focusedOption.value;
      if (focusedOption.name === 'team_tag') {
        try {
          assertSanitizedInput(focusedValue);
          const teams = db.prepare(
            `SELECT teamTag FROM teams 
            WHERE teamTag LIKE '${focusedValue}%'
            ORDER BY teamTag ASC`).all();
          const filtered = teams.slice(0, 25).map(entry => ({name: entry.teamTag, value: entry.teamTag}));
          await interaction.respond(filtered);

        } catch (e) {
          console.log('Exception caught:', e.name, e.message);
          await interaction.respond([]);
        }
      }
      else if (focusedOption.name === 'start_time') {
        try {
          const teamTag = interaction.options.getString('team_tag');
          const intervals = db.prepare(
            `SELECT CAST(timestamp/3600 AS INT)*3600 AS interval, COUNT(DISTINCT character) AS charCount FROM 
            (SELECT timestamp, character FROM experienceEvents 
            JOIN teams ON teams.teamId=experienceEvents.teamId
            WHERE teamTag LIKE '${teamTag}'
            UNION
            SELECT timestamp, other FROM experienceEvents 
            JOIN teams ON teams.teamId=experienceEvents.otherTeamId
            WHERE teamTag LIKE '${teamTag}')
            GROUP BY interval ORDER BY interval DESC`).all();
          const filtered = intervals
            .slice(0, 25)
            .map(entry => ({name: `${timestampToInputDateFormat(entry.interval)} (${entry.charCount} players active)`, value: timestampToInputDateFormat(entry.interval)}));
            await interaction.respond(filtered);
        } catch (e) {
          console.log('Exception caught:', e.name, e.message, e);
          await interaction.respond([]);
        }
      }
    }
  }
}
