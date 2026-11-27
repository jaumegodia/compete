-- Proyectos: cada proyecto es un mercado = una marca propia + sus competidores.
-- Marcas y webs se comparten entre proyectos (una web se captura una sola vez aunque salga en varios).
-- "Propia" pasa a depender del proyecto (projects.own_brand_id) en lugar de brands.is_own.
--
-- Migración solo aditiva: brands.is_own y brand_competitors se dejan para que el panel anterior siga
-- funcionando mientras se despliega el nuevo. Se borrarán en una migración posterior.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- va en la URL: /p/<slug>
  name text not null,
  own_brand_id uuid not null references public.brands(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.project_competitors (
  project_id uuid not null references public.projects(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, brand_id)
);

create index on public.projects (own_brand_id);
create index on public.project_competitors (brand_id);

-- La marca propia de un proyecto no puede ser a la vez competidora en ese mismo proyecto.
create function public.project_competitor_not_own() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.projects p where p.id = new.project_id and p.own_brand_id = new.brand_id) then
    raise exception 'La marca propia del proyecto no puede ser competidora en él';
  end if;
  return new;
end $$;

create trigger project_competitor_not_own
  before insert or update on public.project_competitors
  for each row execute function public.project_competitor_not_own();

alter table public.projects enable row level security;
alter table public.project_competitors enable row level security;

-- Un proyecto por cada marca propia actual, con sus competidores
insert into public.projects (slug, name, own_brand_id)
select
  trim(both '-' from regexp_replace(translate(lower(b.name), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]+', '-', 'g')),
  b.name,
  b.id
from public.brands b
where b.is_own;

insert into public.project_competitors (project_id, brand_id)
select p.id, bc.competitor_id
from public.brand_competitors bc
join public.projects p on p.own_brand_id = bc.brand_id;
