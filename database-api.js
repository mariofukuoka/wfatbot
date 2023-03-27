const sqlite3 = require('better-sqlite3');


var db = sqlite3(':memory:');

db.exec(`CREATE TABLE deathEvents (
  id INTEGER PRIMARY KEY, 
  timestamp INTEGER,
  attackerId TEXT, 
  attacker TEXT, 
  attackerClass TEXT, 
  attackerFaction TEXT, 
  attackerVehicle TEXT, 
  characterId TEXT, 
  character TEXT, 
  class TEXT, 
  faction TEXT, 
  vehicle TEXT, 
  isHeadshot INTEGER, 
  server TEXT, 
  continent TEXT
)`);

const logDeathEvent = db.prepare(`INSERT INTO deathEvents (
  timestamp,
  attackerId,
  attacker,
  attackerClass,
  attackerFaction,
  attackerVehicle,
  characterId,
  character,
  class,
  faction,
  vehicle,
  isHeadshot,
  server,
  continent
) VALUES (
  $timestamp,
  $attackerId,
  $attacker,
  $attackerClass,
  $attackerFaction,
  $attackerVehicle,
  $characterId,
  $character,
  $class,
  $faction,
  $vehicle,
  $isHeadshot,
  $server,
  $continent
)`);

db.exec(`CREATE TABLE experienceEvents (
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
  server TEXT,
  continent TEXT
)`);

const logExperienceEvent = db.prepare(`INSERT INTO experienceEvents (
  timestamp,
  characterId,
  character,
  class,
  faction,
  otherId,
  other,
  experienceId,
  description,
  amount,
  server,
  continent
) VALUES (
  $timestamp,
  $characterId,
  $character,
  $class,
  $faction,
  $otherId,
  $other,
  $experienceId,
  $description,
  $amount,
  $server,
  $continent
)`);


module.exports = {
    db,
    logDeathEvent,
    logExperienceEvent
}