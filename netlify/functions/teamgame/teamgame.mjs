// TAKY 팀게임 API on Netlify: /team-game/api/{room,send,poll,final,qr.svg}
// Room state lives in Netlify Blobs (store "taky-teamgame", strong consistency, ETag compare-and-swap).
// Engine source of truth: team-game/ engine files are copied from the TAKY teamgame project (TWEB-20261111-0010).
import { getStore } from '@netlify/blobs';
import { handleApi } from './api.mjs';
import { blobsKV } from './engine.mjs';

let kv = null;
export default async (req) => {
  kv ||= blobsKV(getStore({ name: 'taky-teamgame', consistency: 'strong' }));
  const route = new URL(req.url).pathname.replace(/^\/team-game\/api\//, '');
  return handleApi(req, kv, route);
};

export const config = { path: '/team-game/api/*' };
