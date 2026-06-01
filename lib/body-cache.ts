import { randomUUID } from 'crypto';

import { db } from './global-server-store';

export async function storePostBody(body: unknown): Promise<string> {
  const id = randomUUID();
  db.set(id, body);
  return id;
}

export async function getPostBody(docId: string): Promise<unknown | null> {
  const body = db.get(docId) ?? null;
  db.delete(docId);
  return body;
}