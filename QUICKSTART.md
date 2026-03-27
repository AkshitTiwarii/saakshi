# 🚀 Quick Start: Complete Backend Connection

Follow these steps to **fully connect the web app, mobile app, and backend**:

## ✅ What's Already Done

- ✅ Firebase Web SDK configured in Officer Portal ([src/firebase.ts](src/firebase.ts))
- ✅ Mobile app Firebase dependencies added ([mobile-app/package.json](mobile-app/package.json))
- ✅ Mobile Firebase service created ([mobile-app/src/services/firebaseService.ts](mobile-app/src/services/firebaseService.ts))
- ✅ Seed script upgraded to use **Admin SDK** with full write permissions
- ✅ Firestore database is reachable (mospi-469523 project)
- ✅ Web and mobile apps compile without errors
- ✅ Production build passes (1,237.97 kB)

## 📋 3-Step Setup (5 minutes)

### Step 1️⃣: Download Firebase Service Account Key

This allows the seed script to write test data with admin privileges.

1. Go to **Firebase Console** → [Service Accounts](https://console.firebase.google.com/project/mospi-469523/settings/serviceaccounts/adminsdk)
2. Click **"Generate New Private Key"** button
3. A JSON file downloads (e.g., `mospi-469523-xxxxx.json`)
4. **Move it to project root** and rename to `serviceAccountKey.json`:

   ```bash
   mv ~/Downloads/mospi-469523-*.json ./serviceAccountKey.json
   ```

   ✅ File saved. It's already in `.gitignore` — your credentials are safe.

### Step 2️⃣: Seed Test Data into Firestore

```bash
npm run seed:officer-data
```

**Expected output:**
```
✅ Seed complete.
📋 Case Number: SAAK-2026-1042
👤 Victim UID: VIC-AX74-1192
👨‍💼 Officer IDs for testing: OFF-IND-221, OFF-IND-331, ADV-LEGAL-72
📄 Fragment created: AbCdEfGhIjKlMnOpQrStUv
📸 Evidence created: XyZ12345AbCdEfGhIjKlMn
```

### Step 3️⃣: Test the Connection

#### **Test Web Portal**

```bash
npm run dev
```

Visit: **http://localhost:3000**

✅ You should see:
- Officer Dashboard opens directly
- No "No cases found" error
- Access Workbench visible
- Officer ID input field

**Test access verification:**
- Officer ID: `OFF-IND-221`
- Role: `Police Officer`
- Purpose: `Police Share`
- Case: `SAAK-2026-1042`
- Click **"Verify Case Access"**
- ✅ Result: **"✅ Access approved"**

#### **Test Mobile App**

```bash
cd mobile-app
npm run android    # Android emulator
# OR
npm run ios        # iOS simulator
```

Screen opens → App connects to the same Firestore database → Case data syncs in real-time.

## 🔗 How Everything Connects Now

```
┌──────────────────────────────────────────────────────────────┐
│                   Firebase (mospi-469523)                     │
│                                                               │
│   Firestore: ai-studio-5e4fc0fd-d360-4d78-a255-fcddfc908559  │
│   ├─ /cases       ← Web Portal reads (live sync)             │
│   ├─ /fragments   ← Mobile app reads (live sync)             │
│   ├─ /evidence    ← Both sync real-time                      │
│   └─ /grants      ← Backend checks for access control        │
└──────────────────────────────────────────────────────────────┘
      ▲                      ▲                      ▲
      │ Web SDK              │ Mobile SDK           │ Admin SDK
      │ (Client)             │ (Client)             │ (Server)
      │                      │                      │
  ┌───┴────┐            ┌────┴─────┐          ┌────┴──────┐
  │Web App │            │ Mobile   │          │ Seed      │
  │Port    │            │ App      │          │ Script    │
  └────────┘            └──────────┘          └───────────┘

Access Control Flow:
Officer Portal → POST /api/consent/evaluate → Backend → Firestore checks
                                                          ↓
                                                    Grant database lookup
                                                          ↓
                                                    Response: approved/denied
```

## 📱 Mobile & Web Data Sync

Both apps now subscribe to the **same Firestore collections**:

```typescript
// Web Portal
import { onSnapshot, collection } from 'firebase/firestore';
const unsubscribe = onSnapshot(collection(db, 'cases'), (snapshot) => {
  // Live case updates
});

// Mobile App
import { onSnapshot, collection } from 'firebase/firestore';
import { firestoreDb } from './services/firebaseService';
const unsubscribe = onSnapshot(collection(firestoreDb, 'cases'), (snapshot) => {
  // Same live case updates
});
```

**Result:** When seed script creates a case → Web portal shows it immediately → Mobile app shows it immediately (no delay).

## 🧪 Testing Scenarios

### Scenario 1: Police Officer Access ✅
- Officer ID: `OFF-IND-221`
- Role: `Police Officer`
- Purpose: `Police Share`
- Case: `SAAK-2026-1042`
- **Result:** "✅ Access approved" + shows case timeline

### Scenario 2: Lawyer Access ✅
- Officer ID: `ADV-LEGAL-72`
- Role: `Lawyer`
- Purpose: `Lawyer Share`
- Case: `SAAK-2026-1042`
- **Result:** "✅ Access approved" + shows legal notes

### Scenario 3: Unauthorized Access ❌
- Officer ID: `INVALID-ID-999`
- Any role/purpose
- Case: `SAAK-2026-1042`
- **Result:** "❌ Access denied" + reason shown

## 🐛 If Something Goes Wrong

| Error Message | Fix |
|---------------|-----|
| **"Service account key not found"** | Download JSON from Firebase Console, rename to `serviceAccountKey.json` in project root |
| **"PERMISSION_DENIED: Missing or insufficient permissions"** | Service account key is invalid. Re-download from Firebase Console |
| **"No cases appear in web portal"** | Run `npm run seed:officer-data` to populate Firestore |
| **"Mobile app won't compile"** | Run `npm install` in `mobile-app/` directory |
| **"Backend returns 404"** | Check `server.ts` is running on correct port (default: 3000) |

## 📂 Key Files Updated

- ✅ [package.json](package.json) — firebase-admin added
- ✅ [scripts/seedOfficerDashboardData.ts](scripts/seedOfficerDashboardData.ts) — Admin SDK seed script
- ✅ [mobile-app/package.json](mobile-app/package.json) — Firebase dependencies added
- ✅ [mobile-app/src/services/firebaseService.ts](mobile-app/src/services/firebaseService.ts) — Mobile Firebase config (NEW)
- ✅ [.gitignore](.gitignore) — serviceAccountKey.json protected
- ✅ [FIREBASE_SETUP.md](FIREBASE_SETUP.md) — Detailed setup guide
- ✅ [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md) — Full architecture documentation

## ✨ Next Commands

```bash
# Step 1: Download service account key and save as serviceAccountKey.json

# Step 2: Seed data
npm run seed:officer-data

# Step 3: Test web
npm run dev
# Visit http://localhost:3000

# Step 4: Test mobile (optional)
cd mobile-app
npm run android  # or npm run ios
```

## 📞 You're Done! 🎉

Both web and mobile are now **fully connected** to Firebase:
- ✅ Live case synchronization
- ✅ Real-time updates across devices  
- ✅ Officer access verification
- ✅ Firestore backend ready for production

**Questions?** See:
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) — ServiceAccountKey setup
- [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md) — Architecture & advanced config

