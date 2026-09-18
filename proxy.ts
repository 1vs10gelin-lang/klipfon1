import {NextResponse} from 'next/server';
export function proxy(){const r=NextResponse.next();r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('Referrer-Policy','strict-origin-when-cross-origin');r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return r;}
