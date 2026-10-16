// Local demo project only. No production credentials, data or deployment required.
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const work = path.join(root, "output", "material-receive-rules");
fs.mkdirSync(work, { recursive: true });
fs.copyFileSync(path.join(root, "firestore.rules"), path.join(work, "firestore.rules"));
fs.writeFileSync(path.join(work, "firebase.json"), JSON.stringify({
  firestore: { rules: "firestore.rules" },
  emulators: {
    firestore: { host: "127.0.0.1", port: 8289, websocketPort: 9250 }, ui: { enabled: false },
    hub: { host: "127.0.0.1", port: 4488 }, logging: { host: "127.0.0.1", port: 4588 },
  },
}, null, 2));
const command = `${process.platform === "win32" ? "firebase.cmd" : "firebase"} emulators:exec --only firestore --project demo-material-approve --config firebase.json "node ../../scripts/test_material_receive_rules.cjs"`;
const child = spawn(command, { shell: true, cwd: work, stdio: ["ignore", "pipe", "pipe"], env: {
  ...process.env, XDG_CONFIG_HOME: path.join(work, "cli-config"), FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
} });
let output = "";
let testsSucceeded = false;
let forcedCleanup = false;
let cleanupTimer;
function stopRemainingEmulator() {
  if (process.platform !== "win32" || !testsSucceeded) return;
  const sockets = spawnSync("netstat.exe", ["-ano"], { encoding: "utf8" }).stdout || "";
  const listener = sockets.match(/TCP\s+127\.0\.0\.1:8289\s+\S+\s+LISTENING\s+(\d+)/);
  if (listener) {
    try { process.kill(Number(listener[1]), "SIGKILL"); }
    catch (error) { console.warn("Emulator cleanup:", error.message); }
  }
}
const handleOutput = (chunk) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-12000);
  if (!testsSucceeded && output.includes("All Material Firestore emulator checks passed. No production data accessed.")) {
    testsSucceeded = true;
    // Some Windows Java runtimes retain emulator listeners after the CLI sends SIGINT.
    // Stop only the process tree started by this runner if graceful shutdown stalls.
    cleanupTimer = setTimeout(() => {
      forcedCleanup = true;
      if (process.platform === "win32") {
        // Firebase may exit before Java, reparenting it outside the CLI process tree.
        // A successful emulators:exec means this runner acquired this exact local port.
        stopRemainingEmulator();
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      }
      else child.kill("SIGTERM");
    }, 5000);
  }
};
child.stdout.on("data", handleOutput);
child.stderr.on("data", handleOutput);
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("close", (code) => {
  clearTimeout(cleanupTimer);
  stopRemainingEmulator();
  process.exitCode = testsSucceeded && forcedCleanup ? 0 : (code ?? 1);
});
