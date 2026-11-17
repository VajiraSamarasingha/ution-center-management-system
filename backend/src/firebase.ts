import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID must be configured.");
}

const app = getApps()[0] ?? initializeApp({
  credential: applicationDefault(),
  projectId
});

export const auth = getAuth(app);
export const db = getFirestore(app);
