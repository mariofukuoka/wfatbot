const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { db, addTrackedCharacter, addTrackedOutfit, addTeam } = require('./database-api');
const { getCharacterDetails, getOutfitDetails, getLsCharacters } = require('./census-funcs');
const { closeWebsocket } = require('./event-handler');
const { generateTimeline } = require('./timeline-gen');
const { generateReportForCharacters, generateReportForTeam } = require('./report-gen');
const { 
  logCaughtException,
  InvalidInputError,
  NotFoundError,
  isSanitized,
  assertSanitizedInput,
  assertSanitizedSentenceInput,
  FileTooBigError,
  getFileSizeInMb,
  assertFileSizeWithinDiscordLimit,
  InvalidDateFormatError,
  currDateAsFilenameFormat, 
  assertValidDateFormat, 
  timestampToInputDateFormat, 
  inputDateFormatToTimestamp 
} = require('./helper-funcs');
const path = require('path');

const maxReportLength = 6*60;

const getNextCharNameAutocompletion = focusedValue => {
  let charNames = focusedValue.split(' ');
  charNames = charNames.filter(charName => isSanitized(charName));
  const charSet = new Set(charNames);
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
  return filtered;
}

const getCharacterActiveDateAutocompletion = charNames => {
  charNames.forEach(c => assertSanitizedInput(c));
  const intervals = db.prepare(
    `SELECT CAST(timestamp/3600 AS INT)*3600 AS interval, COUNT(DISTINCT character) AS charCount 
    FROM experienceEvents WHERE LOWER(character) IN (${charNames.map(c=>`'${c.toLowerCase()}'`)}) GROUP BY interval ORDER BY interval DESC`).all();
  const filtered = intervals
    .slice(0, 25)
    .map(entry => ({
      name: `${timestampToInputDateFormat(entry.interval)} (${entry.charCount} players active)`, 
      value: timestampToInputDateFormat(entry.interval)
    }));
  return filtered;
}

const getTeamAutocompletion = focusedValue => {
  assertSanitizedInput(focusedValue);
  const teams = db.prepare(`SELECT teamTag FROM teams WHERE teamTag LIKE '${focusedValue}%' ORDER BY teamTag ASC`).all();
  const filtered = teams.slice(0, 25).map(entry => ({name: entry.teamTag, value: entry.teamTag}));
  return filtered;
}

