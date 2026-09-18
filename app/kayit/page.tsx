import {getCurrentUser,safeReturnTo} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {Header,Footer} from '@/components/klipfon/shared';
import {AuthForm} from '@/components/klipfon/auth-form';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{rol?:string,return_to?:string}>}){const q=await searchParams;if(await getCurrentUser())redirect('/panel');return <><Header/><main className="screen-center"><div className="eyebrow">KLİPFON’A HOŞ GELDİN</div><h1>Birlikte büyüyelim.</h1><p>Yayıncı veya klipper hesabını oluştur.</p><div className="panel mt-6"><AuthForm mode="register" role={q.rol} returnTo={safeReturnTo(q.return_to||'/panel')}/></div></main><Footer/></>}
