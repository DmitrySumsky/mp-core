/* Смок на боевом кэше (вне репозитория): прогноз и факт по всем кабинетам + время пересборки листов.
   node tests/real_data.js <реестр> <день> */
const fs = require('fs'), path = require('path'), gas = require('./fake_gas');
const C = require(path.join(__dirname, '..', 'central', 'build', 'central.js'));
const reg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), day = process.argv[3];
const dir = path.join(reg.data_dir, 'cache');
Object.keys(reg.cabinets).forEach(name => {
  const cache = JSON.parse(fs.readFileSync(path.join(dir, 'yop_cache_' + name.replace(/\s+/g, '') + '.json'), 'utf8'));
  const cogsFile = path.join(dir, 'cogs_' + reg.cabinets[name].unit + '.json');
  const cogs = fs.existsSync(cogsFile) ? JSON.parse(fs.readFileSync(cogsFile, 'utf8')) : {};
  const flat = C.yopItems_(cache), t0 = Date.now();
  const f = C.yopForecast_(cache, day, cogs, flat, null), sum = k => f.rows.reduce((a, r) => a + r[k], 0);
  const back = C.yopAddDays_(day, -19), fact = C.yopFactDay_(cache, flat, back, cogs), fc = C.yopForecast_(cache, back, cogs, flat, null);
  const fcP = fc.rows.reduce((a, r) => a + r.ЧП, 0);
  console.log(name.padEnd(20), 'шт', String(sum('n')).padStart(5), 'ЧП заказов', Math.round(sum('ЧП')).toString().padStart(9),
    '|', back, 'прогноз', Math.round(fcP), 'факт', Math.round(fact.ЧП), 'известно', (fact.известно * 100).toFixed(0) + '%', '|', Date.now() - t0, 'мс');
});
