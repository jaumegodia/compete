-- Cuentas, workspaces, planes y suscripciones.
--
-- * Cada usuario (auth.users) tiene un perfil y, al registrarse, un workspace propio del que es owner.
-- * Los proyectos pertenecen a un workspace. Las marcas y webs se siguen compartiendo entre proyectos y
--   clientes: una web se captura una sola vez aunque la sigan varios clientes.
-- * Pausar un competidor (o un proyecto) afecta solo a ese proyecto. Una web se captura mientras al menos
--   un proyecto vivo (workspace con prueba o suscripción activa) la siga sin pausar: ver v_site_demand.
-- * sites.active queda como interruptor de administración (p. ej. web que bloquea la captura).

-- ---------------------------------------------------------------------------------------------------
-- Planes: límites y módulos. Los precios se cobran en Stripe (stripe_price_*).
create table public.plans (
  id text primary key,
  name text not null,
  max_projects int not null,
  max_competitors int not null,               -- por proyecto
  features text[] not null default '{}',      -- catalog, promos, reviews, ads, seo, alerts
  monthly_eur numeric(10, 2),
  yearly_eur numeric(10, 2),
  stripe_price_monthly text,
  stripe_price_yearly text,
  public boolean not null default true,       -- se muestra en la página de precios
  sort int not null default 0
);

insert into public.plans (id, name, max_projects, max_competitors, features, monthly_eur, yearly_eur, public, sort) values
  ('trial',    'Prueba',      1,   3, '{catalog,promos,reviews,ads,seo}',        null,  null, false, 0),
  ('basic',    'Esencial',    1,   3, '{catalog,promos}',                        19,    190,  true,  1),
  ('plus',     'Crecimiento', 2,   6, '{catalog,promos,reviews,ads}',            49,    490,  true,  2),
  ('pro',      'Pro',         5,  15, '{catalog,promos,reviews,ads,seo,alerts}', 99,    990,  true,  3),
  ('internal', 'Interno',   100, 100, '{catalog,promos,reviews,ads,seo,alerts}', null,  null, false, 9);

-- ---------------------------------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_id text not null default 'trial' references public.plans(id),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,                   -- estado de Stripe: trialing, active, past_due, canceled…
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  locale text not null default 'es' check (locale in ('es', 'en')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ¿Puede el workspace usar el producto ahora mismo?
create function public.workspace_is_live(w public.workspaces) returns boolean
language sql stable set search_path = '' as $$
  select w.plan_id = 'internal'
      or w.subscription_status in ('active', 'trialing', 'past_due')
      or (w.plan_id = 'trial' and w.trial_ends_at > now());
$$;

-- Alta de usuario: perfil + workspace propio
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  display text := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1));
begin
  insert into public.profiles (user_id, email, full_name, locale)
  values (new.id, new.email, display, case when new.raw_user_meta_data->>'locale' = 'en' then 'en' else 'es' end);
  insert into public.workspaces (name) values (display) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------
-- Proyectos dentro de un workspace, con país e idioma del mercado y vertical
alter table public.projects
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column country text not null default 'ES' check (country ~ '^[A-Z]{2}$'),
  add column vertical text,
  add column paused_at timestamptz;

alter table public.project_competitors add column paused_at timestamptz;

-- Los proyectos existentes pasan a un workspace interno (sin límites ni cobro)
with ws as (insert into public.workspaces (name, plan_id, trial_ends_at) values ('COMPETE (interno)', 'internal', null) returning id)
update public.projects set workspace_id = (select id from ws) where workspace_id is null;

update public.projects set vertical = 'descanso' where vertical is null;

alter table public.projects alter column workspace_id set not null;
create index on public.projects (workspace_id);

-- El slug ya no es global para siempre, pero sigue siendo único: va en la URL /p/<slug>

-- ---------------------------------------------------------------------------------------------------
-- Qué webs hay que capturar y con qué módulos: la unión de lo que piden los proyectos vivos que las siguen.
create view public.v_site_demand with (security_invoker = on) as
with tracked as (
  select p.own_brand_id as brand_id, w.plan_id, p.country
  from public.projects p
  join public.workspaces w on w.id = p.workspace_id
  where p.paused_at is null and public.workspace_is_live(w)
  union all
  select pc.brand_id, w.plan_id, p.country
  from public.project_competitors pc
  join public.projects p on p.id = pc.project_id
  join public.workspaces w on w.id = p.workspace_id
  where pc.paused_at is null and p.paused_at is null and public.workspace_is_live(w)
)
select
  s.id as site_id,
  s.base_url,
  count(*) as projects,
  bool_or('catalog' = any (pl.features)) as want_catalog,
  bool_or('promos' = any (pl.features)) as want_promos,
  bool_or('reviews' = any (pl.features)) as want_reviews,
  bool_or('ads' = any (pl.features)) as want_ads,
  bool_or('seo' = any (pl.features)) as want_seo,
  array_agg(distinct t.country) as countries
from public.sites s
join tracked t on t.brand_id = s.brand_id
join public.plans pl on pl.id = t.plan_id
where s.active
group by s.id, s.base_url;

-- ---------------------------------------------------------------------------------------------------
-- RLS. El panel lee con la clave de servicio y comprueba el acceso en el servidor; estas políticas
-- son la segunda barrera por si algún día se consulta desde el navegador con la clave pública.
alter table public.plans enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;

create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = (select auth.uid()));
$$;

create policy "plans visibles" on public.plans for select to anon, authenticated using (true);
create policy "mi perfil" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "mis workspaces" on public.workspaces for select to authenticated using (public.is_member(id));
create policy "mis membresías" on public.workspace_members for select to authenticated using (user_id = (select auth.uid()));
create policy "proyectos de mis workspaces" on public.projects for select to authenticated using (public.is_member(workspace_id));
create policy "competidores de mis proyectos" on public.project_competitors for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_member(p.workspace_id)));

revoke execute on function public.handle_new_user() from public, anon, authenticated;
