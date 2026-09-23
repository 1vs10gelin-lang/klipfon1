import {one,ApiError,type Row} from './server';
export async function reportEvidence(type:string,id:string,u:Row){
 if(type==='profile'){const p=await one("SELECT id,name,bio,social_url,avatar_id FROM users WHERE id=? AND role IN ('creator','clipper')",id);if(p)return p;}
 if(type==='clip'){const c=await one("SELECT k.id,k.user_id,k.video_url,c.title,c.owner_id FROM clips k JOIN campaigns c ON c.id=k.campaign_id WHERE k.id=? AND (k.status IN ('published','settled') OR k.user_id=? OR c.owner_id=?)",id,u.id,u.id);if(c)return c;}
 if(type==='message'){const m=await one('SELECT m.id,m.body,m.sender_id,m.conversation_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND (c.user_low=? OR c.user_high=?)',id,u.id,u.id);if(m)return m;}
 throw new ApiError('Şikâyet konusu bulunamadı.',404);
}
