const sqlite3 = require('better-sqlite3');


var db = sqlite3(':memory:');

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
const logDeathEvent = db.prepare(`INSERT INTO deathEvents (
    timestamp, attackerId, attacker, attackerClass, attackerFaction, attackerVehicle, attackerWeaponId, attackerWeapon, characterId, character, class, faction, vehicle, isHeadshot, continent, server
  ) 
  VALUES (
    $timestamp, $attackerId, $attacker, $attackerClass, $attackerFaction, $attackerVehicle, $attackerWeaponId, $attackerWeapon, $characterId, $character, $class, $faction, $vehicle, $isHeadshot, $continent, $server
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
const logExperienceEvent = db.prepare(`INSERT INTO experienceEvents (
  timestamp, characterId, character, class, faction, otherId, other, experienceId, description, amount, server, continent
) 
VALUES (
  $timestamp, $characterId, $character, $class, $faction, $otherId, $other, $experienceId, $description, $amount, $continent, $server
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
const logVehicleDestroyEvent = db.prepare(`INSERT INTO vehicleDestroyEvents (
  timestamp, attackerId, attacker, attackerClass, attackerFaction, attackerVehicle, attackerWeaponId, attackerWeapon, characterId, character, faction, vehicle, facilityId, facility, continent, server
) 
VALUES (
  $timestamp, $attackerId, $attacker, $attackerClass, $attackerFaction, $attackerVehicle, $attackerWeaponId,$attackerWeapon,$characterId, $character, $faction, $vehicle, $facilityId, $facility,$continent, $server
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
const logPlayerFacilityEvent = db.prepare(`INSERT INTO playerFacilityEvents (
  timestamp, characterId, character, type, facilityId, facility, continent, server
) 
VALUES (
  $timestamp, $characterId, $character, $type, $facilityId, $facility, $continent, $server
)`);


db.exec(`CREATE TABLE IF NOT EXISTS skillAddedEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  skillId TEXT,
  skill TEXT,
  continent TEXT,
  server TEXT
)`);
const logSkillAddedEvent = db.prepare(`INSERT INTO skillAddedEvents (
  timestamp, characterId, character, skillId, skill, continent, server
) 
VALUES (
    $timestamp, $characterId, $character, $skillId, $skill, $continent, $server
)`);


db.exec(`CREATE TABLE IF NOT EXISTS itemAddedEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  itemId TEXT,
  item TEXT,
  itemCount INTEGER,
  context TEXT,
  continent TEXT,
  server TEXT
)`);
const logItemAddedEvent = db.prepare(`INSERT INTO itemAddedEvents (
    timestamp, characterId, character, itemId, item, itemCount, context, continent, server
  ) 
  VALUES ( 
    $timestamp, $characterId, $character, $itemId, $item, $itemCount, $context, $continent, $server
  )`);


db.exec(`CREATE TABLE IF NOT EXISTS playerSessionEvents (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  characterId TEXT,
  character TEXT,
  type TEXT,
  server TEXT
)`); 

const logPlayerSessionEvent = db.prepare(`INSERT INTO playerSessionEvents (
    timestamp, characterId, character, type, server
  )
  VALUES (
    $timestamp, $characterId, $character, $type, $server
)`)

module.exports = {
    db,
    logDeathEvent,
    logExperienceEvent,
    logVehicleDestroyEvent,
    logPlayerFacilityEvent,
    logSkillAddedEvent,
    logItemAddedEvent
}