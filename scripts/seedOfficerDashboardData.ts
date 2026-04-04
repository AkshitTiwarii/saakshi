import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

async function seed() {
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));

  // Load service account key from environment or file
  let serviceAccount: any;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } else {
    const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
      console.error(
        '❌ Service account key not found at serviceAccountKey.json\n' +
        'Download it from Firebase Console:\n' +
        '1. Go to https://console.firebase.google.com/project/mospi-469523/settings/serviceaccounts/adminsdk\n' +
        '2. Click "Generate New Private Key"\n' +
        '3. Save JSON as "serviceAccountKey.json" in project root\n'
      );
      process.exit(1);
    }
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  }

  // Initialize Firebase Admin SDK
  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: firebaseConfig.projectId,
  });

  // Get Firestore instance
  let firestoreDb;
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    firestoreDb = getFirestore(app);
  }

  const uid = 'victim-test-uid-001';
  const now = FieldValue.serverTimestamp();

  const caseDoc = {
    uid,
    caseNumber: 'SAAK-2026-1042',
    victimUniqueId: 'VIC-AX74-1192',
    status: 'Active Investigation',
    priority: 'High',
    region: 'Delhi North Cluster',
    assignedRoles: ['Police Officer', 'Law Enforcement Agent', 'Lawyer'],
    designatedOfficerIds: ['OFF-IND-221', 'OFF-IND-331', 'ADV-LEGAL-72'],
    evidenceSummary: [
      'Voice statements transcribed and verified',
      'Geo-tagged uploads metadata locked',
      'Cross-examination prep generated',
    ],
    timeline: [
      { at: '24 Mar, 20:14', event: 'Victim safe login generated UID and opened case.' },
      { at: '24 Mar, 20:32', event: 'First narrative captured via guided voice intake.' },
      { at: '25 Mar, 09:41', event: 'Emotional NLP insights recalibrated.' },
    ],
    emotionalInsights: {
      dominantEmotion: 'High Distress with Controlled Speech',
      confidence: 0.89,
      trend: 'Stabilizing after second intake session',
      nlpSummary: 'Fear markers detected with long pauses; trauma-sensitive questioning recommended.',
    },
    integrity: {
      merkleRoot: '0xfeb1...2dc9',
      latestHash: '0x91ac...0f11',
      anchoredAt: 'Polygon PoS - Block #68299412',
      tamperDetected: false,
    },
    assistants: {
      virodhiStatus: 'Active',
      pareekshaStatus: 'Active',
      judgeNotes: 'Pause hearing if crying markers or prolonged silence are detected.',
      lawyerNotes: 'Generated contradiction checks and admissible question prompts.',
    },
    strengthScore: 76,
    createdAt: now,
    updatedAt: now,
  };

  await firestoreDb.collection('cases').doc(caseDoc.caseNumber).set(caseDoc, { merge: true });

  const fragmentRef = await firestoreDb.collection('fragments').add({
    uid,
    type: 'text',
    content: 'I remember loud music near the market around evening and a sudden argument.',
    emotion: 'fear',
    timestamp: now,
    classification: {
      time: 'Evening',
      location: 'Market area',
      sensory: ['loud music', 'crowd noise'],
    },
  });

  const evidenceRef = await firestoreDb.collection('evidence').add({
    uid,
    source: 'GoogleMaps',
    status: 'verified',
    details: 'Traffic route and stop points aligned with timeline.',
    timestamp: now,
  });

  console.log('✅ Seed complete.');
  console.log(`📋 Case Number: ${caseDoc.caseNumber}`);
  console.log(`👤 Victim UID: ${caseDoc.victimUniqueId}`);
  console.log(`👨‍💼 Officer IDs for testing: ${caseDoc.designatedOfficerIds.join(', ')}`);
  console.log(`📄 Fragment created: ${fragmentRef.id}`);
  console.log(`📸 Evidence created: ${evidenceRef.id}`);
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
