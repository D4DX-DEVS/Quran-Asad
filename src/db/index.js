import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
// Undefined falls back to the database named in the connection string.
const dbName = process.env.MONGODB_DB;

if (!uri) throw new Error('MONGODB_URI is not set');

const client = new MongoClient(uri);
let db = null;

export const connect = async () => {
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

export const hasCollection = async (name) => {
  if (db === null) throw new Error('database not connected');
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
};

export const closeAll = () => client.close();
