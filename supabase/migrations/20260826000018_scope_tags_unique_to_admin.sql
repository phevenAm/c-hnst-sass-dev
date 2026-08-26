-- tags.name had a table-wide unique constraint (tags_name_key) instead of
-- one scoped per admin — in a multi-tenant app where every practice manages
-- its own tags, this meant whichever admin created e.g. "Mood" first
-- permanently claimed that word for every other practice on the platform:
-- any other admin naming a tag "Mood" would hit a raw "duplicate key value
-- violates unique constraint" error with no indication why, since nothing
-- about tags is meant to be shared across practices (found while seeding a
-- "Mood" tag for the demo practice and hitting exactly this collision
-- against an unrelated real admin's existing "Mood" tag).
--
-- Safe to replace outright: the old global-uniqueness constraint means no
-- two existing rows can already share a name, so every existing row trivially
-- satisfies the new, more permissive (admin_id, name) constraint too.
alter table public.tags drop constraint tags_name_key;
alter table public.tags add constraint tags_name_admin_id_key unique (admin_id, name);
