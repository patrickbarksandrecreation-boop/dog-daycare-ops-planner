const allowedHost=host=>['petboost.com','business.petboost.com','petboost-business.au.auth0.com'].includes(host.toLowerCase().replace(/^\./,''));
export function setupState(state,{filter=false}={}) {
  if(!state || !Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw Error('Invalid login state');
  const validCookie=c=>c && typeof c.domain==='string' && allowedHost(c.domain) && typeof c.name==='string' && typeof c.value==='string';
  const validOrigin=o=>{
    try {const u=new URL(o.origin);return u.protocol==='https:' && allowedHost(u.hostname) && !u.username && !u.password && u.origin===o.origin;}
    catch {return false;}
  };
  if(!filter && (state.cookies.some(c=>!validCookie(c)) || state.origins.some(o=>!validOrigin(o)))) throw Error('Unexpected login origin');
  const output={cookies:state.cookies.filter(validCookie),origins:state.origins.filter(validOrigin)};
  if(!output.cookies.length && !output.origins.length) throw Error('Missing login state');
  return output;
}
