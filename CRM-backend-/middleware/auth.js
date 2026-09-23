const jwt=require('jsonwebtoken');
const pool=require('../config/database');
module.exports=async function authenticateToken(req,res,next){
 const token=req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return res.status(401).json({error:'Access token required',code:'NO_TOKEN'});
 let user;try{user=jwt.verify(token,process.env.JWT_SECRET);}catch(err){return res.status(401).json({error:'Invalid or expired token',code:'INVALID_TOKEN'});}
 try{
  const {rows}=await pool.query('SELECT id,status FROM users WHERE id=$1',[user.id]);
  if(!rows[0]||String(rows[0].status).toLowerCase()!=='active')return res.status(401).json({error:'Account is inactive or unavailable',code:'ACCOUNT_INACTIVE'});
  req.user=user;next();
 }catch(err){res.status(503).json({error:'Unable to verify account. Check the database connection.'});}
};
