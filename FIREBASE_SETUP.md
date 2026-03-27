# Firebase Backend Setup Guide

## 📋 Prerequisites

- Firebase project: **mospi-469523**
- Firestore database: **ai-studio-5e4fc0fd-d360-4d78-a255-fcddfc908559**

## 🔑 Step 1: Download Firebase Service Account Key

The seed script uses **Firebase Admin SDK** which requires a service account key for admin-level write access to Firestore.

1. Go to [Firebase Console Service Accounts](https://console.firebase.google.com/project/mospi-469523/settings/serviceaccounts/adminsdk)
2. Click the **"Generate New Private Key"** button
3. A JSON file (`mospi-469523-*.json`) will download
4. Save it in the project root as **`serviceAccountKey.json`**

```bash
# After downloading, move it to project root:
mv ~/Downloads/mospi-469523-*.json ./serviceAccountKey.json
```

**⚠️ Keep this file secret — it contains admin credentials. It's already in `.gitignore`.**

## 🌱 Step 2: Seed Test Data

Run the seed script to populate Firestore with a test case and sample data:

```bash
npm run seed:officer-data
```

**Expected output:**
```
✅ Seed complete.
📋 Case Number: SAAK-2026-1042
👤 Victim UID: VIC-AX74-1192
👨‍💼 Officer IDs for testing: OFF-IND-221, OFF-IND-331, ADV-LEGAL-72
📄 Fragment created: <docId>
📸 Evidence created: <docId>
```

## 🧪 Step 3: Test Officer Portal Access

Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` and test with:

| Field | Value | Notes |
|-------|-------|-------|
| **Officer ID** | `OFF-IND-221` | Police officer with police_share role |
| **Role** | `Police Officer` | |
| **Purpose** | `Police Share` | Matches granted role/purpose |
| **Case Number** | `SAAK-2026-1042` | Seeded test case |

Click **"Verify Case Access"** → Should show **"✅ Access approved"**

### Try Other Officer IDs:
- `OFF-IND-331` (Police, analysis)
- `ADV-LEGAL-72` (Lawyer, lawyer_share)

## 🔗 Backend Connection Flow

```
officer-portal.tsx (Web)
    ↓ [onSnapshot listeners]
Firestore (cases/fragments/evidence)
    ↓ [live data stream]
OfficerPortal UI updates

Officer Access Check:
    ↓ [POST /api/consent/evaluate]
Backend Server (server.ts)
    ↓ [Policy evaluation + grant lookup]
Response: {approved: true/false, reason: ...}
```

## 🚀 Environment Variables (Optional)

Set via environment instead of file:

```bash
export FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"mospi-469523",...}'
npm run seed:officer-data
```

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| **"Service account key not found"** | Download and save as `serviceAccountKey.json` in project root |
| **"PERMISSION_DENIED"** | Using Web SDK (old seed script). Re-run `npm install` to get Admin SDK |
| **"Database not found"** | Firestore database ID mismatch. Verify `firestoreDatabaseId` in `firebase-applet-config.json` |
| **"Collection not found"** | Collections auto-create on first write. Seed script should create them. |

## 📚 Firestore Collections

After seeding, these collections will exist:

```
/cases/SAAK-2026-1042
  ├─ uid: "victim-test-uid-001"
  ├─ status: "Active Investigation"
  ├─ timeline: [...events...]
  └─ designatedOfficerIds: ["OFF-IND-221", "OFF-IND-331", "ADV-LEGAL-72"]

/fragments/
  └─ [auto-id]: {uid, type, content, emotion, timestamp, ...}

/evidence/
  └─ [auto-id]: {uid, source, status, details, timestamp, ...}
```

## 🔐 Firestore Security Rules (To Be Configured)

Once in production, update Firestore Security Rules for granular access:

```javascript
// Example: Allow authenticated reads, deny public writes
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;
    }
  }
}
```

Current rules allow the seed script (Admin SDK) to write. Web client (Officer Portal) has limited read-only access in development.

## 📖 Related Files

- Web Firebase config: [firebase-applet-config.json](firebase-applet-config.json)
- Consent policy: [backend/consent/consentPolicy.ts](backend/consent/consentPolicy.ts)
- Officer Portal: [src/components/OfficerPortal.tsx](src/components/OfficerPortal.tsx)
- Seed script: [scripts/seedOfficerDashboardData.ts](scripts/seedOfficerDashboardData.ts)

