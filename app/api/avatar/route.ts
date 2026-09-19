import sharp from 'sharp';
import {bucket,allowedOrigin} from '@/lib/runtime';
import {account,apiFailure,json,db,limit,ApiError} from '@/lib/server';
export async function POST(req:Request){
  try{
    if(!allowedOrigin(req))throw new ApiError('İstek kaynağı doğrulanamadı.',403);
    const u=await account();await limit('avatar:'+u.id,15,3600);
    if(Number(req.headers.get('content-length')||0)>2200000)throw new ApiError('Fotoğraf en fazla 2 MB olabilir.',413);
    const file=(await req.formData()).get('file');
    if(!(file instanceof File)||!file.size||file.size>2000000)throw new ApiError('En fazla 2 MB boyutunda JPG, PNG veya WebP fotoğraf seç.');
    const input=Buffer.from(await file.arrayBuffer());
    const decoder=sharp(input,{limitInputPixels:20_000_000,animated:false});
    const metadata=await decoder.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format||''))throw new ApiError('JPG, PNG veya WebP fotoğraf seç.');
    const bytes=await decoder.rotate().resize(512,512,{fit:'cover'}).webp({quality:85}).toBuffer();
    const id=crypto.randomUUID(),key='avatars/'+u.id+'/'+id;
    await bucket.put(key,bytes);
    try{await db().prepare('UPDATE users SET avatar_id=? WHERE id=?').bind(id,u.id).run();}catch(e){await bucket.delete(key);throw e;}
    if(u.avatar_id)await bucket.delete('avatars/'+u.id+'/'+u.avatar_id).catch(()=>{});
    return json({ok:true});
  }catch(e){return apiFailure(e)}
}
export async function DELETE(req:Request){
  try{
    if(!allowedOrigin(req))throw new ApiError('İstek kaynağı doğrulanamadı.',403);
    const u=await account();await limit('avatar:'+u.id,15,3600);
    await db().prepare("UPDATE users SET avatar_id='' WHERE id=?").bind(u.id).run();
    if(u.avatar_id)await bucket.delete('avatars/'+u.id+'/'+u.avatar_id).catch(()=>{});
    return json({ok:true});
  }catch(e){return apiFailure(e)}
}
