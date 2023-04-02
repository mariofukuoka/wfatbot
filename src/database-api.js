const sqlite3 = require('better-sqlite3');


var db = sqlite3('../player-events.db');

// =====================================  TABLE DEFINITIONS =================================================
db.exec(`CREATE TABLE IF NOT EXISTS deathEvents (
  id INTEGER PRIMARY KEY, 
  timestamp INTEGER,
  attackerId TEXT, 
  attacker TEXT, 
  attackerClass TEXT, 
  attackerFaction TEXT, 
  attackerVehicle TEXT, 
  attackerWeaponId TEXT,
  attackerWeapon TEXT,
  characterId TEXT, 
  character TEXT, 
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
  class TEXT,
  faction TEXT,
  otherId TEXT,
  other TEXT,
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
  attackerClass TEXT, 
  attackerFaction TEXT, 
  attackerVehicle TEXT, 
  attackerWeaponId TEXT,
  attackerWeapon TEXT,
  characterId TEXT, 
  character TEXT, 
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
  type TEXT,
  server TEXT
)`); 

// =================================== PER TABLE INSERT STATEMENT DEFINITIONS ==============================
const saveDeathEvent = db.prepare(`INSERT INTO deathEvents (
    timestamp, attackerId, attacker, attackerClass, attackerFaction, attackerVehicle, attackerWeaponId, attackerWeapon, characterId, character, class, faction, vehicle, isHeadshot, continent, server
  ) 
  VALUES (
    $timestamp, $attackerId, $attacker, $attackerClass, $attackerFaction, $attackerVehicle, $attackerWeaponId, $attackerWeapon, $characterId, $character, $class, $faction, $vehicle, $isHeadshot, $continent, $server
  )`);

const saveExperienceEvent = db.prepare(`INSERT INTO experienceEvents (
  timestamp, characterId, character, class, faction, otherId, other, experienceId, description, amount, server, continent
) 
VALUES (
  $timestamp, $characterId, $character, $class, $faction, $otherId, $other, $experienceId, $description, $amount, $continent, $server
)`);

const saveVehicleDestroyEvent = db.prepare(`INSERT INTO vehicleDestroyEvents (
  timestamp, attackerId, attacker, attackerClass, attackerFaction, attackerVehicle, attackerWeaponId, attackerWeapon, characterId, character, faction, vehicle, facilityId, facility, continent, server
) 
VALUES (
  $timestamp, $attackerId, $attacker, $attackerClass, $attackerFaction, $attackerVehicle, $attackerWeaponId,$attackerWeapon,$characterId, $character, $faction, $vehicle, $facilityId, $facility,$continent, $server
)`);
  
const savePlayerFacilityEvent = db.prepare(`INSERT INTO playerFacilityEvents (
  timestamp, characterId, character, type, facilityId, facility, continent, server
) 
VALUES (
  $timestamp, $characterId, $character, $type, $facilityId, $facility, $continent, $server
)`);

const saveSkillAddedEvent = db.prepare(`INSERT INTO skillAddedEvents (
  timestamp, characterId, character, skillId, name, skillLine, skillPoints, grantItemId, continent, server
) 
VALUES (
    $timestamp, $characterId, $character, $skillId, $name, $skillLine, $skillPoints, $grantItemId, $continent, $server
)`);
const saveItemAddedEvent = db.prepare(`INSERT INTO itemAddedEvents (
    timestamp, characterId, character, itemId, name, type, category, skillSet, itemCount, context, continent, server
  ) 
  VALUES ( 
    $timestamp, $characterId, $character, $itemId, $name, $type, $category, $skillSet, $itemCount, $context, $continent, $server
  )`);

const savePlayerSessionEvent = db.prepare(`INSERT INTO playerSessionEvents (
    timestamp, characterId, character, type, server
  )
  VALUES (
    $timestamp, $characterId, $character, $type, $server
)`)

module.exports = {
    db,
    saveDeathEvent,
    saveExperienceEvent,
    saveVehicleDestroyEvent,
    savePlayerFacilityEvent,
    saveSkillAddedEvent,
    saveItemAddedEvent,
    savePlayerSessionEvent
}