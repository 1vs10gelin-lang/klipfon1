import {requireCurrentUser} from '@/lib/auth';
import {one} from '@/lib/server';
import {Header,Footer} from '@/components/klipfon/shared';
import {AdminDashboard} from '@/components/klipfon/admin-dashboard';
export const dynamic='force-dynamic';
export default async function Page(){const u=await requireCurrentUser('/admin');const owner=await one('SELECT user_id FROM admin_owner WHERE slot=1');if(!owner||owner.user_id!==u.userId)return <><Header/><main className="screen-center"><h1>Yönetim alanı.</h1><p>Bu sayfa yalnızca yetkili yönetici hesabına açıktır.</p>{!owner&&<a className="btn mt-5" href="/kurulum">Kurulum koduyla etkinleştir</a>}<a className="muted-link block mt-5" href="/giris">Hesabıma dön</a></main><Footer/></>;return <AdminDashboard/>}
