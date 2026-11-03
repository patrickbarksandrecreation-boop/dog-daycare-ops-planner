// Owner-run maintenance. Uses normal staff permissions and checked photo replacement.
// PLANNER_STAFF_SESSION_FILE: local JSON session; never commit this file.
// PLANNER_PHOTO_DATE: explicit Brisbane date; dry-run unless PLANNER_COMPRESS_CONFIRM matches it.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
const date = process.env.PLANNER_PHOTO_DATE;
assert.match(date || '', /^\d{4}-\d{2}-\d{2}$/);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60000) }) },
});
const session = JSON.parse(await readFile(process.env.PLANNER_STAFF_SESSION_FILE, 'utf8'));
const auth = await db.auth.setSession(session); if (auth.error) throw auth.error;
const day = await db.from('planning_days').select('id').eq('local_date', date).single();
if (day.error) throw day.error;
const assignments = await db.from('daily_assignments').select('dog_id').eq('planning_day_id', day.data.id);
if (assignments.error) throw assignments.error;
const ids = [...new Set(assignments.data.map(a => a.dog_id))];
const dogs = ids.length ? await db.from('dogs').select('id,photo_path').in('id', ids) : {data:[],error:null};
if (dogs.error) throw dogs.error;
const report = { date, changed: 0, skipped: 0, failed: 0, before: 0, after: 0, dryRun: process.env.PLANNER_COMPRESS_CONFIRM !== date };
const queue = dogs.data.filter(d => d.photo_path);
await Promise.all(Array.from({length:3}, async () => {
  while (queue.length) {
    const dog = queue.shift();
    try {
      const download = await db.storage.from('dog-photos').download(dog.photo_path);
      if (download.error) throw download.error;
      const original = Buffer.from(await download.data.arrayBuffer());
      const compressed = await sharp(original, { limitInputPixels: 100000000 }).rotate()
        .resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
      report.before += original.length;
      if (compressed.length >= original.length * 0.95) {
        report.skipped++; report.after += original.length; continue;
      }
      if (!report.dryRun) {
        const body = new FormData(); body.set('dogId', dog.id); body.set('expectedPath', dog.photo_path);
        body.set('photo', new Blob([compressed], {type:'image/webp'}), 'photo.webp');
        const saved = await db.functions.invoke('replace-dog-photo', {body});
        if (saved.error || !saved.data?.saved) throw saved.error || new Error('Save unconfirmed');
        const check = await db.from('dogs').select('photo_path').eq('id', dog.id).single();
        if (check.error || check.data.photo_path === dog.photo_path) throw new Error('Path verification failed');
        const stored = await db.storage.from('dog-photos').download(check.data.photo_path);
        if (stored.error || stored.data.size !== compressed.length) throw new Error('Stored size verification failed');
      }
      report.changed++; report.after += compressed.length;
    } catch { report.failed++; console.error('A photo could not be confirmed; original/authoritative image retained. Dog ID:',dog.id); }
  }
}));
console.log(JSON.stringify(report));
if (report.failed) process.exitCode = 1;
