import {dispatch,deploymentEnv} from '../../scripts/petboost/netlify-runtime.mjs';
export default async(_request,context)=>{await dispatch(deploymentEnv(context));};
// Brisbane Monday-Friday 10:30 and 11:30 = UTC Monday-Friday.
export const config={schedule:'30 0-1 * * 1-5'};
