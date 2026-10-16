import {dispatch,deploymentEnv} from '../../scripts/petboost/netlify-runtime.mjs';
export default async(_request,context)=>{await dispatch(deploymentEnv(context));};
// Brisbane Monday-Friday 06:30, 07:30, 08:30, 09:30 = UTC Sunday-Thursday.
export const config={schedule:'30 20-23 * * 0-4'};
