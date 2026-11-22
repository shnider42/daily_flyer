// Authentication and token bucket patterns adapted from Farwake server/protocol.mjs.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export * from '../public/coop-protocol.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(){const bytes=randomBytes(6);return [...bytes].map(b=>alphabet[b&31]).join('');}
export const newPlayerId=()=>`p_${randomBytes(12).toString('hex')}`;
export const newSecret=()=>randomBytes(32).toString('base64url');
export const secretHash=secret=>createHash('sha256').update(String(secret)).digest('hex');
export function verifySecret(secret,expected){
  if(typeof secret!=='string'||secret.length<30||secret.length>120||!/^[a-f0-9]{64}$/.test(expected||''))return false;
  return timingSafeEqual(Buffer.from(secretHash(secret),'hex'),Buffer.from(expected,'hex'));
}
export function cleanName(value,fallback='Squad mate'){return String(value||fallback).replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,24)||fallback;}
export class RateLimit{
  constructor(rate,burst=rate,now=Date.now()){this.rate=rate;this.burst=burst;this.tokens=burst;this.at=now;}
  take(now=Date.now()){this.tokens=Math.min(this.burst,this.tokens+Math.max(0,now-this.at)/1000*this.rate);this.at=now;if(this.tokens<1)return false;this.tokens--;return true;}
}
