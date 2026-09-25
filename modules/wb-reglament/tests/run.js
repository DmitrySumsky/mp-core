/* Все тесты модуля одной командой: node tests/run.js. Код возврата ≠ 0 — деплой отменяется. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).map((f) => path.join(__dirname, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
