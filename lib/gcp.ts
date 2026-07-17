import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

// Map firebase storage emulator host to native GCP storage emulator variable
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST && !process.env.STORAGE_EMULATOR_HOST) {
  process.env.STORAGE_EMULATOR_HOST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
}

let cachedDb: Firestore | null = null;
let cachedStorage: Storage | null = null;

// No hardcoded project fallback here on purpose: a missing GOOGLE_CLOUD_PROJECT
// must fail loudly at request time, not silently default to the real
// production project. (An earlier hardcoded 'riojucu' default let an
// unconfigured local dev/test run silently read and write real production
// data — see docs/RUNBOOK.md.) Set GOOGLE_CLOUD_PROJECT and, for local
// testing, FIRESTORE_EMULATOR_HOST/FIREBASE_STORAGE_EMULATOR_HOST.
//
// This check is deliberately deferred to first use (not top-level module
// scope): Next.js evaluates API route modules during `next build`'s page
// data collection, and the build environment doesn't have runtime env vars
// like GOOGLE_CLOUD_PROJECT available — only the deployed container does.
// A top-level throw here breaks the production build itself.
function requireProjectId(): string {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT is not set. See .env.example — for local development, ' +
      'either point it at a real project deliberately or run against the Firestore/Storage emulators.'
    );
  }
  return projectId;
}

export function getDb(): Firestore {
  if (!cachedDb) cachedDb = new Firestore({ projectId: requireProjectId() });
  return cachedDb;
}

export function getStorage(): Storage {
  if (!cachedStorage) cachedStorage = new Storage({ projectId: requireProjectId() });
  return cachedStorage;
}

export function getSongsBucket() {
  const bucketName = process.env.JAMSHELF_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('JAMSHELF_STORAGE_BUCKET is not set. See .env.example.');
  }
  return getStorage().bucket(bucketName);
}
