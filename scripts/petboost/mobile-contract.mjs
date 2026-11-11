// Shared, bounded wire format. Never accept a selector, URL or script from a phone.
export const MOBILE_PATH='/.netlify/functions/petboost-mobile';
export const validRun=value=>typeof value==='string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function mobileCommand(value) {
  if(!value || typeof value!=='object' || !Number.isInteger(value.button) || value.button<0 || value.button>7
    || !Array.isArray(value.values) || value.values.length>6)throw Error('Invalid login action');
  const seen=new Set();
  for(const field of value.values) {
    if(!field || !Number.isInteger(field.field) || field.field<0 || field.field>5 || seen.has(field.field)
      || typeof field.value!=='string' || field.value.length>1024)throw Error('Invalid login field');
    seen.add(field.field);
  }
  return {button:value.button,values:value.values.map(({field,value})=>({field,value}))};
}
