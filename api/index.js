import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDatabase } from '../db/bootstrap.js';
const { Pool } = pg;
const app = express();
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const pool = connectionString ? new Pool({connectionString,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:5000}) : null;
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(process.cwd(),'public');

app.use(express.json({ limit: '1mb' }));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});
app.use(express.static(publicDir));

function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i).trim(),decodeURIComponent(v.slice(i+1))]}));}
function auth(req,res,next){try{req.user=jwt.verify(cookies(req).sr_token,SECRET);next();}catch{res.status(401).json({error:'Não autenticado'});}}
async function orgAccess(req,res,next){
 const orgId=req.params.orgId||req.body.organizationId;
 if(req.user.globalRole==='SUPER_ADMIN') return next();
 const q=await pool.query('SELECT role FROM memberships WHERE user_id=$1 AND organization_id=$2',[req.user.id,orgId]);
 if(!q.rowCount)return res.status(403).json({error:'Sem acesso à organização'}); req.orgRole=q.rows[0].role; next();
}
async function audit({orgId,userId,action,entityType,entityId,metadata={}}){await pool.query('INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',[orgId,userId,action,entityType,entityId,metadata]);}

app.get('/api/health',(_,res)=>res.json({ok:true,service:'scorerace'}));
app.use('/api',async(req,res,next)=>{
 if(!pool)return res.status(503).json({error:'Banco de dados não conectado ao projeto'});
 try{await ensureDatabase(pool);next()}catch(error){console.error('[database] Falha na inicialização',error);res.status(503).json({error:'Banco de dados indisponível'});}
});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body;const q=await pool.query('SELECT * FROM users WHERE lower(email)=lower($1)',[email]);if(!q.rowCount||!(await bcrypt.compare(password,q.rows[0].password_hash)))return res.status(401).json({error:'Credenciais inválidas'});const u=q.rows[0];const orgs=(await pool.query(`SELECT o.id,o.name,o.slug,m.role FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1`,[u.id])).rows;const token=jwt.sign({id:u.id,name:u.name,email:u.email,globalRole:u.global_role,orgs},SECRET,{expiresIn:'8h'});res.cookie('sr_token',token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*3600*1000});res.json({user:{id:u.id,name:u.name,email:u.email,globalRole:u.global_role,orgs}})});
app.post('/api/auth/logout',(_,res)=>{res.clearCookie('sr_token');res.json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));

app.get('/api/public/home',async(_,res)=>{const orgs=(await pool.query(`SELECT id,name,slug,accent FROM organizations WHERE public_enabled=true AND plan_status IN ('PAID','TRIAL') ORDER BY (plan_status='PAID') DESC,name LIMIT 12`)).rows;const next=(await pool.query(`SELECT e.id,e.name,e.event_date,e.location_name,c.name championship,o.name organization,o.slug FROM events e JOIN seasons s ON s.id=e.season_id JOIN championships c ON c.id=s.championship_id JOIN organizations o ON o.id=c.organization_id WHERE e.event_date>=current_date AND o.public_enabled=true ORDER BY e.event_date LIMIT 8`)).rows;res.json({organizations:orgs,nextEvents:next})});
app.get('/api/public/org/:slug',async(req,res)=>{const oq=await pool.query(`SELECT id,name,slug,accent FROM organizations WHERE slug=$1 AND public_enabled=true`,[req.params.slug]);if(!oq.rowCount)return res.status(404).json({error:'Organização não encontrada'});const o=oq.rows[0];const champs=(await pool.query(`SELECT c.id,c.name,c.slug,c.modality,c.status FROM championships c WHERE c.organization_id=$1 ORDER BY c.created_at DESC`,[o.id])).rows;res.json({organization:o,championships:champs})});
app.get('/api/public/championship/:id/standings',async(req,res)=>{const q=await pool.query(`SELECT d.id,d.display_name,d.number,d.country_code,d.public_slug,COUNT(r.id)::int races,SUM(CASE WHEN r.official_position=1 THEN 1 ELSE 0 END)::int wins,SUM(CASE WHEN r.official_position<=3 THEN 1 ELSE 0 END)::int podiums,COALESCE(SUM(r.total_points),0)::float points FROM championships c JOIN seasons s ON s.championship_id=c.id JOIN events e ON e.season_id=s.id AND e.state IN ('PUBLISHED','REPUBLISHED') JOIN results r ON r.event_id=e.id JOIN drivers d ON d.id=r.driver_id WHERE c.id=$1 GROUP BY d.id,d.display_name,d.number,d.country_code,d.public_slug ORDER BY points DESC,wins DESC,podiums DESC,d.display_name`,[req.params.id]);res.json({standings:q.rows})});

