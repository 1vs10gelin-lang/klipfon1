import {notFound} from 'next/navigation';
import {getCommunityDetail} from '@/lib/community';
import {CommunityDetail} from '@/components/klipfon/community';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const metadata={title:'Topluluk profili | Klipfon'};
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const detail=await getCommunityDetail(id);
  if(!detail)notFound();
  return <CommunityDetail initial={detail}/>;
}
