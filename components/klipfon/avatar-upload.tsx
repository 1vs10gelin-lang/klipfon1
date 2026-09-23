'use client';
import {useState} from 'react';
export function AvatarUpload({onDone,hasAvatar}:{onDone:()=>void;hasAvatar:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(file?:File){
  setError('');if(file&&file.size>2000000){setError('Fotoğraf en fazla 2 MB olabilir.');return;}
  setBusy(true);try{
   const body=new FormData();if(file)body.append('file',file);
   const r=await fetch('/api/avatar',{method:file?'POST':'DELETE',body:file?body:undefined});
   const data=await r.json();if(!r.ok)throw Error(data.error);onDone();
  }catch(e){setError(e instanceof Error?e.message:'Fotoğraf kaydedilemedi.')}finally{setBusy(false)}
 }
 return <div className="panel my-5"><label className="block text-sm font-semibold">Profil fotoğrafın<input className="block mt-3 w-full" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void save(file);e.target.value='';}}/></label><p className="hint mt-3">JPG, PNG veya WebP · en fazla 2 MB. Fotoğrafın kare olarak ortalanır. Çerçeven doğrulanmış görüntülenmelerine göre otomatik değişir.</p>{busy&&<p role="status">Kaydediliyor…</p>}{error&&<p className="error" role="alert">{error}</p>}{hasAvatar&&<button type="button" className="btn btn-small btn-secondary mt-3" disabled={busy} onClick={()=>void save()}>Fotoğrafı kaldır</button>}</div>;
}
