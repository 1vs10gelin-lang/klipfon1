export function validateIban(value:string){const iban=value.replace(/\s/g,'').toUpperCase();if(!/^TR\d{24}$/.test(iban))return false;const n=iban.slice(4)+'2927'+iban.slice(2,4);let mod=0;for(const c of n)mod=(mod*10+Number(c))%97;return mod===1;}
export function moneyCents(value:unknown,min=1,max=100000000){const str=String(value??'').trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(str))throw new Error('Tutarı en fazla iki ondalık basamakla yaz.');const cents=Math.round(Number(str)*100);if(!Number.isSafeInteger(cents)||cents<min||cents>max)throw new Error('Tutar izin verilen aralığın dışında.');return cents;}
export function safeUrl(raw:string){let u:URL;try{u=new URL(raw)}catch{throw Error('Geçerli bir https bağlantısı gir.')}if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname)||u.hostname.endsWith('.local'))throw Error('Geçerli bir https bağlantısı gir.');return u.href;}
export function videoIdentity(raw:string,platform:string){const u=new URL(safeUrl(raw));let key='';if(platform==='YouTube'){if(u.hostname==='youtu.be')key=u.pathname.split('/')[1]||'';else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname))key=u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1]||'';if(!/^[\w-]{11}$/.test(key))throw Error('Tam YouTube video veya Shorts bağlantısını gir.');return 'youtube:'+key;}
if(platform==='TikTok'&&['www.tiktok.com','tiktok.com'].includes(u.hostname)){key=u.pathname.match(/\/video\/(\d+)/)?.[1]||'';if(key)return 'tiktok:'+key;}
if(platform==='Instagram'&&['www.instagram.com','instagram.com'].includes(u.hostname)){key=u.pathname.match(/^\/(?:reel|reels|p)\/([\w-]+)/)?.[1]||'';if(key)return 'instagram:'+key;}
throw Error('Seçilen platformdaki videonun tam paylaşım bağlantısını gir. Kısa yönlendirme bağlantıları kabul edilmez.');}
export function textValue(v:unknown,min=1,max=500){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw Error(`Metin ${min}–${max} karakter olmalı.`);return v.trim();}
export function fee(amount:number,bps:number){return Math.floor((amount*bps+9999)/10000);}

export function normalizePhone(value:unknown){
 if(typeof value!=='string'||value.length>40)throw Error('Telefon numaranı gir.');
 const raw=value.trim();
 if(!raw||!/^[+0-9()\s-]+$/.test(raw))throw Error('Geçerli bir telefon numarası gir.');
 let phone=raw.replace(/[()\s-]/g,'');
 if(phone.startsWith('00'))phone='+'+phone.slice(2);
 if(/^0[2-5]\d{9}$/.test(phone))phone='+90'+phone.slice(1);
 else if(/^[2-5]\d{9}$/.test(phone))phone='+90'+phone;
 else if(/^90[2-5]\d{9}$/.test(phone))phone='+'+phone;
 if(!/^\+[1-9]\d{7,14}$/.test(phone)||(phone.startsWith('+90')&&!/^\+90[2-5]\d{9}$/.test(phone)))throw Error('Telefon numaranı ülke koduyla doğru gir. Türkiye örneği: 05xx xxx xx xx.');
 return phone;
}
