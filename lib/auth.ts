import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {database} from './runtime';
export const sessionCookie='klipfon_session';
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const recoveryCode=()=>randomBytes(24).toString('base64url');
export function validPassword(value:unknown):string{if(typeof value!=='string'||value.length<12||value.length>128)throw Error('Şifren 12–128 karakter olmalı.');return value;}
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return 'scrypt:'+salt+':'+(await derive(password,salt)).toString('hex');}
export async function passwordMatches(password:string,stored:string){const [kind,salt,expected]=stored.split(':');if(kind!=='scrypt'||!salt||!expected)return false;const result=await derive(password,salt),target=Buffer.from(expected,'hex');return result.length===target.length&&timingSafeEqual(result,target);}
export async function createSession(userId:string){const token=randomBytes(32).toString('base64url'),now=Math.floor(Date.now()/1000);await database.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now).run();await database.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash(token),userId,now+2592000).run();(await cookies()).set(sessionCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:2592000});}
export async function getCurrentUser(){const token=(await cookies()).get(sessionCookie)?.value;if(!token||token.length>100)return null;const user=await database.prepare('SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?').bind(tokenHash(token),Math.floor(Date.now()/1000)).first<any>();return user?{userId:user.id,email:user.email,fullName:user.name,displayName:user.name}:null;}
export function safeReturnTo(value:string){if(!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/panel';const u=new URL(value,'https://local.invalid');if(u.origin!=='https://local.invalid'||/^\/(?:api|giris|kayit|kurtarma)(?:\/|$)/.test(u.pathname))return '/panel';return u.pathname+u.search;}
export function signInPath(returnTo='/panel'){return '/giris?return_to='+encodeURIComponent(safeReturnTo(returnTo));}
export async function requireCurrentUser(returnTo:string){const user=await getCurrentUser();if(user)return user;redirect(signInPath(returnTo));}
