export type CommunityRole = 'clipper' | 'creator';
export type CommunityProfile = {
  id: string; name: string; role: CommunityRole; bio: string; socialUrl: string;
  joinedAt: number; views: number; clipCount: number; campaignCount: number;
  partnerCount: number; lastMeasuredAt: number | null; rank: number | null;
};
export const levels = [
  {name:'Yeni Klipper',min:0,tone:'new'},
  {name:'Yükselen',min:10_000,tone:'rising'},
  {name:'Profesyonel',min:100_000,tone:'pro'},
  {name:'Elit',min:1_000_000,tone:'elite'},
  {name:'Efsane',min:10_000_000,tone:'legend'},
] as const;
export function levelFor(views:number) {
  const index = levels.findLastIndex(level => views >= level.min);
  const current = levels[Math.max(0,index)], next = levels[index+1] ?? null;
  return {...current,next,progress:next?Math.max(0,Math.min(100,(views-current.min)/(next.min-current.min)*100)):100};
}
export const count = (value:number) => new Intl.NumberFormat('tr-TR').format(value);
