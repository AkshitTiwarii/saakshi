import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseApiKey = String(process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '').trim();

// Firebase config from mospi-469523 project
const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: 'mospi-469523.firebaseapp.com',
  databaseURL: 'https://mospi-469523-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'mospi-469523',
  storageBucket: 'mospi-469523.firebasestorage.app',
  messagingSenderId: '952379868525',
  appId: '1:952379868525:web:8508651370d9fef9f88664',
};

if (!firebaseConfig.apiKey) {
  throw new Error('Missing EXPO_PUBLIC_FIREBASE_API_KEY for Firebase initialization.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Firebase services
export const auth = getAuth(app);
export const firestoreDb = getFirestore(
  app,
  'ai-studio-5e4fc0fd-d360-4d78-a255-fcddfc908559'
);

export default app;
