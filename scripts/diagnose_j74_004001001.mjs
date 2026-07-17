import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deleteApp, initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore, query, where } from "firebase/firestore";

const TARGET_JOB = process.argv[2] || "J-74";
const TARGET_CODE = process.argv[3] || "004001001";

function loadEnv() {
  const env = { ...process.env };
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountOf(subItem) {
  const stored = Number(subItem?.amount);
  return Number.isFinite(stored)
    ? stored
    : number(subItem?.quantity) * number(subItem?.unitPrice);
}

function money(value) {
  return number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isTargetProject(project) {
  const target = normalize(TARGET_JOB).replace(/\s/g, "");
  return [project.id, project.jobNo, project.code, project.name]
    .map((value) => normalize(value).replace(/\s/g, ""))
    .some((value) => value === target || value.includes(target));
}

const env = loadEnv();
const appId = env.REACT_APP_APP_ID || "cmg-budget-control-default";
const app = initializeApp({
  apiKey: env.REACT_APP_FIREBASE_API_KEY,
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.REACT_APP_FIREBASE_APP_ID,
});
const db = getFirestore(app);
const dataCollection = (name) => collection(db, "artifacts", appId, "public", "data", name);

async function readCollection(name, constraint = null) {
  const ref = dataCollection(name);
  const snapshot = await getDocs(constraint ? query(ref, constraint) : ref);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function main() {
  console.log("READ-ONLY DIAGNOSTIC (uses getDocs only)");
  console.log(`Target: project=${TARGET_JOB}, costCode=${TARGET_CODE}\n`);

  const projects = await readCollection("projects");

  const exactProjectMatches = projects.filter(
    (project) => normalize(project.id).replace(/\s/g, "") === normalize(TARGET_JOB).replace(/\s/g, "")
  );
  const matchingProjects = exactProjectMatches.length > 0
    ? exactProjectMatches
    : projects.filter(isTargetProject);
  if (matchingProjects.length === 0) {
    console.error(`Project ${TARGET_JOB} was not found.`);
    process.exitCode = 2;
    return;
  }

  console.log("Projects:");
  for (const project of matchingProjects) {
    console.log(`- id=${project.id} jobNo=${project.jobNo || "-"} name=${project.name || "-"}`);
  }

  const projectIds = new Set(matchingProjects.map((project) => project.id));
  const [projectBudgetGroups, projectLogGroups] = await Promise.all([
    Promise.all([...projectIds].map((projectId) => readCollection("budgets", where("projectId", "==", projectId)))),
    Promise.all([...projectIds].map((projectId) => readCollection("logs", where("projectId", "==", projectId)))),
  ]);
  const projectBudgets = projectBudgetGroups.flat();
  const logs = projectLogGroups.flat();
  const targets = projectBudgets.filter((budget) => String(budget.code) === TARGET_CODE);

  console.log(`\nMatching budget documents: ${targets.length}`);
  if (targets.length === 0) {
    process.exitCode = 3;
    return;
  }

  for (const budget of targets) {
    const subItems = Array.isArray(budget.subItems) ? budget.subItems : [];
    const mainAmount = number(budget.amount);
    const subTotal = subItems.reduce((sum, item) => sum + amountOf(item), 0);
    const balance = mainAmount - subTotal;

    console.log("\n============================================================");
    console.log(`Budget document: ${budget.id}`);
    console.log(`Description: ${budget.description || "-"}`);
    console.log(`Status: ${budget.status || "-"}`);
    console.log(`Main amount: ${money(mainAmount)}`);
    console.log(`Sub-items total: ${money(subTotal)}`);
    console.log(`Calculated balance: ${money(balance)}`);
    console.log(`Violation: ${subTotal > mainAmount ? `YES (over ${money(subTotal - mainAmount)})` : "NO"}`);
    console.log(`Budget timestamps: createdAt=${budget.createdAt || "-"} updatedAt=${budget.updatedAt || "-"}`);

    const returnNotifications = Array.isArray(budget.budgetReturnNotifications)
      ? budget.budgetReturnNotifications
      : [];
    console.log(`\nBudget return notifications: ${returnNotifications.length}`);
    for (const item of returnNotifications) {
      console.log(
        `- id=${item.id || "-"} | pr=${item.prNo || item.prId || "-"} | ` +
        `subItemId=${item.subItemId || "MAIN"} | amount=${money(item.amount)} | ` +
        `status=${item.status || "pending"} | createdAt=${item.createdAt || "-"} | acceptedAt=${item.acceptedAt || "-"}`
      );
    }

    console.log("\nSub-items:");
    subItems.forEach((item, index) => {
      const calculated = number(item.quantity) * number(item.unitPrice);
      console.log(
        `${index + 1}. id=${item.id || "-"} | ${item.description || "-"} | ` +
        `qty=${number(item.quantity)} unitPrice=${money(item.unitPrice)} | ` +
        `stored=${money(item.amount)} calculated=${money(calculated)} | status=${item.status || "-"}`
      );
    });

    const tokens = [budget.id, budget.code, budget.description]
      .map(normalize)
      .filter(Boolean);
    const relatedLogs = logs
      .filter((log) => {
        if (log.projectId && projectIds.has(log.projectId)) return true;
        const details = normalize(log.details);
        return tokens.some((token) => details.includes(token));
      })
      .filter((log) => {
        const details = normalize(log.details);
        return details.includes(normalize(TARGET_CODE)) || details.includes(normalize(budget.id));
      })
      .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));

    console.log(`\nRelated logs containing cost code/document id: ${relatedLogs.length}`);
    for (const log of relatedLogs) {
      console.log(
        `- ${log.timestamp || "-"} | ${log.action || "-"} | ${log.user || "-"} (${log.role || "-"}) | ${log.details || "-"}`
      );
    }
    if (relatedLogs.length === 0) {
      console.log("- No matching audit log. Direct updateDoc sub-item writes are not automatically logged.");
    }
  }

  const allViolations = projectBudgets
    .map((budget) => {
      const subItems = Array.isArray(budget.subItems) ? budget.subItems : [];
      const main = number(budget.amount);
      const subs = subItems.reduce((sum, item) => sum + amountOf(item), 0);
      return { id: budget.id, code: budget.code, description: budget.description, main, subs, over: subs - main };
    })
    .filter((item) => item.over > 0)
    .sort((a, b) => b.over - a.over);

  console.log(`\nAll J-74 budgets with sub-total over main: ${allViolations.length}`);
  for (const item of allViolations) {
    console.log(`- ${item.code} | ${item.description || "-"} | over=${money(item.over)} | doc=${item.id}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await deleteApp(app);
  });
