import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('compresses camera photos for both creation and replacement and rejects corrupt images', async ({page}) => {
  const pixels = Buffer.alloc(2400 * 1600 * 3);
  // Repeatable noisy camera-like input makes transport savings measurable.
  let value = 17;
  for (let i=0; i<pixels.length; i++) { value = (value * 1664525 + 1013904223) >>> 0; pixels[i] = value >>> 24; }
  const image = await sharp(pixels, {raw:{width:2400,height:1600,channels:3}}).jpeg({quality:95}).withMetadata({orientation:6}).toBuffer();
  await page.goto('/');
  const result = await page.evaluate(async base64 => {
    // @ts-expect-error Vite browser module
    const {preparePhoto} = await import('/src/photos.ts');
    // @ts-expect-error Vite browser module
    const {cloudRepository} = await import('/src/supabase.ts');
    const file = new File([Uint8Array.from(atob(base64), c=>c.charCodeAt(0))], 'camera.jpg', {type:'image/jpeg'});
    const saved: File[] = [];
    const repo = cloudRepository({
      rpc: async (name:string)=>({data:name==='current_workspace'?'workspace':null,error:null}),
      storage: {from:()=>({upload:async (_path:string, photo:File)=>{saved.push(photo);return {error:null};}})},
      functions: {invoke:async (_name:string,{body}:{body:FormData})=>{saved.push(body.get('photo') as File);return {data:{saved:true},error:null};}},
    });
    await repo.saveDog({name:'Synthetic camera dog'}, file);
    await repo.replacePhoto({id:'dog',photo_path:'old.jpg'}, file);
    const sizes = await Promise.all(saved.map(async photo=>{
      const bitmap=await createImageBitmap(photo);
      const size={width:bitmap.width,height:bitmap.height,bytes:photo.size,type:photo.type}; bitmap.close(); return size;
    }));
    let rejected=false;
    try { await preparePhoto(new File(['broken'], 'broken.jpg',{type:'image/jpeg'})); } catch {rejected=true;}
    return {sizes,rejected,original:file.size};
  }, image.toString('base64'));
  expect(result.rejected).toBe(true);
  expect(result.sizes).toHaveLength(2);
  for (const size of result.sizes) {
    expect(size.type).toBe('image/webp');
    expect(size.height).toBe(1024); // EXIF rotation preserved
    expect(size.width).toBe(683);
    expect(size.bytes).toBeLessThan(result.original / 3);
  }
});

test('keeps transparency and avoids enlarging small photos', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    // @ts-expect-error Vite browser module
    const {preparePhoto}=await import('/src/photos.ts');
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,32,32);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!), 'image/png'));
    const prepared=await preparePhoto(new File([blob],'transparent.png',{type:'image/png'}));
    const image=await createImageBitmap(prepared);ctx.clearRect(0,0,64,32);ctx.drawImage(image,0,0);
    return {width:image.width,height:image.height,alpha:ctx.getImageData(63,31,1,1).data[3]};
  });
  expect(result).toEqual({width:64,height:32,alpha:0});
});
