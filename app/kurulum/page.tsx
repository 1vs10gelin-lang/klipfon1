import {requireCurrentUser} from '@/lib/auth';
import {Setup} from '@/components/klipfon/onboarding';
export const dynamic='force-dynamic';
export default async function Page(){await requireCurrentUser('/kurulum');return <Setup/>}
