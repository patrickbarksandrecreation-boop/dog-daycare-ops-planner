import type { Attendance, Connection, Dog, Profile, Snapshot, Run } from './model';
export interface Repository {
  demo: boolean;
  profile(): Promise<Profile>;
  snapshot(date: string): Promise<Snapshot>;
  watch(date: string, changed: () => void, status: (value: Connection) => void): () => void;
  add(day: string, dog: string): Promise<void>;
  move(day: string, assignment: string, group: string | null, before: string | null, version: number): Promise<void>;
  remove(day: string, assignment: string, version: number): Promise<void>;
  attendance(day: string, assignment: string, status: Attendance, version: number): Promise<void>;
  rename(day: string, group: string, name: string, useDefault: boolean): Promise<void>;
  clear(day: string, revision: number): Promise<void>;
  markers(dog: string, groomed: boolean, noWaterpark: boolean, version: number): Promise<void>;
  assignRun(day: string, group: string, run: Run | null, version: number): Promise<void>;
  saveDog(dog: Partial<Dog> & { name: string }, photo?: File): Promise<void>;
  replacePhoto(dog: Dog, photo: File): Promise<void>;
  signOut(): Promise<void>;
}
