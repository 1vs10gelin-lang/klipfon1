import {getCommunityDetail} from '@/lib/community';
import {apiFailure,json} from '@/lib/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
  const {id}=await params;
  const result=await getCommunityDetail(id,new URL(req.url).searchParams);
  return result?json(result):json({error:'Profil bulunamadı veya henüz onaylanmadı.'},404);
}catch(e){return apiFailure(e);}}
