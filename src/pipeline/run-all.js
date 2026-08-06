// One-shot orchestrator: scrape -> match -> metrics.
//   node src/pipeline/run-all.js [competitor ...]
const { execFileSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const run = (f, a = []) => execFileSync('node', [path.join(__dirname, f), ...a], { stdio: 'inherit' });

run('scrape.js', args);
run('match.js', args);
run('metrics.js');
