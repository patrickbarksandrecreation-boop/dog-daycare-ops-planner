import { expect, it } from 'vitest';
import { dogColourStyle, validColour } from '../src/dogColours';
import { demoRepository } from '../src/demo';
import { todayBrisbane } from '../src/model';
it('uses safe colours and readable text for light and dark cards',()=>{
  expect(dogColourStyle('#000000')).toMatchObject({'--dog-colour':'#000000','--dog-ink':'#ffffff'});
  expect(dogColourStyle('#ffffff')).toMatchObject({'--dog-ink':'#000000'});
  expect(dogColourStyle('url(x)')).toMatchObject({'--dog-colour':'#ffffff'});
  expect(validColour('#Ab12cd')).toBe(true);
});
it('demo colour survives profile edits and dates and rejects stale changes',async()=>{
  const repo=demoRepository(), date=todayBrisbane();
  const dog=(await repo.snapshot(date)).dogs[0];
  await repo.saveColour(dog.id,'#ABCDEF',1);
  await expect(repo.saveColour(dog.id,'#000000',1)).rejects.toThrow(/changed/);
  await repo.saveDog({...dog,name:'Synthetic renamed dog'});
  expect((await repo.snapshot('2038-01-01')).dogs[0]).toMatchObject({card_colour:'#abcdef',colour_version:2});
});
