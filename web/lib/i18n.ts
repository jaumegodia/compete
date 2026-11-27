import 'server-only';
import { cookies, headers } from 'next/headers';

/**
 * Idiomas del producto. El panel está en español; las páginas nuevas (web pública, acceso, alta, cuenta)
 * ya leen sus textos de aquí para poder servirlas en inglés. El resto del panel se irá pasando aquí.
 */
export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Idioma: cookie `lang` (selector) → cabecera Accept-Language → español. */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get('lang')?.value;
  if (fromCookie === 'en' || fromCookie === 'es') return fromCookie;
  const accept = (await headers()).get('accept-language') ?? '';
  return /^en\b/i.test(accept.trim()) ? 'en' : 'es';
}

const es = {
  brandTagline: 'Inteligencia competitiva para e-commerce',
  login: 'Entrar',
  signup: 'Crear cuenta',
  logout: 'Salir',
  email: 'Email',
  password: 'Contraseña',
  name: 'Tu nombre',
  company: 'Empresa',
  forgot: '¿Has olvidado la contraseña?',
  continueGoogle: 'Continuar con Google',
  or: 'o',
  noAccount: '¿No tienes cuenta?',
  haveAccount: '¿Ya tienes cuenta?',
  signupTitle: 'Empieza tu prueba de 14 días',
  signupSubtitle: 'Sin tarjeta. Tu marca y hasta 3 competidores, con todos los módulos.',
  loginTitle: 'Entra en COMPETE',
  acceptTerms: 'Al crear la cuenta aceptas los',
  terms: 'Términos',
  and: 'y la',
  privacy: 'Política de privacidad',
  checkEmail: 'Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve aquí.',
  resetTitle: 'Recuperar contraseña',
  resetSend: 'Enviar enlace',
  resetSent: 'Si hay una cuenta con ese email, te llegará un enlace para elegir una contraseña nueva.',
  newPasswordTitle: 'Elige una contraseña nueva',
  save: 'Guardar',
  passwordMin: 'Mínimo 8 caracteres',
  errors: {
    invalid: 'Email o contraseña incorrectos.',
    exists: 'Ya hay una cuenta con ese email. Entra o recupera la contraseña.',
    weak: 'La contraseña debe tener al menos 8 caracteres.',
    generic: 'Algo ha fallado. Inténtalo de nuevo.',
    unconfirmed: 'Confirma tu email antes de entrar (revisa también el spam).',
    link: 'El enlace ha caducado o ya se ha usado. Pide otro.',
  },
};

export type Dict = typeof es;

const en: Dict = {
  brandTagline: 'Competitive intelligence for e-commerce',
  login: 'Log in',
  signup: 'Create account',
  logout: 'Log out',
  email: 'Email',
  password: 'Password',
  name: 'Your name',
  company: 'Company',
  forgot: 'Forgot your password?',
  continueGoogle: 'Continue with Google',
  or: 'or',
  noAccount: "Don't have an account?",
  haveAccount: 'Already have an account?',
  signupTitle: 'Start your 14-day trial',
  signupSubtitle: 'No card needed. Your brand and up to 3 competitors, every module included.',
  loginTitle: 'Log in to COMPETE',
  acceptTerms: 'By creating an account you accept the',
  terms: 'Terms',
  and: 'and the',
  privacy: 'Privacy policy',
  checkEmail: 'We have sent you an email to confirm your account. Open it and come back here.',
  resetTitle: 'Reset password',
  resetSend: 'Send link',
  resetSent: 'If there is an account with that email, you will receive a link to choose a new password.',
  newPasswordTitle: 'Choose a new password',
  save: 'Save',
  passwordMin: 'At least 8 characters',
  errors: {
    invalid: 'Wrong email or password.',
    exists: 'There is already an account with that email. Log in or reset your password.',
    weak: 'The password must be at least 8 characters long.',
    generic: 'Something went wrong. Please try again.',
    unconfirmed: 'Confirm your email before logging in (check your spam folder too).',
    link: 'The link has expired or was already used. Request a new one.',
  },
};

export const DICTS: Record<Locale, Dict> = { es, en };

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: DICTS[locale] };
}
