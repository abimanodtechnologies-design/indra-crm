export function requestLocation(geo, options) {
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
  const timer=setTimeout(()=>finish(reject,{code:3}),options.timeout+1000);
  try{geo.getCurrentPosition(p=>finish(resolve,p),e=>finish(reject,e),options);}catch(e){finish(reject,e);}
 });
}
export async function captureLocation(geo=navigator.geolocation, secure=window.isSecureContext){
 if(!secure)throw new Error('Location requires localhost or HTTPS. Open http://localhost:5000 on the server PC; office-network HTTP addresses cannot capture location.');
 if(!geo)throw new Error('This browser does not provide location access. Try Chrome or Edge at http://localhost:5000.');
 try{
  let p;
  try{p=await requestLocation(geo,{enableHighAccuracy:true,timeout:12000,maximumAge:0});}
  catch(e){if(e.code===1)throw e;p=await requestLocation(geo,{enableHighAccuracy:false,timeout:12000,maximumAge:0});}
  const {latitude,longitude,accuracy}=p.coords;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('The device returned invalid coordinates. Please retry.');
  return {gpsLatitude:Number(latitude.toFixed(7)),gpsLongitude:Number(longitude.toFixed(7)),gpsAccuracy:Number.isFinite(accuracy)?Math.round(accuracy):'',gpsCapturedAt:new Date(p.timestamp||Date.now()).toISOString(),gpsSource:'lead_form'};
 }catch(e){
  if(e.code===1)throw new Error('Location access is blocked. Allow Location in your browser site permissions and turn on Windows Settings > Privacy & security > Location. If this embedded browser cannot grant access, open http://localhost:5000 in Chrome or Edge.');
  if(e.code===2||e.code===3)throw new Error('Your device could not determine its location. Check Windows Location services and your network connection, then retry in Chrome or Edge. Desktop PCs may not have GPS.');
  throw e;
 }
}
