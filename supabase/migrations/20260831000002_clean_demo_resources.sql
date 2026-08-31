-- Tidy the demo practice's resource library so marketing screenshots of the
-- client Resources tab aren't full of keyboard-mash test rows ("asdasdasd",
-- "Test anime") and a duplicated "Every Mind Matters — NHS" card.
--
-- Scoped strictly to demo-admin@honest.com. resource_favourites rows are
-- removed first in case the FK isn't ON DELETE CASCADE.

-- 1a. favourites pointing at the junk rows
delete from public.resource_favourites rf
where rf.resource_id in (
  select r.id
  from public.resources r
  join auth.users au on au.id = r.admin_id
  where au.email = 'demo-admin@honest.com'
    and r.title in ('asdasdasd', 'Test anime')
);

-- 1b. favourites pointing at the duplicate NHS rows (keep the earliest)
delete from public.resource_favourites rf
where rf.resource_id in (
  select id from (
    select r.id,
           row_number() over (partition by r.title order by r.created_at) as rn
    from public.resources r
    join auth.users au on au.id = r.admin_id
    where au.email = 'demo-admin@honest.com'
      and r.title = 'Every Mind Matters — NHS'
  ) d
  where d.rn > 1
);

-- 2a. the junk rows themselves
delete from public.resources r
using auth.users au
where au.id = r.admin_id
  and au.email = 'demo-admin@honest.com'
  and r.title in ('asdasdasd', 'Test anime');

-- 2b. duplicate NHS rows (keep the earliest)
delete from public.resources r
where r.id in (
  select id from (
    select r2.id,
           row_number() over (partition by r2.title order by r2.created_at) as rn
    from public.resources r2
    join auth.users au on au.id = r2.admin_id
    where au.email = 'demo-admin@honest.com'
      and r2.title = 'Every Mind Matters — NHS'
  ) d
  where d.rn > 1
);
