// start_dev.js
// Spawn the Next.js dev server in the background
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const out = fs.openSync(path.join(__dirname, 'dev_server.log'), 'w');
const err = fs.openSync(path.join(__dirname, 'dev_server_stderr.log'), 'w');

const child = spawn('npm.cmd', ['run', 'dev'], {
  cwd: 'E:\\AutoHomeworkMarking',
  env: { ...process.env, PORT: '3001', GRADING_CONCURRENCY: '3' },
  detached: true,
  stdio: ['ignore', out, err],
  shell: true,
  windowsHide: true,
});

child.unref();
console.log(`Spawned dev server, PID=${child.pid}`);
process.exit(0);
