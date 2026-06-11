import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

// Map firebase storage emulator host to native GCP storage emulator variable
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST && !process.env.STORAGE_EMULATOR_HOST) {
  process.env.STORAGE_EMULATOR_HOST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
}

export const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'riojucu',
});

export const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'riojucu',
});

export function getSongsBucket() {
  const bucketName = process.env.JAMSHELF_STORAGE_BUCKET || 'riojucu-songs';
  return storage.bucket(bucketName);
}
