import {verifyAfterDeploy} from '../../../scripts/petboost/verify-after-deploy.mjs';
export async function onSuccess({inputs}) {
  try {
    const result=await verifyAfterDeploy({verificationId:inputs.verification_id});
    console.log('Petboost read-only verification dispatch:',result.status);
  } catch {
    // Never print exceptions: they may contain provider/session/configuration data.
    console.error('Petboost read-only verification could not be dispatched; check its recorded status.');
  }
}
