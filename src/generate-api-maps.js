const census = require('./census-funcs')
var fs = require('fs');
const limit = 5000;
const folderName = 'api-maps';

async function main() {
  promises = [
    census.getItemMap(),
    census.getSkillMap(),
    census.getFactionMap(),
    census.getVehicleMap(),
    census.getLoadoutMap(),
    census.getExperienceMap(),
    census.getZoneMap(),
    census.getRegionMap(),
    census.getWorldMap()
  ]
  results = await Promise.all(promises);
  console.log('census promises resolved');
  filenames = [
    'item-map.json',
    'skill-map.json',
    'faction-map.json',
    'vehicle-map.json',
    'loadout-map.json',
    'experience-map.json',
    'zone-map.json',
    'region-map.json',
    'world-map.json'
  ]
  for (let i in filenames) {
    fs.writeFile(`./${folderName}/${filenames[i]}`, JSON.stringify(results[i], null, '\t'), function(err) {
      if (err) {
        console.log(err);
      }
    })
    console.log(`file ${filenames[i]} written`);
  }
  console.log('all files written!');
}
main();