module.exports = {
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
                          .setRequired(true)
                          .setMaxLength(4))
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
                          .setRequired(true)
                          .setMaxLength(4))
                  .addStringOption(option =>
                    option.setName('outfit_tag')
                          .setDescription('Outfit tag')
                          .setRequired(true))),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const teamTag = interaction.options.getString('team_tag');
        assertSanitizedInput(teamTag);
        const teamId = db.prepare(`SELECT teamId FROM teams WHERE teamTag LIKE '${teamTag}'`).get()?.teamId;
        if (!teamId) throw new NotFoundError(`no team called \`${teamTag}\` found`);
        if (interaction.options.getSubcommand() === 'character') {
          const charNames = interaction.options.getString('character_names').split(' ');
          charNames.forEach(name=>assertSanitizedInput(name));
          let alreadyTracked = db.prepare(
            `SELECT character, teamTag FROM trackedCharacters 
            JOIN teams ON teams.teamId=trackedCharacters.teamId
            WHERE LOWER(character) IN (${charNames.map(c=>`'${c.toLowerCase()}'`)})`).all();
          console.log(alreadyTracked);
          const promises = charNames.map( charName => getCharacterDetails(charName) );
          let msg = '';
          const results = await Promise.allSettled(promises);
          results.forEach( (res, idx) => {
            if (res.status === 'fulfilled') {
              try {
                if (res.value === null) throw new NotFoundError();
                const row = {
                  characterId: res.value.characterId,
                  character: res.value.character,
                  teamId: teamId,
                  faction: res.value.faction,
                  server: res.value.server
                };
                addTrackedCharacter.run(row);
                msg += `\`${res.value.character}\` (${res.value.faction} ${res.value.server}) assigned to \`${teamTag}\`\n`;
              } catch (e) {
                if (e.name === 'SqliteError' && e.code === 'SQLITE_CONSTRAINT_UNIQUE') 
                  msg += `\`${res.value.character}\` is already assigned to \`${alreadyTracked[alreadyTracked.map(entry=>entry.character).indexOf(res.value.character)]?.teamTag}\`\n`;
                else if (e instanceof NotFoundError) msg += `\`${charNames[idx]}\`: no such character found\n`;
                else msg += `\`${charNames[idx]}\` failed to be processed\n`;
              }
            } 
            else msg += `${charNames[idx]} failed to be resolved (${res.reason})\n`;
          });
          await interaction.editReply(msg);
        } 
        else if (interaction.options.getSubcommand() === 'outfit') {
          const outfitTag = interaction.options.getString('outfit_tag');
          assertSanitizedInput(outfitTag);
          try {
            const outfit = await getOutfitDetails(outfitTag);
            if (outfit.memberCount > 1000) throw new Error('Tracking zergfits is a bad idea');
            const row = {
              outfitId: outfit.outfitId,
              outfitTag: outfit.outfitTag,
              outfitName: outfit.outfitName,
              teamId: teamId,
              faction: outfit.faction,
              server: outfit.server
            };
            addTrackedOutfit.run(row);
            await interaction.editReply(`\`${outfit.outfitTag} - ${outfit.outfitName}\` (${outfit.server} ${outfit.faction}) assigned to \`${teamTag}\``);
          } catch (e) {
            if (e.name === 'SqliteError' && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              await interaction.editReply(`\`${outfitTag}\` is already assigned to a team`)
            } else {
              await interaction.editReply(`Error: failed to resolve/assign outfit`);
            }
          }
        } else throw Error('Error: invalid subcommand');
      } catch (e) {
        logCaughtException(e);
        await interaction.editReply(`Error: could not execute command`)
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedValue = interaction.options.getFocused();
        const autocompletion = getTeamAutocompletion(focusedValue);
        await interaction.respond(autocompletion);
      } catch (e) {
        logCaughtException(e);
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
      try {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'character') {
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
        }
        else if (subcommand === 'outfit') {
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
        } else throw Error('Invalid subcommand for player removal command');
      } catch (e) {
        logCaughtException(e);
        if (e instanceof InvalidInputError) {
          await interaction.editReply(`Error: invalid input argument`);
        } else {
          await interaction.editReply(`Error: couldn't remove ${subcommand} \`${outfitToRemove}\``);
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
        logCaughtException(e);
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
              .setRequired(true)
              .setMaxLength(4))
      .addStringOption(option =>
        option.setName('full_name')
              .setDescription('Full team name')
              .setRequired(true)),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const teamTag = interaction.options.getString('team_tag');
        const teamName = interaction.options.getString('full_name');
        assertSanitizedInput(teamTag);
        assertSanitizedSentenceInput(teamName);
        addTeam.run({teamTag: teamTag, teamName: teamName});
        await interaction.editReply(`Added \`${teamTag}\` as a team`)
      } catch (e) {
        logCaughtException(e);
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
              .setAutocomplete(true)
              .setMaxLength(4)),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const teamTag = interaction.options.getString('team_tag');
        assertSanitizedInput(teamTag);
        const result = db.prepare(`DELETE FROM teams WHERE teamTag LIKE '${teamTag}'`).run();
        if (result.changes > 0) await interaction.editReply(`Removed \`${teamTag}\` from teams`);
        else await interaction.editReply(`Error: no such team \`${teamTag}\``)
      } catch (e) {
        logCaughtException(e);
        if (e instanceof InvalidInputError) {
          await interaction.editReply(`Error: invalid input argument`) ; 
        } else {
          await interaction.editReply(`Error: couldn't remove team`);
        }
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedValue = interaction.options.getFocused();
        const autocompletion = getTeamAutocompletion(focusedValue);
        await interaction.respond(autocompletion);

      } catch (e) {
        logCaughtException(e);
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
              .setAutocomplete(true)
              .setMaxLength(4)),
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
        logCaughtException(e);
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
        const autocompletion = getTeamAutocompletion(focusedValue);
        await interaction.respond(autocompletion);
      } catch (e) {
        logCaughtException(e);
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
              .setRequired(true)
              .setMaxValue(maxReportLength)),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const charNames = interaction.options.getString('character_names').split(' ');
        charNames.forEach(name=>assertSanitizedInput(name));
        const startTime = interaction.options.getString('start_time');
        assertValidDateFormat(startTime);
        const length = interaction.options.getInteger('length');
        const timelineFile = await generateTimeline(charNames, startTime, length);
        await assertFileSizeWithinDiscordLimit(timelineFile);
        await interaction.editReply({
          content: `Event timeline for \`${charNames.join(', ')}\` starting at <t:${inputDateFormatToTimestamp(startTime)}:F> (${length} min)`, 
          files: [timelineFile]
        });
      } catch (e) {
        logCaughtException(e);
        if (e instanceof InvalidInputError) {
          await interaction.editReply("Error: invalid input argument");
        } else if (e instanceof InvalidDateFormatError) {
          await interaction.editReply("Error: invalid date format");
        } else if (e instanceof FileTooBigError) {
          await interaction.editReply("Error: resultant file too big to send");
        } else {
          await interaction.editReply("Error: couldn't execute function");
        }        
        return;
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value;
        if (focusedOption.name === 'character_names') {
          const autocompletion = getNextCharNameAutocompletion(focusedValue);
          await interaction.respond(autocompletion);
        } 
        else if (focusedOption.name === 'start_time') {
          const charNames = interaction.options.getString('character_names').split(' ');
          const autocompletion = getCharacterActiveDateAutocompletion(charNames);
          await interaction.respond(autocompletion);
        }
      } catch (e) {
        logCaughtException(e);
        await interaction.respond([]);
      }
    }
  },
  session_report: {
    data: new SlashCommandBuilder()
      .setName('session_report')
      .setDescription('Generate session report')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand(subcommand =>
        subcommand.setName('characters')
                  .setDescription('Generate session report for a set of characters')
                  .addStringOption(option=>
                    option.setName('character_names')
                          .setDescription('Character names separated by space')
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
                          .setRequired(true)
                          .setMaxValue(maxReportLength)))
        .addSubcommand(subcommand =>
          subcommand.setName('team')
                    .setDescription('Generate session report for a team')
                    .addStringOption(option=>
                      option.setName('team_tag')
                            .setDescription('Team tag')
                            .setRequired(true)
                            .setAutocomplete(true)
                            .setMaxLength(4))
                    .addStringOption(option=>
                      option.setName('start_time')
                            .setDescription('Session start time in "YYMMDD HH:MM"')
                            .setRequired(true)
                            .setAutocomplete(true))
                    .addIntegerOption(option=>
                      option.setName('length')
                            .setDescription('Session length in minutes')
                            .setRequired(true)
                            .setMaxValue(maxReportLength))),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const subcommand = interaction.options.getSubcommand();
        const startTime = interaction.options.getString('start_time');
        assertValidDateFormat(startTime);
        const length = interaction.options.getInteger('length');
        if (subcommand === 'characters') {
          const charNames = interaction.options.getString('character_names').split(' ');
          charNames.forEach(c => assertSanitizedInput(c));
          const reportFile = await generateReportForCharacters(charNames, startTime, length);
          await assertFileSizeWithinDiscordLimit(reportFile);
          await interaction.editReply({
            content: `Session report for \`${charNames.join(', ')}\` starting at <t:${inputDateFormatToTimestamp(startTime)}:F> (${length} min)`, 
            files: [reportFile]
          });
        }
        else if (subcommand === 'team') {
          const teamTag = interaction.options.getString('team_tag');
          assertSanitizedInput(teamTag);
          const reportFile = await generateReportForTeam(teamTag, startTime, length);
          await assertFileSizeWithinDiscordLimit(reportFile);
          await interaction.editReply({
            content: `Session report for \`${teamTag}\` starting at <t:${inputDateFormatToTimestamp(startTime)}:F> (${length} min)`, 
            files: [reportFile]
          });
        }
        else throw new Error('Invalid session_report subcommand');
      } catch (e) {
        logCaughtException(e);
        if (e instanceof InvalidInputError) {
          await interaction.editReply("Error: invalid input argument");
        } else if (e instanceof InvalidDateFormatError) {
          await interaction.editReply("Error: invalid date format");
        } else if (e instanceof FileTooBigError) {
          await interaction.editReply("Error: resultant file too big to send");
        } else {
          await interaction.editReply("Error: couldn't execute function");
        }        
        return;
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value;
        if (focusedOption.name === 'character_names') {
          const autocompletion = getNextCharNameAutocompletion(focusedValue);
          await interaction.respond(autocompletion);
        }
        else if (focusedOption.name === 'team_tag') {
          const autocompletion = getTeamAutocompletion(focusedValue);
          await interaction.respond(autocompletion);
        }
        else if (focusedOption.name === 'start_time') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'characters') {
            const charNames = interaction.options.getString('character_names').split(' ');
            const autocompletion = getCharacterActiveDateAutocompletion(charNames);
            await interaction.respond(autocompletion);
          } else if (subcommand === 'team') {
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
          }
        }
      } catch (e) {
        logCaughtException(e);
        await interaction.respond([]);
      }
    }
  },
  create_backup: {
    data: new SlashCommandBuilder()
      .setName('create_backup')
      .setDescription('Manually back-up the database')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const dateStr = currDateAsFilenameFormat();
        const backupLocation = path.join(__dirname, '/../db/backups', `player-events-backup-${dateStr}.db`);
        db.exec(`VACUUM main INTO '${backupLocation}'`);
        const sizeMb = await getFileSizeInMb(backupLocation);
        await interaction.editReply(`Backed up database as \`${path.basename(backupLocation)}\` (${sizeMb.toFixed(2)}mb)`);
      } catch (e) {
        logCaughtException(e);
        if (e.name === 'SqliteError' && e.code === 'SQLITE_CANTOPEN') {
          await interaction.editReply("Error: no backup directory");
        } else if (e.name === 'SqliteError' && e.code === 'SQLITE_ERROR') {
          await interaction.editReply("Error: backup for this minute already exists");
        } else {
          await interaction.editReply("Error: couldn't execute command");
        }
      }
    }
  }, // todo: make command that looks up chars of the form TAGx...VS|NC|TR on Jaeger
  list_untracked_ls_characters: {
    data: new SlashCommandBuilder()
      .setName('list_untracked_ls_characters')
      .setDescription("Check for a team's existing untracked PSB-provided characters")
      .addStringOption(option=>
        option.setName('team_tag')
              .setDescription('Team tag')
              .setRequired(true)
              .setAutocomplete(true)
              .setMaxLength(4))
      .addStringOption(option=>
        option.setName('sort_by')
              .setDescription('Sort by chosen field')
              .addChoices(
                { name: 'Creation date', value: 'creationTimestamp'},
                { name: 'Last activity date', value: 'lastSaveTimestamp'},
                { name: 'Playtime', value: 'minutesPlayed'}
              )),
    execute: async interaction => {
      await interaction.deferReply();
      try {
        const teamTag = interaction.options.getString('team_tag');
        assertSanitizedInput(teamTag);
        let lsChars = await getLsCharacters(teamTag);
        lsChars = lsChars.filter(c => (c.name.endsWith('NC') || c.name.endsWith('TR') || c.name.endsWith('VS')) && c.server === 'Jaeger');
        let alreadyTrackedChars = db.prepare(
          `SELECT characterId FROM trackedCharacters 
          JOIN teams ON teams.teamId = trackedCharacters.teamId
          WHERE teamTag LIKE '${teamTag}' AND character LIKE '${teamTag}x%'`
          ).all();
        alreadyTrackedChars = new Set(alreadyTrackedChars.map(c => c.characterId));
        lsChars = lsChars.filter(c => !alreadyTrackedChars.has(c.characterId));
        if (lsChars.length > 0) {
          const sortedPropertyName = interaction.options.getString('sort_by');
          console.log(sortedPropertyName);
          const embed = new EmbedBuilder()
            .setTitle(`Found untracked LS characters for team \`${teamTag}\``)
            .setDescription('PSB-provided characters that are unnacounted for');
          if (sortedPropertyName) lsChars.sort((a, b) => b[sortedPropertyName] - a[sortedPropertyName]);
          const maxCharacterLimit = 50;
          if (lsChars.length > maxCharacterLimit) {
            embed.setFooter( { text:`+ ${lsChars.length - maxCharacterLimit} more`} );
            lsChars = lsChars.slice(0, maxCharacterLimit);
          }
          embed.addFields(
              { name: 'Character', value: lsChars.map(c => c.name).join('\n'), inline: true },
              { name: 'Created', value: lsChars.map(c => `<t:${c.creationTimestamp}:d>`).join('\n'), inline: true }
          );
          if (sortedPropertyName !== 'minutesPlayed') embed.addFields( { name: 'Last Active', value: lsChars.map(c => `<t:${c.lastSaveTimestamp}:R>`).join('\n'), inline: true } );
          else embed.addFields( { name: 'Playtime', value: lsChars.map(c => (c.minutesPlayed < 60 ? `${c.minutesPlayed} min` : `${(c.minutesPlayed/60).toFixed(0)} hours`)).join('\n'), inline: true } );
          await interaction.editReply({ embeds: [embed] });
        } else await interaction.editReply(`No untracked LS characters found for \`${teamTag}\``);
      } catch (e) {
        logCaughtException(e);
        if (e instanceof InvalidInputError) await interaction.editReply('Error: invalid input argument');
        else await interaction.editReply("Error: couldn't execute command");
      }
    },
    autocomplete: async interaction => {
      try {
        const focusedValue = interaction.options.getFocused();
        const autocompletion = getTeamAutocompletion(focusedValue);
        interaction.respond(autocompletion);
      } catch (e) {
        logCaughtException(e);
        interaction.respond([]);
      }
    }
  }
}

