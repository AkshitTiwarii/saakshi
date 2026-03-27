# Backend Integration Guide

This document explains how to connect the web (Officer Portal) and mobile app to the Firebase backend.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Firebase Project: mospi-469523                │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Firestore Database                         │ │
│  │    ID: ai-studio-5e4fc0fd-d360-4d78-a255-fcddfc908559       │ │
│  │                                                               │ │
│  │  Collections:                                                │ │
│  │  ├─ /cases         (victim cases, status, timeline)          │ │
│  │  ├─ /fragments     (victim narratives & voice intake)        │ │
│  │  ├─ /evidence      (verified documents & media)             │ │
│  │  └─ /grants        (consent grants by officer ID)            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Realtime Database (RTDB)                        │ │
│  │    https://mospi-469523-default-rtdb...firebasedatabase.app  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │            Authentication (Firebase Auth)                    │ │
│  │         Email/Password, Anonymous Sign-in                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          ▲                              ▲                      ▲
          │ Live Listeners              │ HTTP Calls          │ Admin
          │ (onSnapshot)               │ (Officer Access)     │ SDK
          │                            │                      │
    ┌─────┴──────────┐          ┌──────┴──────────┐    ┌──────┴──────┐
    │  Web Portal    │          │  Backend Server │    │    Seed     │
    │  (React/Vite)  │          │  (Express.ts)   │    │   Script    │
    │                │          │                │    │             │
    │ /src/          │          │ /server.ts      │    │ /scripts/   │
    └────────────────┘          └─────────────────┘    └─────────────┘
         ▲                              ▲                      ▲
         │                              │                      │
         │ Firestore Config             │ Express Middleware   │ Admin
         │ (firebase-applet-config.json)│ (consentMiddleware)  │ Creds
         │                              │                      │
    ┌────────────────────────────────────────────────────────────┐
    │                  Git Repository (Saakshi-Main)             │
    │                                                             │
    │   ./firebase-applet-config.json      ← Web config          │
    │   ./serviceAccountKey.json           ← Admin creds (local) │
    │   ./mobile-app/src/services/          ← Mobile config      │
    │   ./scripts/seedOfficerDashboardData.ts ← Seed utility     │
    └────────────────────────────────────────────────────────────┘
```

## 🔌 Connection Points

### 1. **Web Portal → Firestore (Live Sync)**

**File:** [src/components/OfficerPortal.tsx](src/components/OfficerPortal.tsx)

```typescript
// Officer portal subscribes to live case updates
useEffect(() => {
  const unsubscribeCases = onSnapshot(collection(db, 'cases'), (snapshot) => {
    const cases = snapshot.docs.map(doc => doc.data());
    setCases(cases);
  });
  return unsubscribeCases;
}, []);
```

**Config:** [firebase-applet-config.json](firebase-applet-config.json)
- `projectId`: mospi-469523
- `firestoreDatabaseId`: ai-studio-5e4fc0fd-d360-4d78-a255-fcddfc908559
- `databaseURL`: https://mospi-469523-default-rtdb.asia-southeast1.firebasedatabase.app

### 2. **Officer Portal → Backend Server (Access Verification)**

**Flow:**
```
Officer Portal
    ↓ POST /api/consent/evaluate
Backend Server (server.ts)
    ↓ consentMiddleware.ts validates policy
    ↓ Checks designated officer IDs
    ↓ Verifies role scope (police_share, lawyer_share, etc.)
    ↓ Checks active grants from consent-grants.json
Response: { approved: true/false, reason: "..." }
```

**Code:** [src/components/OfficerPortal.tsx](src/components/OfficerPortal.tsx#L327)
```typescript
const runAccessCheck = async () => {
  const evalResp = await fetch('/api/consent/evaluate', {
    method: 'POST',
    body: JSON.stringify({
      actorId: officerId.trim(),
      actorRole,
      caseId: matchedCase.caseNumber,
      purpose,
      requestedFields: ['full_case_timeline', 'victim_media', 'ai_analysis'],
    }),
  });
};
```

### 3. **Mobile App → Firestore (React Native)**

**File:** [mobile-app/src/services/firebaseService.ts](mobile-app/src/services/firebaseService.ts)

```typescript
import { getFirestore } from 'firebase/firestore';

export const firestoreDb = getFirestore(
  app,
  'ai-studio-5e4fc0fd-d360-4d78-a255-fcddfc908559'
);
```

Mobile screens can now subscribe to Firestore collections:
```typescript
import { collection, onSnapshot } from 'firebase/firestore';
import { firestoreDb } from '../services/firebaseService';

