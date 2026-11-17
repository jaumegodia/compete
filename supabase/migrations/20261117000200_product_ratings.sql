-- Valoración media y nº de reseñas del producto (schema.org aggregateRating, si la web lo publica)
alter table public.products add column rating numeric(3,2), add column review_count int;
