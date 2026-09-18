import {cookies} from 'next/headers';
import {passwordHash,passwordMatches,validPassword,createSession,tokenHash,recoveryCode,sessionCookie} from '@/lib/auth';
import {allowedOrigin,database} from '@/lib/runtime';
import {checkRequest,limit,json,ApiError,apiFailure,now} from '@/lib/server';
import {normalizePhone,textValue} from '@/lib/validation';
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){try{
 const {action}=await params;
 if(action==='logout'){
  if(!allowedOrigin(req))throw new ApiError('İstek kaynağı doğrulanamadı.',403);
  const jar=await cookies(),token=jar.get(sessionCookie)?.value;if(token)await database.prepare('DELETE FROM sessions WHERE hash=?').bind(tokenHash(token)).run();jar.delete(sessionCookie);
  return new Response(null,{status:303,headers:{Location:'/giris','Cache-Control':'no-store'}});
 }
 await checkRequest(req);const raw=await req.text();if(raw.length>10000)throw new ApiError('İstek çok büyük.',413);
 const b=JSON.parse(raw),email=textValue(b.email,3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError('Geçerli bir e-posta adresi gir.');
 if(!['register','login','recover'].includes(action))throw new ApiError('İşlem bulunamadı.',404);
 await limit('auth:global',120,60);await limit('auth:'+tokenHash(email),12,600);
 const password=validPassword(b.password);
 if(action==='register'){
  await limit('auth:register',30,3600);
  if(!['creator','clipper'].includes(b.role)||b.accepted!==true)throw new ApiError('Hesap türünü ve koşulları onayla.');
  const name=textValue(b.name,2,100),phone=normalizePhone(b.phone),id=crypto.randomUUID(),code=recoveryCode(),hash=await passwordHash(password);
  if(await database.prepare('SELECT 1 FROM credentials WHERE email=?').bind(email).first())throw new ApiError('Bu e-posta ile bir hesap var. Giriş yap veya kurtarma kodunu kullan.',409);
  await database.batch([
   database.prepare('INSERT INTO users(id,email,name,phone,role,created_at) VALUES(?,?,?,?,?,?)').bind(id,email,name,phone,b.role,now()),
   database.prepare('INSERT INTO credentials(user_id,email,password_hash,recovery_hash) VALUES(?,?,?,?)').bind(id,email,hash,tokenHash(code)),
   database.prepare('INSERT INTO audit(id,actor,action,target,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'onboard',id,'Hesap oluşturuldu.',now())
  ]);await createSession(id);return json({ok:true,recoveryCode:code});
 }
 const credential=await database.prepare('SELECT c.*,u.status FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.email=?').bind(email).first<any>();
 if(action==='login'){
  const ok=await passwordMatches(password,credential?.password_hash||'scrypt:00000000000000000000000000000000:'+ '0'.repeat(128));
  if(!credential||!ok||credential.status!=='active')throw new ApiError('E-posta veya şifre hatalı ya da hesap kullanıma kapalı.',401);
  await createSession(credential.user_id);return json({ok:true});
 }
 const supplied=typeof b.recoveryCode==='string'?b.recoveryCode.trim():'';
 if(!credential||supplied.length>100||tokenHash(supplied)!==credential.recovery_hash||credential.status!=='active')throw new ApiError('Hesap veya kurtarma kodu doğrulanamadı.',401);
 const replacement=recoveryCode(),hash=await passwordHash(password);
 await database.batch([
  database.prepare('INSERT INTO operations(id,actor,action,created_at) VALUES(?,?,?,?)').bind('recovery:'+credential.recovery_hash,credential.user_id,'password_recovery',now()),
  database.prepare('UPDATE credentials SET password_hash=?,recovery_hash=? WHERE user_id=?').bind(hash,tokenHash(replacement),credential.user_id),
  database.prepare('DELETE FROM sessions WHERE user_id=?').bind(credential.user_id),
  database.prepare('INSERT INTO audit(id,actor,action,target,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),credential.user_id,'password_recovery',credential.user_id,'Şifre yenilendi; açık oturumlar kapatıldı.',now())
 ]);return json({ok:true,recoveryCode:replacement});
 }catch(e){return apiFailure(e);}}
