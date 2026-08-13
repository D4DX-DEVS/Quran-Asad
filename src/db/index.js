import { MongoClient } from 'mongodb';

import { config } from '../config.js';

const { uri, dbName } = config.mongo;

// Built on connect() rather than at import, so a missing URI is reported by the
// config check with everything else that is wrong, instead of throwing from
// here the moment a route module is imported.
let client = null;
let db = null;

export const connect = async () => {
  if (!uri) throw new Error('MONGODB_URI is not set');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
};

export const col = (name) => {
  if (db === null) throw new Error('database not connected');
  return db.collection(name);
};

// Every response drops Mongo's `_id` and the search columns the migration
// precomputed; the API's JSON shape predates both and the clients do not
// expect them.
const hidden = { _id: 0, search_text: 0, search_arabic: 0, search_content: 0 };

const merge = (options) => {
  if (!options?.projection) return { ...options, projection: hidden };
  // An explicit projection already names what it wants, so only `_id` needs
  // suppressing — mixing the exclusions above into an inclusion is illegal.
  return { ...options, projection: { _id: 0, ...options.projection } };
};

export const all = (name, filter = {}, options) =>
  col(name).find(filter, merge(options)).toArray();

export const one = async (name, filter = {}, options) =>
  (await col(name).findOne(filter, merge(options))) ?? null;

export const ping = async () => {
  try {
    if (db === null) return false;
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
};

export const hasCollection = async (name) => {
  if (db === null) throw new Error('database not connected');
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
};

export const closeAll = async () => {
  if (client) await client.close();
};
