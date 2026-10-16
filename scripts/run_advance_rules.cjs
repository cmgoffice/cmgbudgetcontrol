// Local emulator only; never deploys or contacts production data.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const work = path.join(root, 'output', 'advance-rules');
fs.mkdirSync(work, { recursive: true });
fs.copyFileSync(path.join(root, 'firestore.rules'), path.join(work, 'firestore.rules'));
fs.writeFileSync(path.join(work, 'firebase.json'), JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{firestore:{host:'127.0.0.1',port:8291,websocketPort:9252},hub:{host:'127.0.0.1',port:4490},logging:{host:'127.0.0.1',port:4590},ui:{enabled:false}}}));
const permitted = ['PATH','PATHEXT','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','PROGRAMDATA','COMSPEC','JAVA_HOME'];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => permitted.includes(key.toUpperCase())));
const child = spawn('firebase emulators:exec --only firestore --project demo-advance-rules --config firebase.json "node ../../scripts/test_advance_rules.cjs && node ../../scripts/test_advance_lifecycle.cjs"', {shell:true,cwd:work,stdio:['ignore','pipe','pipe'],env:{...env,XDG_CONFIG_HOME:path.join(work,'cli-config'),FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
let emulatorPid;
function output(chunk) {
  process.stdout.write(chunk);
  if (!emulatorPid && process.platform === 'win32' && chunk.toString().includes('Running script:')) {
    const sockets = spawnSync('netstat.exe', ['-ano'], {encoding:'utf8'}).stdout || '';
    const listener = sockets.match(/TCP\s+127\.0\.0\.1:8291\s+\S+\s+LISTENING\s+(\d+)/);
    if (listener) emulatorPid = Number(listener[1]);
  }
}
child.stdout.on('data', output);
child.stderr.on('data', output);
child.on('exit', code => {
  // Windows Java can retain its listener after Firebase's graceful shutdown.
  if (emulatorPid) { try { process.kill(emulatorPid); } catch {} }
  fs.rmSync(path.join(work, 'firebase-debug.log'), {force:true});
  process.exitCode = code ?? 1;
});
