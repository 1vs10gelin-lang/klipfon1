import {one,rows,now, type Row} from '@/lib/server';
import type {CommunityProfile} from './community-types';

// Use the latest approved snapshot on each clip, never SUM(measurements):
// successive measurements are cumulative and must not count twice.
const communityCTE = `WITH public_clips AS (
 SELECT k.id,k.user_id,k.campaign_id,k.eligible_views,k.last_measured_at,c.owner_id
 FROM clips k JOIN campaigns c ON c.id=k.campaign_id
 WHERE k.status IN ('published','settled') AND c.status IN ('active','paused','closed')
), clipper_stats AS (
 SELECT user_id,COUNT(*) AS clips,COUNT(DISTINCT campaign_id) AS campaigns,
 COUNT(DISTINCT owner_id) AS partners,
 SUM(CASE WHEN last_measured_at IS NOT NULL THEN eligible_views ELSE 0 END) AS views,
 MAX(last_measured_at) AS measured FROM public_clips GROUP BY user_id
), creator_stats AS (
 SELECT owner_id,COUNT(*) AS clips,COUNT(DISTINCT user_id) AS partners,
 SUM(CASE WHEN last_measured_at IS NOT NULL THEN eligible_views ELSE 0 END) AS views,
 MAX(last_measured_at) AS measured FROM public_clips GROUP BY owner_id
), creator_campaigns AS (
 SELECT owner_id,COUNT(*) AS campaigns FROM campaigns
 WHERE status IN ('active','paused','closed') GROUP BY owner_id
), profiles AS (
 SELECT u.id,u.name,u.role,u.bio,u.social_url,u.verified,u.avatar_id,u.created_at,
 COALESCE(CASE WHEN u.role='clipper' THEN k.views ELSE c.views END,0) AS views,
 COALESCE(CASE WHEN u.role='clipper' THEN k.clips ELSE c.clips END,0) AS clip_count,
 COALESCE(CASE WHEN u.role='clipper' THEN k.campaigns ELSE a.campaigns END,0) AS campaign_count,
 COALESCE(CASE WHEN u.role='clipper' THEN k.partners ELSE c.partners END,0) AS partner_count,
 CASE WHEN u.role='clipper' THEN k.measured ELSE c.measured END AS last_measured_at
 FROM users u LEFT JOIN clipper_stats k ON k.user_id=u.id
 LEFT JOIN creator_stats c ON c.owner_id=u.id LEFT JOIN creator_campaigns a ON a.owner_id=u.id
 WHERE u.status='active' AND u.role IN ('clipper','creator')
), ranked AS (
 SELECT *,CASE WHEN views>0 THEN RANK() OVER(PARTITION BY role ORDER BY views DESC) ELSE NULL END AS rank
 FROM profiles
)`;

// Explicit allowlist: public endpoints must never serialize users.* or payments.
function publicProfile(p:Row):CommunityProfile {
  return {id:p.id,name:p.name,role:p.role,bio:p.bio,socialUrl:p.social_url,verified:!!p.verified&&!!p.social_url,avatarUrl:p.avatar_id?'/api/avatar/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.avatar_id):'',
    joinedAt:p.created_at,views:p.views,clipCount:p.clip_count,campaignCount:p.campaign_count,
    partnerCount:p.partner_count,lastMeasuredAt:p.last_measured_at,rank:p.rank};
}
export async function listCommunity(params:URLSearchParams) {
  const role = ['clipper','creator'].includes(params.get('role')||'') ? params.get('role') : 'all';
  const search = (params.get('q')||'').trim().slice(0,100).toLocaleLowerCase('tr-TR');
  const sort = params.get('sort')||'views';
  const orderings:Record<string,string> = {views:'views DESC,clip_count DESC,created_at ASC,id ASC',clips:'clip_count DESC,views DESC,id ASC',newest:'created_at DESC,id ASC'};
  const ordering = orderings[sort] || orderings.views;
  const pattern = '%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  const where = ` WHERE (?='all' OR role=?) AND LOWER(REPLACE(REPLACE(name,'İ','i'),'I','ı')) LIKE ? ESCAPE '\\'`;
  const total = Number((await one(communityCTE+' SELECT COUNT(*) AS total FROM ranked'+where,role,role,pattern))?.total||0);
  const pageSize=24, pages=Math.max(1,Math.ceil(total/pageSize));
  const requested=Number(params.get('page')||1);
  const page=Math.min(pages,Math.max(1,Number.isSafeInteger(requested)?requested:1));
  const profiles=await rows(communityCTE+' SELECT * FROM ranked'+where+' ORDER BY '+ordering+' LIMIT ? OFFSET ?',role,role,pattern,pageSize,(page-1)*pageSize);
  const summary=await one(communityCTE+` SELECT COUNT(*) AS members,
    COALESCE(SUM(role='clipper'),0) AS clippers,COALESCE(SUM(role='creator'),0) AS creators FROM profiles`);
  return {profiles:profiles.map(publicProfile),total,page,pages,pageSize,summary,updatedAt:now()};
}
export async function getCommunityProfile(id:string) {
  const profile=await one(communityCTE+' SELECT * FROM ranked WHERE id=?',id);
  if(!profile)return null;
  return publicProfile(profile);
}
export async function getCommunityDetail(id:string,params=new URLSearchParams()) {
  const profile=await getCommunityProfile(id);
  if(!profile)return null;
  const creator=profile.role==='creator';
  const where=` WHERE ${creator?'c.owner_id':'k.user_id'}=? AND k.status IN ('published','settled')
    AND c.status IN ('active','paused','closed') AND u.status='active'
    AND u.role='clipper'`;
  const from=' FROM clips k JOIN campaigns c ON c.id=k.campaign_id JOIN users u ON u.id=k.user_id';
  const total=Number((await one('SELECT COUNT(*) AS total'+from+where,id))?.total||0);
  const requested=Number(params.get('page')||1),pages=Math.max(1,Math.ceil(total/12));
  const page=Math.min(pages,Math.max(1,Number.isSafeInteger(requested)?requested:1));
  const clips=await rows(`SELECT k.id,k.video_url AS videoUrl,k.published_at AS publishedAt,
    CASE WHEN k.last_measured_at IS NOT NULL THEN k.eligible_views ELSE 0 END AS views,
    k.last_measured_at AS lastMeasuredAt,c.title AS title,c.platform,c.id AS campaignId,
    u.id AS clipperId,u.name AS clipperName`+from+where+
    ' ORDER BY views DESC,k.published_at DESC,k.id ASC LIMIT 12 OFFSET ?',id,(page-1)*12);
  const campaigns=creator?await rows(`SELECT id,title,platform,status FROM campaigns
    WHERE owner_id=? AND status='active' AND deadline>? ORDER BY created_at DESC LIMIT 12`,id,now()):[];
  return {profile,clips:clips.map(clip=>({...clip})),campaigns:campaigns.map(campaign=>({...campaign})),total,page,pages};
}
