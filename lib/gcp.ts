import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

// Map firebase storage emulator host to native GCP storage emulator variable
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST && !process.env.STORAGE_EMULATOR_HOST) {
  process.env.STORAGE_EMULATOR_HOST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
}

// No hardcoded project fallback here on purpose: a missing
// GOOGLE_CLOUD_PROJECT must fail loudly, not silently default to the real
// production project. (An earlier hardcoded 'riojucu' default let an
// unconfigured local dev/test run silently read and write real production
// data — see docs/RUNBOOK.md.) Set GOOGLE_CLOUD_PROJECT and, for local
// testing, FIRESTORE_EMULATOR_HOST/FIREBASE_STORAGE_EMULATOR_HOST.
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  throw new Error(
    'GOOGLE_CLOUD_PROJECT is not set. See .env.example — for local development, ' +
    'either point it at a real project deliberately or run against the Firestore/Storage emulators.'
  );
}

export const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
});

export const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
});

export function getSongsBucket() {
  if (!process.env.JAMSHELF_STORAGE_BUCKET) {
    throw new Error('JAMSHELF_STORAGE_BUCKET is not set. See .env.example.');
  }
  return storage.bucket(process.env.JAMSHELF_STORAGE_BUCKET);
}
