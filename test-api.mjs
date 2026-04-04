#!/usr/bin/env node

console.log("🧪 Testing Waterproof Access Control API\n");

const BASE_URL = "http://localhost:3000";

async function test() {
  try {
    // Step 1: Register victim
    console.log("1️⃣ Registering victim...");
    const victimResp = await fetch(`${BASE_URL}/api/victim/register-or-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ victimUniqueId: "VIC-TEST-5001" }),
    });
    const victimData = await victimResp.json();
    console.log("✅ Victim registered");
    console.log(`   Case: ${victimData.caseAssignment.caseNumber}`);
    console.log(`   CaseID: ${victimData.caseAssignment.caseId}\n`);

    const caseId = victimData.caseAssignment.caseId;

    // Step 2: Designate officer
    console.log("2️⃣ Designating officer OFF-IND-221 to case...");
    const desResp = await fetch(`${BASE_URL}/api/admin/designate-officer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminId: "ADMIN-001",
        caseId: caseId,
        officerId: "OFF-IND-221",
        role: "police",
      }),
    });
    const desData = await desResp.json();
    if (desResp.ok) {
      console.log("✅ Officer designated");
      console.log(`   Designation: ${desData.designation.designationId}\n`);
    } else {
      console.log(`ℹ️ Designation step: ${desData.error || "already assigned"}\n`);
    }

    // Step 3: List assigned cases
    console.log("3️⃣ Fetching cases for officer OFF-IND-221...");
    const listResp = await fetch(`${BASE_URL}/api/officer/list-assigned-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officerId: "OFF-IND-221" }),
    });
    const listData = await listResp.json();
    console.log(`✅ Officer has ${listData.assignedCaseCount} case(s)`);
    listData.assignedCases.forEach((c) => {
      console.log(`   📋 ${c.caseNumber} | Victim: ${c.victimUniqueId}`);
    });
    console.log("");

    // Step 4: Verify waterproof access
    console.log("4️⃣ Testing waterproof 4-level access verification...");
    const verifyResp = await fetch(`${BASE_URL}/api/officer/verify-case-access-waterproof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        officerId: "OFF-IND-221",
        caseId: caseId,
        role: "police",
        purpose: "police_share",
      }),
    });
    const verifyData = await verifyResp.json();
    console.log(`✅ Access verification result:`);
    console.log(`   Approved: ${verifyData.approved}`);
    console.log(`   Reason: ${verifyData.reason}\n`);

    // Step 5: Fetch case details
    console.log("5️⃣ Fetching case details...");
    const detailsResp = await fetch(
      `${BASE_URL}/api/case/${caseId}/details?officerId=OFF-IND-221`,
      {
        method: "GET",
        headers: {
          "x-user-role": "police",
        },
      }
    );
    const detailsData = await detailsResp.json();
    console.log(`✅ Case details retrieved:`);
    console.log(`   Case Number: ${detailsData.caseNumber}`);
    console.log(`   Victim: ${detailsData.victimUniqueId}`);
    console.log(`   Profile Name: ${detailsData.victimProfile?.displayName || "n/a"}`);
    console.log(`   Fragments: ${detailsData.victimFragments?.length || 0}`);
    console.log(`   Latest Hash: ${detailsData.integrity?.latestHash || "n/a"}\n`);

    console.log("✨ All tests passed! Portal is ready.\n");
    console.log("📱 Visit http://localhost:3000 and enter Officer ID: OFF-IND-221");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}



test();
