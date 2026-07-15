do $$
begin
  perform set_config('lock_timeout', '5s', true);
  execute 'alter table public.profiles add column if not exists phone text not null default ''''';
end
$$;
