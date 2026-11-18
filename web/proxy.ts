import { NextResponse, type NextRequest } from 'next/server';

/**
 * Contraseña única. Sin DASHBOARD_PASSWORD el panel solo se abre en desarrollo; en producción responde 503.
 * Usa la autenticación básica del navegador (cualquier usuario + la contraseña).
 */
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    // En local se puede trabajar sin contraseña; publicado, nunca se sirve abierto.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse('Falta DASHBOARD_PASSWORD en el servidor', { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const given = decoded.slice(decoded.indexOf(':') + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="COMPETE", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
