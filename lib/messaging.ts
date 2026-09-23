import {one,rows,ApiError,now,db,transaction,type Row} from './server';
import {textValue} from './validation';
export const messagingNotice='Mesajlar kalıcı olarak saklanır; kullanıcılar mesajları silemez veya değiştiremez. Yetkili Klipfon yöneticileri güvenlik ve şikâyet incelemeleri için konuşmaları okuyabilir. Bu sohbet uçtan uca şifreli değildir.';
export async function thread(id:string,user:Row,moderator=false){
 const c=await one('SELECT * FROM conversations WHERE id=?',id);
 if(!c||(!moderator&&![c.user_low,c.user_high].includes(user.id)))throw new ApiError('Konuşma bulunamadı.',404);
 return c;
}
export async function listThreads(userId:string,search='',page=1,moderator=false){
 const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
 const where=moderator?` WHERE (a.name LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.body LIKE ? ESCAPE '\\'))`:' WHERE (c.user_low=? OR c.user_high=?)';
 const args=moderator?[pattern,pattern,pattern]:[userId,userId];
 const from=' FROM conversations c JOIN users a ON a.id=c.user_low JOIN users b ON b.id=c.user_high';
 const total=Number((await one('SELECT COUNT(*) AS n'+from+where,...args))?.n||0);
 const result=await rows(`SELECT c.*,a.name AS low_name,b.name AS high_name,a.status AS low_status,b.status AS high_status,
 (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.seq>COALESCE((SELECT last_seq FROM message_reads r WHERE r.user_id=? AND r.conversation_id=c.id),0)) AS unread,
 EXISTS(SELECT 1 FROM message_blocks x WHERE x.user_id=? AND x.blocked_id IN(c.user_low,c.user_high)) AS blocked_by_me,
 EXISTS(SELECT 1 FROM message_blocks x WHERE x.user_id IN(c.user_low,c.user_high) AND x.blocked_id=?) AS blocked_by_other
 `+from+where+' ORDER BY c.last_message_at DESC,c.id LIMIT 30 OFFSET ?',userId,userId,userId,userId,...args,(page-1)*30);
 return {threads:result,total,page,pages:Math.max(1,Math.ceil(total/30))};
}
export async function messages(id:string,before:number){
 const result=await rows('SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 51',id,before);
 const more=result.length>50;return {messages:result.slice(0,50).reverse(),hasOlder:more};
}
export async function messageAction(u:Row,b:Row){
 if(!['clipper','creator'].includes(u.role))throw new ApiError('Üye mesajlaşması klipper ve yayıncı hesapları içindir.',403);
 const action=textValue(b.action),requestId=textValue(b.requestId,16,80),time=now();
 if(action==='preferences'){
  if(!['requests','open','closed'].includes(b.policy))throw new ApiError('Mesaj tercihi geçersiz.');
  await transaction(u.id,'chat_preferences',requestId,u.id,[{sql:'UPDATE users SET message_policy=? WHERE id=?',args:[b.policy,u.id]}]);return {ok:true};
 }
 if(action==='start'){
  if(b.noticeAccepted!==true)throw new ApiError('Mesaj saklama ve yönetici erişimi bilgisini onayla.');
  const other=await one("SELECT id,message_policy FROM users WHERE id=? AND status='active' AND role IN ('clipper','creator')",textValue(b.recipientId,1,100));
  if(!other||other.id===u.id)throw new ApiError('Bu üyeyle konuşma başlatılamıyor.');
  const [low,high]=[u.id,other.id].sort();const existing=await one('SELECT id FROM conversations WHERE user_low=? AND user_high=?',low,high);
  if(existing)return {ok:true,id:existing.id,existing:true};
  const body=textValue(b.body,1,4000);
  await transaction(u.id,'chat_start',requestId,requestId,[
   {sql:'INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?)',args:[requestId,low,high,u.id,other.id,other.message_policy==='open'?'accepted':'pending',time,time]},
   {sql:'INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?)',args:[requestId,requestId,u.id,body,time]}
  ]);return {ok:true,id:requestId};
 }
 const c=await thread(textValue(b.id,1,100),u);const other=c.user_low===u.id?c.user_high:c.user_low;
 const statements:{sql:string,args:any[]}[]=[];
 if(action==='send')statements.push({sql:'INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?)',args:[requestId,c.id,u.id,textValue(b.body,1,4000),time]});
 else if(action==='accept'||action==='decline'){
  if(c.recipient_id!==u.id||c.status==='accepted')throw new ApiError('Bu isteği değiştiremezsin.',403);
  statements.push({sql:'UPDATE conversations SET status=? WHERE id=?',args:[action==='accept'?'accepted':'declined',c.id]});
 }else if(action==='block')statements.push({sql:'INSERT INTO message_blocks VALUES(?,?,?) ON CONFLICT DO NOTHING',args:[u.id,other,time]});
 else if(action==='unblock')statements.push({sql:'DELETE FROM message_blocks WHERE user_id=? AND blocked_id=?',args:[u.id,other]});
 else if(action==='read'){
  const seq=Number(b.seq);if(!Number.isSafeInteger(seq)||seq<0)throw new ApiError('Geçersiz mesaj.');
  const max=Number((await one('SELECT COALESCE(MAX(seq),0) AS n FROM messages WHERE conversation_id=?',c.id))?.n||0);
  statements.push({sql:'INSERT INTO message_reads VALUES(?,?,?) ON CONFLICT(user_id,conversation_id) DO UPDATE SET last_seq=MAX(last_seq,excluded.last_seq)',args:[u.id,c.id,Math.min(seq,max)]});
 }else throw new ApiError('İşlem bulunamadı.',404);
 await transaction(u.id,'chat_'+action,requestId,c.id,statements);return {ok:true,id:c.id};
}
