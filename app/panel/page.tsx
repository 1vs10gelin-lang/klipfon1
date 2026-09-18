import {requireCurrentUser} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {one} from '@/lib/server';
import {Dashboard} from '@/components/klipfon/dashboard';
export const dynamic='force-dynamic';
export default async function Page(){const u=await requireCurrentUser('/panel');const account=await one('SELECT role FROM users WHERE id=?',u.userId);if(!account)redirect('/giris');if(account.role==='admin')redirect('/admin');return <Dashboard/>}
