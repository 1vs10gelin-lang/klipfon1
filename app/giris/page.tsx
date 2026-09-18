import {getCurrentUser,safeReturnTo} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {one} from '@/lib/server';
import {Header,Footer} from '@/components/klipfon/shared';
import {AuthForm} from '@/components/klipfon/auth-form';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{rol?:string,return_to?:string}>}){const q=await searchParams,u=await getCurrentUser(),returnTo=safeReturnTo(q.return_to||'/panel');if(u){const account=await one('SELECT role FROM users WHERE id=?',u.userId);redirect(returnTo==='/panel'&&account?.role==='admin'?'/admin':returnTo);}return <><Header/><main className="screen-center"><div className="eyebrow">TEKRAR HOŞ GELDİN</div><h1>Klipfon’a giriş yap.</h1><p>Kampanyaların, kliplerin ve ödemelerin aynı yerde.</p><div className="panel mt-6"><AuthForm mode="login" role={q.rol} returnTo={returnTo}/></div></main><Footer/></>}