const unsubscribe = onSnapshot(collection(firestoreDb, 'cases'), (snapshot) => {
  const cases = snapshot.docs.map(doc => doc.data());
  setCases(cases);
});
```

### 4. **Seed Script → Firestore (Admin SDK)**

**File:** [scripts/seedOfficerDashboardData.ts](scripts/seedOfficerDashboardData.ts)

Uses Firebase Admin SDK with service account credentials:
```typescript
import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: firebaseConfig.databaseURL,
});

const db = admin.firestore(firebaseConfig.firestoreDatabaseId);
await db.collection('cases').doc('SAAK-2026-1042').set(caseDoc);
```

## 📱 Mobile App Setup

### Prerequisites
- React Native / Expo development environment
- Node.js & npm

### Installation

1. Navigate to mobile app:
   ```bash
   cd mobile-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Firebase is now configured. Start development server:
   ```bash
   npm start           # Expo dev server
   npm run android     # Android emulator
   npm run ios         # iOS simulator
   ```

### Mobile App → Backend Connection

Mobile screens can now access live case data:

```typescript
// Example: CaptureDrawScreen.tsx
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { firestoreDb } from '../../services/firebaseService';

export function CaptureDrawScreen() {
  const [cases, setCases] = useState([]);

  useEffect(() => {
    // Listen to cases collection
    const q = query(collection(firestoreDb, 'cases'), where('status', '==', 'Active Investigation'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCases(snapshot.docs.map(doc => doc.data()));
    });
    
    return unsubscribe;
  }, []);

  return (
    <View>
      {cases.map(caseData => (
        <Text key={caseData.caseNumber}>{caseData.caseNumber}</Text>
      ))}
    </View>
  );
}
```

## 🌐 Web Portal Setup

### Prerequisites
- Node.js & npm

### Installation

1. Navigate to web project root:
   ```bash
   cd saakshi
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Download Firebase service account key (for seeding):
   - Go to [Firebase Console](https://console.firebase.google.com/project/mospi-469523/settings/serviceaccounts/adminsdk)
   - Click "Generate New Private Key"
   - Save as `serviceAccountKey.json` in project root

4. Seed test data:
   ```bash
   npm run seed:officer-data
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

6. Visit `http://localhost:3000` → Officer Portal opens with live Firestore data

## 🔐 Firestore Security Rules

Currently, the development setup allows:
- **Admin SDK** (seed script): Full write access ✅
- **Web SDK** (officer portal): Read-only access ✅
- **Mobile SDK**: Read-only access (once configured per app) ✅

For production, implement granular Firestore Security Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cases: Allow authenticated reads
    match /cases/{caseId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;
    }
    
    // Grants: Officer-specific access
    match /grants/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;
    }
    
    // Default: Deny all
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## ✅ Verification Checklist

- [ ] Firebase config updated in both web and mobile
- [ ] Servicekey downloaded and saved as `serviceAccountKey.json`
- [ ] `npm install` completed in both `saakshi/` and `mobile-app/`
- [ ] `npm run seed:officer-data` executed successfully
- [ ] Web portal loads at http://localhost:3000
- [ ] Officer portal shows live cases from Firestore
- [ ] Access verification returns "Access approved" for test officer IDs
- [ ] Mobile app compiles without errors
- [ ] Mobile app can fetch Firestore collections

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Web: "Firestore initialization failed"** | Check `firebase-applet-config.json` has correct `firestoreDatabaseId` |
| **Web: "No cases in collection"** | Run `npm run seed:officer-data` to populate data |
| **Mobile: Firebase import errors** | Run `npm install` in `mobile-app/` directory |
| **Seed: "PERMISSION_DENIED"** | Service account key not found or invalid. Re-download from Firebase Console |
| **Mobile: Collection access denied** | Firestore Security Rules may be too restrictive. Check rules in Firebase Console |

## 📚 File Reference

| File | Purpose |
|------|---------|
| [firebase-applet-config.json](firebase-applet-config.json) | Web/React config for Officer Portal |
| [mobile-app/src/services/firebaseService.ts](mobile-app/src/services/firebaseService.ts) | React Native config for mobile app |
| [scripts/seedOfficerDashboardData.ts](scripts/seedOfficerDashboardData.ts) | Admin SDK script to populate Firestore |
| [src/components/OfficerPortal.tsx](src/components/OfficerPortal.tsx) | Web portal with live Firestore subscriptions |
| [backend/consent/consentMiddleware.ts](backend/consent/consentMiddleware.ts) | Officer access validation logic |
| [src/firebase.ts](src/firebase.ts) | Web Firebase initialization |

## 🚀 Next Steps

1. **Download service account key** → Firebase Console → Service Accounts
2. **Run seed script** → `npm run seed:officer-data`
3. **Test web portal** → `npm run dev` → http://localhost:3000
4. **Test mobile app** → `cd mobile-app && npm start`
5. **Configure production rules** → Update Firestore Security Rules in Console

