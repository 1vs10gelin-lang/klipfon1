import {getCurrentUser} from '@/lib/auth';
import {bucket} from '@/lib/runtime';
import {one,apiFailure,ApiError} from '@/lib/server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const user=await one("SELECT id,avatar_id,community_visible FROM users WHERE id=? AND status='active' AND role IN ('creator','clipper')",id);
    if(user&&!user.community_visible&&(await getCurrentUser())?.userId!==user.id)throw new ApiError('Fotoğraf bulunamadı.',404);
    if(!user?.avatar_id)throw new ApiError('Fotoğraf bulunamadı.',404);
    const object=await bucket.get('avatars/'+user.id+'/'+user.avatar_id);
    if(!object)throw new ApiError('Fotoğraf bulunamadı.',404);
    return new Response(object.body,{headers:{'Content-Type':'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch(e){return apiFailure(e)}
}
