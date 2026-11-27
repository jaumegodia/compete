/**
 * Textos legales (BORRADOR, pendiente de revisión por un abogado).
 * Los datos del titular se rellenan aquí cuando haya alta de autónomo o sociedad.
 */
export const OWNER = {
  name: '[PENDIENTE: nombre y apellidos o razón social]',
  taxId: '[PENDIENTE: NIF]',
  address: '[PENDIENTE: domicilio]',
  email: '[PENDIENTE: email de contacto, p. ej. hola@dominio]',
  registry: '[PENDIENTE: datos registrales si es sociedad]',
  updated: '28 de noviembre de 2026',
};

type Doc = { title: string; sections: [string, string[]][] };

export const DOCS: Record<string, Doc> = {
  'aviso-legal': {
    title: 'Aviso legal',
    sections: [
      [
        'Titular',
        [
          `En cumplimiento de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de que este sitio web y el servicio COMPETE son titularidad de ${OWNER.name}, con NIF ${OWNER.taxId} y domicilio en ${OWNER.address}. Contacto: ${OWNER.email}. ${OWNER.registry}.`,
        ],
      ],
      [
        'Objeto',
        [
          'COMPETE es un servicio en línea de inteligencia competitiva para tiendas online: recoge a diario información pública de las webs que el cliente elige (catálogo, precios, promociones, reseñas, publicidad y posicionamiento) y la presenta en un panel.',
        ],
      ],
      [
        'Propiedad intelectual',
        [
          'El diseño, el código, los textos y las marcas de COMPETE pertenecen a su titular o a terceros que han autorizado su uso. Las marcas, nombres e imágenes de productos de terceros que aparecen en el panel pertenecen a sus respectivos titulares y se muestran solo con fines informativos.',
        ],
      ],
      [
        'Responsabilidad',
        [
          'La información del panel procede de fuentes públicas y de proveedores de datos, y se ofrece tal cual. Aunque se trabaja para que sea exacta, puede contener errores, retrasos u omisiones, por lo que no debe ser la única base de decisiones comerciales.',
        ],
      ],
      ['Legislación', ['Este aviso se rige por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la ley.']],
    ],
  },
  privacidad: {
    title: 'Política de privacidad',
    sections: [
      ['Responsable', [`${OWNER.name}, NIF ${OWNER.taxId}, ${OWNER.address}. Contacto para privacidad: ${OWNER.email}.`]],
      [
        'Qué datos tratamos',
        [
          'Datos de la cuenta: nombre, email, contraseña (cifrada) o, si entras con Google, tu identificador y email de Google.',
          'Datos de facturación: nombre o razón social, dirección, NIF/VAT y datos de pago. Los datos de la tarjeta los trata directamente Stripe; COMPETE no los ve ni los guarda.',
          'Datos de uso: los proyectos, marcas y webs que configuras, y registros técnicos (IP, fechas de acceso) para seguridad.',
          'COMPETE no recoge datos personales de los clientes de las tiendas que analiza: solo información pública de catálogo, precios y promociones. Las reseñas públicas de Trustpilot se muestran con el nombre que su autor publicó.',
        ],
      ],
      [
        'Para qué y con qué base',
        [
          'Prestar el servicio contratado y gestionar tu cuenta (ejecución del contrato).',
          'Cobrar y emitir facturas (ejecución del contrato y obligación legal).',
          'Enviarte emails sobre el servicio: avisos de captura, fin de la prueba, cambios importantes (ejecución del contrato). Comunicaciones comerciales solo si lo aceptas, y puedes darte de baja en cada email.',
          'Seguridad y prevención del fraude (interés legítimo).',
        ],
      ],
      [
        'Encargados del tratamiento',
        [
          'Supabase (base de datos y autenticación, servidores en la UE), Render (alojamiento, Frankfurt), Stripe (pagos), Resend (envío de emails), GitHub (ejecución de capturas) y Google (si entras con Google). Algunos pueden transferir datos fuera del Espacio Económico Europeo con las garantías del RGPD (cláusulas contractuales tipo o Marco de Privacidad de Datos UE-EE. UU.).',
        ],
      ],
      [
        'Cuánto tiempo',
        [
          'Mientras tengas la cuenta. Si la cierras, se borran tus datos personales en un plazo de 30 días, salvo los que haya que conservar por obligación legal (facturación: 6 años).',
        ],
      ],
      [
        'Tus derechos',
        [
          `Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a ${OWNER.email}. Si crees que no se han respetado tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
        ],
      ],
    ],
  },
  terminos: {
    title: 'Términos y condiciones',
    sections: [
      ['Partes', [`Estos términos regulan el uso de COMPETE, prestado por ${OWNER.name} (NIF ${OWNER.taxId}), por parte del cliente que crea una cuenta. El servicio está dirigido a empresas y profesionales.`]],
      [
        'Servicio',
        [
          'COMPETE captura a diario información pública de las webs que el cliente indica y la muestra en un panel. Los módulos, el número de proyectos y de competidores dependen del plan contratado, tal como se describen en la página de precios.',
          'La primera captura de una web puede tardar hasta 24 horas. Algunas webs bloquean la captura automática; en ese caso se intentará obtener la información por otras fuentes públicas (p. ej. Google Shopping), sin garantía de cobertura completa.',
        ],
      ],
      [
        'Prueba gratuita',
        ['Las cuentas nuevas tienen 14 días de prueba gratuita, sin tarjeta, con los límites indicados al registrarse. Al terminar, el panel queda bloqueado hasta contratar un plan; los datos se conservan al menos 30 días.'],
      ],
      [
        'Precio, pago y renovación',
        [
          'Los planes se pagan por adelantado, al mes o al año, mediante Stripe. Los precios se muestran sin IVA, que se añade cuando corresponda. La suscripción se renueva automáticamente hasta que se cancele.',
          'El cliente puede cancelar en cualquier momento desde Cuenta: el servicio sigue activo hasta el final del periodo pagado y no se reembolsan periodos parciales. Los cambios de plan se prorratean.',
        ],
      ],
      [
        'Uso aceptable',
        [
          'El cliente se compromete a usar COMPETE para analizar información pública de su mercado y a no utilizarlo para fines ilícitos, para obtener datos personales ni para sobrecargar webs de terceros. COMPETE captura con una petición a la vez por web, con pausas y un agente identificable.',
        ],
      ],
      [
        'Datos y confidencialidad',
        [
          'Los proyectos y competidores que configura cada cliente son confidenciales y no se muestran a otros clientes. La información pública capturada de una web puede servir a varios clientes que la sigan.',
        ],
      ],
      [
        'Responsabilidad',
        [
          'La información se ofrece tal cual, sin garantía de exactitud o disponibilidad continua. La responsabilidad total del prestador frente al cliente se limita a lo pagado por el cliente en los 12 meses anteriores al hecho que la origine.',
        ],
      ],
      ['Cambios', ['Los cambios de estos términos se avisarán por email con al menos 30 días de antelación. Si el cliente no está de acuerdo, podrá cancelar antes de que entren en vigor.']],
      ['Ley y jurisdicción', ['Se rigen por la legislación española. Para cualquier controversia, las partes se someten a los juzgados del domicilio del prestador, salvo que la ley disponga otra cosa.']],
    ],
  },
  cookies: {
    title: 'Política de cookies',
    sections: [
      [
        'Qué cookies usamos',
        [
          'COMPETE solo usa cookies técnicas, necesarias para que el servicio funcione: las de sesión de Supabase (sb-…), que mantienen la sesión iniciada, y lang, que recuerda el idioma elegido.',
          'No usamos cookies de analítica, publicidad ni de terceros con fines de seguimiento. Por eso no mostramos un banner de consentimiento: las cookies técnicas están exentas (art. 22.2 LSSI-CE).',
          'Stripe puede instalar sus propias cookies al pagar, en su página de pago, para prevenir el fraude.',
        ],
      ],
      ['Cómo desactivarlas', ['Puedes borrarlas o bloquearlas desde tu navegador, pero entonces no podrás iniciar sesión.']],
      ['Cambios', ['Si en el futuro se añaden cookies no técnicas, se actualizará esta política y se pedirá tu consentimiento antes de instalarlas.']],
    ],
  },
};
