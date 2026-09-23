import {account,apiFailure,json,db,rows,one,now,checkRequest,limit,expireDrafts} from '@/lib/server';
export async function GET(req:Request){try{
 const u=await account();await expireDrafts();const time=now();
 await db().prepare(`INSERT INTO notifications(id,user_id,title,body,href,created_at) SELECT 'deadline:'||id||':'||status||':'||expires_at,user_id,'Teslim süren yaklaşıyor',CASE status WHEN 'draft' THEN 'Taslağını göndermek için 24 saatten az kaldı.' ELSE 'Onaylı klibinin yayın bağlantısını göndermek için 24 saatten az kaldı.' END,'/kampanya/'||campaign_id,? FROM clips WHERE user_id=? AND status IN ('draft','ready') AND expires_at BETWEEN ? AND ? ON CONFLICT(id) DO NOTHING`).bind(time,u.id,time,time+86400).run();
 const page=Math.max(1,Math.floor(Number(new URL(req.url).searchParams.get('page'))||1));
 const count=await one('SELECT COUNT(*) AS total,COALESCE(SUM(read_at IS NULL),0) AS unread FROM notifications WHERE user_id=?',u.id);
 return json({items:await rows('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?',u.id,(page-1)*30),...count,page,pages:Math.max(1,Math.ceil(Number(count?.total||0)/30))});
}catch(e){return apiFailure(e)}}
export async function POST(req:Request){try{await checkRequest(req);const u=await account();await limit('notifications:'+u.id,60);const b=await req.json();if(b.all===true)await db().prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now(),u.id).run();else await db().prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').bind(now(),String(b.id),u.id).run();return json({ok:true});}catch(e){return apiFailure(e)}}
