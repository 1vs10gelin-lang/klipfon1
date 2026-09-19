import {listCommunity} from '@/lib/community';
import {apiFailure,json} from '@/lib/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:Request){try{return json(await listCommunity(new URL(req.url).searchParams));}catch(e){return apiFailure(e);}}
