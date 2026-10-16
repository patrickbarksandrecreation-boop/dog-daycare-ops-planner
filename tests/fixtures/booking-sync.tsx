import React from 'react';
import {createRoot} from 'react-dom/client';
import {BookingSync} from '../../src/components/BookingSync';
import {todayBrisbane} from '../../src/model';
import '../../src/styles.css';
const control={requests:0,refreshes:0, sync:{enabled:true,last_success_at:null,last_success_date:null,
  last_error_code:null,heartbeat_at:new Date().toISOString(),requested_at:null,claimed_request_at:null,
  lease_until:null,last_attempt_at:null,missingDogIds:[]} as any};
Object.assign(window,{control});
const repo:any={bookingSync:async()=>structuredClone(control.sync),requestBookingSync:async()=>{
  control.requests++; control.sync.requested_at=new Date().toISOString();
}};
createRoot(document.getElementById('root')!).render(<BookingSync repo={repo} date={todayBrisbane()}
  dogs={[{id:'synthetic',name:'Synthetic Dog',photo_path:null,is_archived:false}]} editable refresh={()=>{control.refreshes++;}}/>);
