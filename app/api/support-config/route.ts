import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const property = (process.env.TAWK_PROPERTY_ID ?? '6aadc798c048683449aa1362').trim();
  const widget = (process.env.TAWK_WIDGET_ID ?? 'default').trim();
  const configured = /^[a-f0-9]{24}$/i.test(property) && /^[a-z0-9]{1,64}$/i.test(widget);
  return NextResponse.json(
    { src: configured ? `https://embed.tawk.to/${property}/${widget}` : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
