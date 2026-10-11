-- Application version conflicts are HTTP 409, not retryable transaction failures.
-- Preserve installed function bodies, signatures, ownership, grants and scope checks.
begin;
do $migration$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.move_assignment(uuid,uuid,uuid,uuid,integer)',
    'public.set_attendance(uuid,uuid,text,integer)',
    'public.remove_assignment(uuid,uuid,integer)',
    'public.clear_plan(uuid,integer)',
    'public.set_dog_markers(uuid,boolean,boolean,integer)',
    'public.set_group_run(uuid,uuid,text,integer)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('errcode=''40001''' in definition)=0 then
      raise exception 'Expected version guard missing in %', signature;
    end if;
    execute replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
  end loop;
end;
$migration$;
commit;
