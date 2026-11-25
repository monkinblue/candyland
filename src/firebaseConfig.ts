import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

/**
 * Live Firebase Realtime Database configuration for Candyland Family Adventure
 * (Project: emma-dawson-candyland, Region: us-central1).
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyBW1OSX301c0WlzOhhtX8lUbFGB670kGuE',
  authDomain: 'emma-dawson-candyland.firebaseapp.com',
  databaseURL: 'https://emma-dawson-candyland-default-rtdb.firebaseio.com',
  projectId: 'emma-dawson-candyland',
  storageBucket: 'emma-dawson-candyland.firebasestorage.app',
  messagingSenderId: '424504676897',
  appId: '1:424504676897:web:51a13a3bebf8332e3c8960',
};

export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId
);

let appInstance: FirebaseApp | null = null;
let databaseInstance: Database | null = null;

if (isFirebaseConfigured) {
  appInstance = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  databaseInstance = getDatabase(appInstance);
}

export const app: FirebaseApp | null = appInstance;
export const database: Database | null = databaseInstance;
