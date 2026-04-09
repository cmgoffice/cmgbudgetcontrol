// @ts-nocheck
const fs = require('fs');
const path = 'src/views/ReceiveView.tsx';
let code = fs.readFileSync(path, 'utf8');

const OLD = `po.projectId === selectedProjectId && po.status === "Approved"`;
const NEW = `po.projectId === selectedProjectId && po.status === "Approved" && po.poType !== "SP" && po.poType !== "DC"`;

if (code.includes(OLD)) {
  code = code.replace(OLD, NEW);
  fs.writeFileSync(path, code);
  console.log('Done: SP/DC filtered from ReceiveView');
} else {
  console.log('Pattern not found!');
}
