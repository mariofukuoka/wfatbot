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
  timestamp,
  attackerId,
  attacker,
  attackerClass,
  attackerFaction,
  attackerVehicle,
  attackerWeaponId,
  attackerWeapon,
  characterId,
  character,
  class,
  faction,
  vehicle,
  isHeadshot,
  continent,
  server
) VALUES (
  $timestamp,
  $attackerId,
  $attacker,
  $attackerClass,
  $attackerFaction,
  $attackerVehicle,
  $attackerWeaponId,
  $attackerWeapon,
  $characterId,
  $character,
  $class,
  $faction,
  $vehicle,
  $isHeadshot,
  $continent,
  $server
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
  continent TEXT,
  server TEXT
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
  $continent,
  $server
)`);


db.exec(`CREATE TABLE vehicleDestroyEvents (
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
    continent TEXT,
    server TEXT
  )`);

  const logVehicleDestroyEvent = db.prepare(`INSERT INTO vehicleDestroyEvents (
    timestamp,
    attackerId, 
    attacker, 
    attackerClass, 
    attackerFaction, 
    attackerVehicle, 
    attackerWeaponId,
    attackerWeapon,
    characterId, 
    character, 
    faction, 
    vehicle, 
    continent,
    server
  ) VALUES (
    $timestamp,
    $attackerId, 
    $attacker, 
    $attackerClass, 
    $attackerFaction, 
    $attackerVehicle, 
    $attackerWeaponId,
    $attackerWeapon,
    $characterId, 
    $character, 
    $faction, 
    $vehicle, 
    $continent,
    $server
  )`);
  

module.exports = {
    db,
    logDeathEvent,
    logExperienceEvent,
    logVehicleDestroyEvent
}