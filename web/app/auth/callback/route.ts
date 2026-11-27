import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/site-url';
import { authClient } from '@/lib/supabase/server';

/** Vuelta de los enlaces de email (confirmación, recuperar contraseña) y de Google: canjea el código por sesión. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const base = process.env.SITE_URL?.replace(/\/$/, '') ?? url.origin;
  if (code) {
    const supabase = await authClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next}`);
  }
  return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(url.searchParams.get('error_description') ?? 'El enlace ha caducado o ya se ha usado. Pide otro.')}`);
}
