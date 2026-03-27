const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function post(path: string, body: Record<string, unknown>) {
  const caseId = String(body.caseId || "demo-case-001");
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "demo-survivor-1",
      "x-user-role": "survivor",
      "x-case-id": caseId,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function run() {
  const checks = [
    {
      path: "/api/ml/legal-predict",
      body: {
        caseId: "demo-case-001",
        text: "He threatened me near the market after Diwali and kept stalking me.",
      },
    },
    {
      path: "/api/ml/temporal-normalize",
      body: {
        caseId: "demo-case-001",
        phrase: "after Diwali",
      },
    },
    {
      path: "/api/ml/trauma-assess",
      body: {
        caseId: "demo-case-001",
        text: "I had panic and shaking and could not remember exact order.",
      },
    },
    {
      path: "/api/ml/distress-calibrate",
      body: {
        caseId: "demo-case-001",
        transcript: "I was terrified and crying and could not breathe.",
        pauseRate: 0.9,
        silenceRatio: 0.5,
      },
    },
  ];

  for (const check of checks) {
    const result = await post(check.path, check.body);
    console.log(`\n${check.path} -> ${result.status}`);
    console.log(JSON.stringify(result.data, null, 2));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
