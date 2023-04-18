const sqlite3 = require('better-sqlite3');



// todo: parametrize module to define db location when you import it
var db = sqlite3('../db/player-events.db');

// =====================================  TABLE DEFINITIONS =================================================
db.exec(`CREATE TABLE IF NOT EXISTS deathEvents (
  id INTEGER PRIMARY KEY, 
  timestamp INTEGER,
  attackerId TEXT, 
  attacker TEXT, 
  attackerTeamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  attackerClass TEXT, 
  attackerFaction TEXT, 
  attackerVehicle TEXT, 
  attackerWeaponId TEXT,
  attackerWeapon TEXT,
  characterId TEXT, 
  character TEXT, 
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  class TEXT, 
  faction TEXT, 
  vehicle TEXT, 
  isHeadshot INTEGER, 
  continent TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS experienceEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  class TEXT,
  faction TEXT,
  otherId TEXT,
  other TEXT,
  otherTeamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  experienceId TEXT,
  description TEXT,
  amount INTEGER,
  continent TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS vehicleDestroyEvents (
  id INTEGER PRIMARY KEY, 
  timestamp INTEGER,
  attackerId TEXT, 
  attacker TEXT, 
  attackerTeamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  attackerClass TEXT, 
  attackerFaction TEXT, 
  attackerVehicle TEXT, 
  attackerWeaponId TEXT,
  attackerWeapon TEXT,
  characterId TEXT, 
  character TEXT, 
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  faction TEXT, 
  vehicle TEXT, 
  facilityId TEXT,
  facility TEXT,
  continent TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS playerFacilityEvents (
  id INTEGER PRIMARY KEY, 
  timestamp INTEGER,
  characterId TEXT, 
  character TEXT, 
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  type TEXT,
  facilityId TEXT,
  facility TEXT, 
  continent TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS skillAddedEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  skillId TEXT,
  name TEXT,
  skillLine TEXT,
  skillPoints INTEGER,
  grantItemId TEXT,
  continent TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS itemAddedEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  itemId TEXT,
  name TEXT,
  type TEXT,
  category TEXT,
  skillSet TEXT,
  itemCount INTEGER,
  context TEXT,
  continent TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS playerSessionEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  teamId INTEGER REFERENCES teams(teamId) ON DELETE SET NULL,
  type TEXT,
  server TEXT
)`); 

db.exec(`CREATE TABLE IF NOT EXISTS teams (
  teamId INTEGER PRIMARY KEY,
  teamTag TEXT COLLATE NOCASE UNIQUE,
  teamName TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS trackedCharacters (
  id INTEGER PRIMARY KEY,
  characterId TEXT UNIQUE,
  character TEXT,
  teamId INTEGER REFERENCES teams(teamId) ON DELETE CASCADE,
  faction TEXT,
  server TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS trackedOutfits (
  id INTEGER PRIMARY KEY,
  outfitId TEXT UNIQUE,
  outfitTag TEXT,
  outfitName TEXT,
  teamId INTEGER REFERENCES teams(teamId) ON DELETE CASCADE,
  faction TEXT,
  server TEXT
)`);

// =================================== PER TABLE INSERT STATEMENT DEFINITIONS ==============================
const saveDeathEvent = db.prepare(`INSERT INTO deathEvents (
    timestamp, attackerId, attacker, attackerTeamId, attackerClass, attackerFaction, attackerVehicle, attackerWeaponId, attackerWeapon, characterId, character, teamId, class, faction, vehicle, isHeadshot, continent, server
  ) 
  VALUES (
    $timestamp, $attackerId, $attacker, $attackerTeamId, $attackerClass, $attackerFaction, $attackerVehicle, $attackerWeaponId, $attackerWeapon, $characterId, $character, $teamId, $class, $faction, $vehicle, $isHeadshot, $continent, $server
  )`);

const saveExperienceEvent = db.prepare(`INSERT INTO experienceEvents (
  timestamp, characterId, character, teamId, class, faction, otherId, other, otherTeamId, experienceId, description, amount, continent, server 
) 
VALUES (
  $timestamp, $characterId, $character, $teamId, $class, $faction, $otherId, $other, $otherTeamId, $experienceId, $description, $amount, $continent, $server
)`);

const saveVehicleDestroyEvent = db.prepare(`INSERT INTO vehicleDestroyEvents (
  timestamp, attackerId, attacker, attackerTeamId, attackerClass, attackerFaction, attackerVehicle, attackerWeaponId, attackerWeapon, characterId, character, teamId, faction, vehicle, facilityId, facility, continent, server
) 
VALUES (
  $timestamp, $attackerId, $attacker, $attackerTeamId, $attackerClass, $attackerFaction, $attackerVehicle, $attackerWeaponId, $attackerWeapon, $characterId, $character, $teamId, $faction, $vehicle, $facilityId, $facility,$continent, $server
)`);
  
const savePlayerFacilityEvent = db.prepare(`INSERT INTO playerFacilityEvents (
  timestamp, characterId, character, teamId, type, facilityId, facility, continent, server
) 
VALUES (
  $timestamp, $characterId, $character, $teamId, $type, $facilityId, $facility, $continent, $server
)`);

const saveSkillAddedEvent = db.prepare(`INSERT INTO skillAddedEvents (
  timestamp, characterId, character, teamId, skillId, name, skillLine, skillPoints, grantItemId, continent, server
) 
VALUES (
    $timestamp, $characterId, $character, $teamId, $skillId, $name, $skillLine, $skillPoints, $grantItemId, $continent, $server
)`);
const saveItemAddedEvent = db.prepare(`INSERT INTO itemAddedEvents (
    timestamp, characterId, character, teamId, itemId, name, type, category, skillSet, itemCount, context, continent, server
  ) 
  VALUES ( 
    $timestamp, $characterId, $character, $teamId, $itemId, $name, $type, $category, $skillSet, $itemCount, $context, $continent, $server
  )`);

const savePlayerSessionEvent = db.prepare(`INSERT INTO playerSessionEvents (
    timestamp, characterId, character, teamId, type, server
  )
  VALUES (
    $timestamp, $characterId, $character, $teamId, $type, $server
)`);

const addTrackedCharacter = db.prepare(
  `INSERT INTO trackedCharacters (characterId, character, teamId, faction, server)
  VALUES ($characterId, $character, $teamId, $faction, $server)`);

const addTrackedOutfit = db.prepare(
  `INSERT INTO trackedOutfits (outfitId, outfitTag, outfitName, teamId, faction, server)
  VALUES ($outfitId, $outfitTag, $outfitName, $teamId, $faction, $server)`);

const addTeam = db.prepare(
  `INSERT INTO teams (teamTag, teamName)
  VALUES ($teamTag, $teamName)`);

module.exports = {
    db,
    saveDeathEvent,
    saveExperienceEvent,
    saveVehicleDestroyEvent,
    savePlayerFacilityEvent,
    saveSkillAddedEvent,
    saveItemAddedEvent,
    savePlayerSessionEvent,
    addTrackedCharacter,
    addTrackedOutfit,
    addTeam
}