import type { Attendance, Connection, Dog, Profile, Snapshot, Run } from './model';
import type { InteractionRule } from './behaviour';
import type { SelectedAssignment } from './selection';
export type BookingSync = {
  enabled: boolean; last_success_at: string | null; last_success_date: string | null;
  last_error_code: string | null; heartbeat_at: string | null;
  requested_at: string | null; claimed_request_at: string | null;
  lease_until: string | null; last_attempt_at: string | null;
  missingDogIds: string[];
};
export interface Repository {
  demo: boolean;
  bookingSync?(date: string): Promise<BookingSync | null>;
  requestBookingSync?(): Promise<void>;
  profile(): Promise<Profile>;
  snapshot(date: string): Promise<Snapshot>;
  // Optional presentation enrichment; never blocks authoritative board reads/writes.
  photos?(state: Snapshot): Promise<Snapshot>;
  watch(date: string, changed: () => void, status: (value: Connection) => void): () => void;
  add(day: string, dog: string): Promise<void>;
  move(day: string, assignment: string, group: string | null, before: string | null, version: number): Promise<void>;
  moveMany(day: string, assignments: SelectedAssignment[], group: string | null): Promise<void>;
  remove(day: string, assignment: string, version: number): Promise<void>;
  attendance(day: string, assignment: string, status: Attendance, version: number): Promise<void>;
  rename(day: string, group: string, name: string, useDefault: boolean): Promise<void>;
  clear(day: string, revision: number): Promise<void>;
  markers(dog: string, groomed: boolean, noWaterpark: boolean, version: number): Promise<void>;
  saveNotes(dog: string, notes: string, version: number): Promise<void>;
  saveColour(dog: string, colour: string, version: number): Promise<void>;
  saveRule(rule: Pick<InteractionRule, 'dogs' | 'level' | 'note'> & { id?: string; version?: number }): Promise<void>;
  removeRule(id: string, version: number): Promise<void>;
  assignRun(day: string, group: string, run: Run | null, version: number): Promise<void>;
  saveDog(dog: Partial<Dog> & { name: string }, photo?: File): Promise<void>;
  replacePhoto(dog: Dog, photo: File): Promise<void>;
  signOut(): Promise<void>;
}
