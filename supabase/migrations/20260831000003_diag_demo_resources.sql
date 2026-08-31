-- TEMP diagnostic: surface the junk resource rows so the cleanup can target
-- them correctly. Safe, read-only. Remove this migration after.
do $diag$
declare
  r record;
begin
  for r in
    select id, title, admin_id, is_demo, is_published, created_at
    from public.resources
    where title in ('asdasdasd', 'Test anime')
       or title = 'Every Mind Matters — NHS'
       or summary ilike 'this is the description%'
    order by title, created_at
  loop
    raise notice 'RESROW title=% | admin_id=% | is_demo=% | is_published=% | id=%',
      r.title, r.admin_id, r.is_demo, r.is_published, r.id;
  end loop;
end
$diag$;
