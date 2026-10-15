-- Raise only the dog photo upload cap; preserve privacy, MIME types and policies.
update storage.buckets set file_size_limit = 8388608 where id = 'dog-photos';
