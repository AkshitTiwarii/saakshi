import crypto from "crypto";
import fs from "fs";
import path from "path";

interface AnchorJob {
  caseId: string;
  uploaderId: string;
  consentVersion: string;
  blobHash: string;
  metadataHash: string;
  createdAt: string;
}

interface AnchorRecord {
  caseId: string;
  merkleRoot: string;
  leafCount: number;
  simulatedTxId: string;
  anchoredAt: string;
  proofVersion: string;
}

const queuePath = path.join(process.cwd(), "workers", "hashAnchoring", "queue.json");
const outPath = path.join(process.cwd(), "workers", "hashAnchoring", "anchors.jsonl");

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function combineHashes(left: string, right: string): string {
  return sha256Hex(`${left}${right}`);
}

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("empty");
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(combineHashes(left, right));
    }
    level = next;
  }
  return level[0];
}

function ensureFiles() {
  if (!fs.existsSync(queuePath)) fs.writeFileSync(queuePath, "[]", "utf8");
  if (!fs.existsSync(outPath)) fs.writeFileSync(outPath, "", "utf8");
}

function readQueue(): AnchorJob[] {
  ensureFiles();
  const raw = fs.readFileSync(queuePath, "utf8");
  return JSON.parse(raw) as AnchorJob[];
}

function writeQueue(jobs: AnchorJob[]) {
  fs.writeFileSync(queuePath, JSON.stringify(jobs, null, 2), "utf8");
}

function appendRecord(record: AnchorRecord) {
  fs.appendFileSync(outPath, `${JSON.stringify(record)}\n`, "utf8");
}

function buildLeaf(job: AnchorJob): string {
  return sha256Hex(
    JSON.stringify({
      caseId: job.caseId,
      uploaderId: job.uploaderId,
      consentVersion: job.consentVersion,
      blobHash: job.blobHash,
      metadataHash: job.metadataHash,
      createdAt: job.createdAt,
    })
  );
}

function simulateChainAnchor(root: string): string {
  return `sim-${sha256Hex(root).slice(0, 24)}`;
}

function run() {
  const queue = readQueue();
  if (!queue.length) {
    console.log("No pending anchoring jobs.");
    return;
  }

  const leaves = queue.map(buildLeaf);
  const root = merkleRoot(leaves);
  const txId = simulateChainAnchor(root);

  const record: AnchorRecord = {
    caseId: queue[0].caseId,
    merkleRoot: root,
    leafCount: queue.length,
    simulatedTxId: txId,
    anchoredAt: new Date().toISOString(),
    proofVersion: "0.1.0",
  };

  appendRecord(record);
  writeQueue([]);
  console.log(`Anchored ${record.leafCount} proof leaves. tx=${record.simulatedTxId}`);
}

run();
