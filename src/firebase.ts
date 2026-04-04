import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const viteEnv = (import.meta as any).env || {};
const firebaseApiKey = String(viteEnv.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey || '').trim();
const runtimeFirebaseConfig = {
  ...firebaseConfig,
  apiKey: firebaseApiKey,
};

if (!runtimeFirebaseConfig.apiKey) {
  throw new Error('Missing VITE_FIREBASE_API_KEY for Firebase initialization.');
}

const app = initializeApp(runtimeFirebaseConfig);
const firestoreDatabaseId =
  typeof runtimeFirebaseConfig.firestoreDatabaseId === 'string' ? runtimeFirebaseConfig.firestoreDatabaseId : '(default)';
export const db =
  firestoreDatabaseId && firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firestoreDatabaseId)
    : getFirestore(app);
export const auth = getAuth(app);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
