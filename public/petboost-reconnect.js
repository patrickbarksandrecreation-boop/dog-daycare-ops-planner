// Credentials and the one-use capability live only in this page's memory.
// No analytics, third-party scripts, cookies or browser storage are used.
const endpoint='/.netlify/functions/petboost-mobile';
const $=id=>document.getElementById(id);
let token='',run='',revision=-1,timer,polling=false,pending=false,currentStatus='',lastView=-1,ended=false,savedSince=0;
const fragment=new URLSearchParams(location.hash.slice(1));
const linkedCode=fragment.get('code');
if(location.hash)history.replaceState(null,'',location.pathname);
if(/^[a-f0-9]{64}$/.test(linkedCode||'')){$('code').value=linkedCode;}
function message(text){$('status').textContent=text;}
function error(text){$('error').textContent=text;$('error').hidden=!text;}
function schedulePoll(ms){clearTimeout(timer);timer=setTimeout(poll,ms);}
async function api(op,extra={}) {
  const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(endpoint,{method:'POST',cache:'no-store',credentials:'omit',redirect:'error',
      headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({op,...(run?{run}:{}),...extra}),signal:controller.signal});
    const result=await response.json();
    if(!response.ok){const e=new Error(result.error||'Reconnect request failed.');e.status=response.status;throw e;}
    return result;
  } finally {clearTimeout(deadline);}
}
function lockForm(disabled){for(const el of $('login-form').elements)el.disabled=disabled;}
function finish(text,{retry=false}={}) {
  clearTimeout(timer);ended=true;message(text);$('cancel').hidden=true;$('login-form').hidden=true;
  $('login-form').reset();$('fields').replaceChildren();$('actions').replaceChildren();$('retry').hidden=!retry;
  if(!retry){token='';$('code').value='';}
}
function render(result) {
  run=result.run;revision=result.revision;currentStatus=result.status;
  $('code-form').hidden=true;$('cancel').hidden=['saved','failed','cancelled','expired'].includes(result.status);
  $('retry').hidden=true;
  if(result.status==='saved') {
    $('login-form').hidden=true;$('login-form').reset();$('fields').replaceChildren();$('actions').replaceChildren();
    savedSince ||= Date.now();
    if(result.verification==='verified')return finish('Petboost login saved and verified on the worker. Automatic sync settings are unchanged.');
    if(result.verification==='failed')return finish('Petboost login saved. The worker check failed; ask your administrator to review it before syncing.');
    if(Date.now()-savedSince>9*60*1000)return finish('Petboost login saved. The worker check has not been confirmed; ask your administrator to review it.');
    message('Petboost login saved. Checking the renewed session on the worker…');return;
  }
  if(['failed','expired','cancelled'].includes(result.status))return finish(result.status==='cancelled'?'Reconnect cancelled. The saved worker login was not changed.':
    'The login browser stopped or timed out. Start again with a current code.',{retry:result.status!=='cancelled'});
  if(result.status!=='ready') {
    lockForm(true);message(result.status==='busy'?'Submitting to Petboost…':'Opening the secure Petboost login browser…');return;
  }
  const view=result.view;
  if(view.notice==='unsupported'){
    $('login-form').hidden=true;message('This login screen needs the desktop reconnect helper. Cancel here to close the worker browser.');return;
  }
  if(view.notice==='loading'){
    $('login-form').hidden=true;message('Waiting for the Petboost login screen…');return;
  }
  message(`Sign in to Petboost for ${result.business}. Complete each step below.`);
  if(view.notice==='rejected')error('Petboost did not accept that step. Check your details and try again.');
  if(lastView===result.revision){lockForm(false);return;}
  lastView=result.revision;$('fields').replaceChildren();$('actions').replaceChildren();
  for(const field of view.fields) {
    const label=document.createElement('label'),input=document.createElement('input');
    input.id=`login-field-${field.id}`;input.name=`field-${field.id}`;label.htmlFor=input.id;label.textContent=field.label;
    input.type=field.kind==='password'?'password':field.kind==='email'?'email':'text';
    input.autocomplete=field.kind==='password'?'current-password':field.kind==='email'?'username':'one-time-code';
    input.autocapitalize='off';input.spellcheck=false;input.required=field.required;input.maxLength=field.maxLength;
    $('fields').append(label,input);
  }
  for(const action of view.buttons){const button=document.createElement('button');button.type='submit';button.value=String(action.id);
    button.className='primary';button.textContent=action.label;$('actions').append(button);}
  $('login-form').hidden=false;
}
async function poll() {
  if(polling || pending || ended)return;
  polling=true;
  const previousRun=run;
  try {const result=await api('read');if(!pending && !ended && run===previousRun){error('');render(result);}}
  catch(e){if(!pending && !ended && run===previousRun){lockForm(true);error(e.status===401?e.message:'Connection interrupted. Reconnecting to the login browser…');if(e.status===401)finish('A fresh reconnect code is needed.');}}
  finally{polling=false;if(!ended)schedulePoll(2000);}
}
async function start() {
  if(pending)return;error('');pending=true;ended=false;run='';lastView=-1;savedSince=0;clearTimeout(timer);
  $('retry').hidden=true;$('code-form').querySelector('button').disabled=true;
  message('Starting your secure login browser…');
  try{render(await api('start'));if(!ended)schedulePoll(1000);}
  catch(e){error(e.message);$('code-form').hidden=false;message('Use a current one-use reconnect code.');}
  finally{pending=false;$('code-form').querySelector('button').disabled=false;}
}
$('code-form').addEventListener('submit',e=>{e.preventDefault();const value=$('code').value.trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(value))return error('Enter the full 64-character reconnect code.');
  token=value;$('code').value='';void start();});
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(pending || currentStatus!=='ready')return;pending=true;clearTimeout(timer);error('');
  const button=Number(e.submitter?.value??0),values=Array.from($('fields').querySelectorAll('input')).map(el=>({field:Number(el.name.slice(6)),value:el.value}));
  lockForm(true);message('Submitting to Petboost…');
  try{render(await api('command',{revision,command:{button,values}}));}
  catch(e){error(e.message);}
  finally{for(const field of values)field.value='';$('login-form').reset();pending=false;if(!ended)schedulePoll(500);}
});
$('cancel').addEventListener('click',async()=>{
  if(pending)return;pending=true;clearTimeout(timer);error('');lockForm(true);
  try{render(await api('cancel'));}
  catch{error('Cancellation was not confirmed. The login browser will close automatically when it expires.');if(!ended)schedulePoll(1000);}
  finally{pending=false;}
});
$('retry-button').addEventListener('click',()=>void start());
// Explicit Start keeps the one-use link from opening a worker browser merely
// because a link previewer or accidental tap loaded the page.
