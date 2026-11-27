import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Rutas que se ven sin sesión: web pública, acceso y webhooks. */
const PUBLIC = [/^\/$/, /^\/precios$/, /^\/legal(\/|$)/, /^\/login$/, /^\/registro$/, /^\/recuperar$/, /^\/auth\//, /^\/api\/stripe\/webhook$/, /^\/en(\/|$)/];

/**
 * Refresca la sesión de Supabase en cada petición (el token caduca cada hora) y manda a /login a quien
 * entra sin sesión en el panel. El acceso a cada proyecto se comprueba después, en el servidor (lib/project.ts).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new NextResponse('Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en el servidor', { status: 503 });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC.some((re) => re.test(path))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};