app.get('/api/org/:orgId/dashboard',auth,orgAccess,async(req,res)=>{const {orgId}=req.params;const [summary,champs,credits,recent]=await Promise.all([
 pool.query(`SELECT (SELECT count(*) FROM championships WHERE organization_id=$1 AND status='ACTIVE')::int active_championships,(SELECT count(*) FROM organization_drivers WHERE organization_id=$1 AND active=true)::int active_drivers,(SELECT count(*) FROM events e JOIN seasons s ON s.id=e.season_id JOIN championships c ON c.id=s.championship_id WHERE c.organization_id=$1 AND e.state IN ('CLOSED','PUBLISHED','REPUBLISHED'))::int closed_events`,[orgId]),
 pool.query(`SELECT c.id,c.name,c.slug,c.modality,c.status,COUNT(DISTINCT e.id)::int events FROM championships c LEFT JOIN seasons s ON s.championship_id=c.id LEFT JOIN events e ON e.season_id=s.id WHERE c.organization_id=$1 GROUP BY c.id ORDER BY c.created_at DESC`,[orgId]),
 pool.query(`SELECT value FROM entitlements WHERE organization_id=$1 AND key='EVENT_CREDITS'`,[orgId]),
 pool.query(`SELECT a.action,a.entity_type,a.created_at,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 8`,[orgId])]);
 res.json({summary:summary.rows[0],championships:champs.rows,credits:credits.rows[0]?.value||{remaining:0},recent:recent.rows})});

app.post('/api/org/:orgId/championships',auth,orgAccess,async(req,res)=>{const {name,slug,modality='KART'}=req.body;if(!name||!slug)return res.status(400).json({error:'Nome e slug são obrigatórios'});const q=await pool.query(`INSERT INTO championships(organization_id,name,slug,modality,status) VALUES($1,$2,$3,$4,'ACTIVE') RETURNING *`,[req.params.orgId,name,slug,modality]);await audit({orgId:req.params.orgId,userId:req.user.id,action:'CHAMPIONSHIP_CREATED',entityType:'championship',entityId:q.rows[0].id});res.status(201).json(q.rows[0])});

app.post('/api/org/:orgId/events/:eventId/close',auth,orgAccess,async(req,res)=>{const credit=await pool.query(`SELECT id,(value->>'remaining')::int remaining FROM entitlements WHERE organization_id=$1 AND key='EVENT_CREDITS' FOR UPDATE`,[req.params.orgId]);if(!credit.rowCount||credit.rows[0].remaining<=0)return res.status(409).json({error:'Sem créditos de etapa'});const ev=await pool.query(`UPDATE events e SET state='CLOSED' FROM seasons s,championships c WHERE e.id=$1 AND e.season_id=s.id AND s.championship_id=c.id AND c.organization_id=$2 AND e.state='DRAFT' RETURNING e.*`,[req.params.eventId,req.params.orgId]);if(!ev.rowCount)return res.status(409).json({error:'Etapa inexistente ou não está em rascunho'});await pool.query(`UPDATE entitlements SET value=jsonb_set(value,'{remaining}',to_jsonb(((value->>'remaining')::int-1))) WHERE id=$1`,[credit.rows[0].id]);await pool.query(`INSERT INTO credit_ledger(organization_id,event_id,delta,reason,created_by) VALUES($1,$2,-1,'Encerramento de etapa',$3)`,[req.params.orgId,req.params.eventId,req.user.id]);await audit({orgId:req.params.orgId,userId:req.user.id,action:'EVENT_CLOSED',entityType:'event',entityId:req.params.eventId});res.json(ev.rows[0])});
app.post('/api/org/:orgId/events/:eventId/publish',auth,orgAccess,async(req,res)=>{const ev=await pool.query(`UPDATE events e SET state=CASE WHEN publication_version=0 THEN 'PUBLISHED' ELSE 'REPUBLISHED' END,published_at=now(),publication_version=publication_version+1,republication_reason=$3 FROM seasons s,championships c WHERE e.id=$1 AND e.season_id=s.id AND s.championship_id=c.id AND c.organization_id=$2 AND e.state IN ('CLOSED','PUBLISHED','REPUBLISHED') RETURNING e.*`,[req.params.eventId,req.params.orgId,req.body.reason||null]);if(!ev.rowCount)return res.status(409).json({error:'Etapa não disponível para publicação'});await audit({orgId:req.params.orgId,userId:req.user.id,action:ev.rows[0].state==='REPUBLISHED'?'EVENT_REPUBLISHED':'EVENT_PUBLISHED',entityType:'event',entityId:req.params.eventId,metadata:{reason:req.body.reason||null}});res.json(ev.rows[0])});

app.get('/api/admin/dashboard',auth,async(req,res)=>{if(req.user.globalRole!=='SUPER_ADMIN')return res.status(403).json({error:'Acesso restrito'});const q=await pool.query(`SELECT (SELECT count(*) FROM organizations)::int organizations,(SELECT count(*) FROM organizations WHERE plan_status='PAID')::int paying_orgs,(SELECT count(*) FROM drivers)::int drivers,(SELECT count(*) FROM championships)::int championships,(SELECT count(*) FROM events WHERE state IN ('PUBLISHED','REPUBLISHED'))::int published_events`);const orgs=(await pool.query(`SELECT id,name,slug,plan_status,public_enabled,created_at FROM organizations ORDER BY created_at DESC LIMIT 20`)).rows;res.json({summary:q.rows[0],organizations:orgs})});

app.get('*',(req,res)=>res.sendFile(path.join(publicDir,'index.html')));
export default app;
