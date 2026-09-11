import fs from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
await pool.query(schema);

const pass = await bcrypt.hash('ScoreRace2026!', 10);
await pool.query(`INSERT INTO users(name,email,password_hash,global_role) VALUES
 ('Super Admin','admin@scorerace.com.br',$1,'SUPER_ADMIN'),
 ('Organizador DKR','organizador@dkr.com.br',$1,'USER')
 ON CONFLICT(email) DO NOTHING`, [pass]);
await pool.query(`INSERT INTO organizations(name,slug,accent,plan_status,public_enabled)
 VALUES ('Ditador Kart Racing','dkr','#E10600','PAID',true) ON CONFLICT(slug) DO NOTHING`);
const org = (await pool.query(`SELECT id FROM organizations WHERE slug='dkr'`)).rows[0];
const owner = (await pool.query(`SELECT id FROM users WHERE email='organizador@dkr.com.br'`)).rows[0];
await pool.query(`INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,'OWNER') ON CONFLICT DO NOTHING`,[owner.id,org.id]);
await pool.query(`INSERT INTO championships(organization_id,name,slug,modality,status) VALUES($1,'DKR Championship 2026','dkr-2026','KART','ACTIVE') ON CONFLICT(organization_id,slug) DO NOTHING`,[org.id]);
const champ=(await pool.query(`SELECT id FROM championships WHERE organization_id=$1 AND slug='dkr-2026'`,[org.id])).rows[0];
await pool.query(`INSERT INTO seasons(championship_id,name,starts_on,ends_on,status) SELECT $1,'Temporada 2026','2026-01-01','2026-12-31','ACTIVE' WHERE NOT EXISTS (SELECT 1 FROM seasons WHERE championship_id=$1 AND name='Temporada 2026')`,[champ.id]);
const season=(await pool.query(`SELECT id FROM seasons WHERE championship_id=$1 AND name='Temporada 2026'`,[champ.id])).rows[0];
await pool.query(`INSERT INTO categories(season_id,name,sort_order) SELECT $1,'Geral',1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE season_id=$1 AND name='Geral')`,[season.id]);
const cat=(await pool.query(`SELECT id FROM categories WHERE season_id=$1 AND name='Geral'`,[season.id])).rows[0];
await pool.query(`INSERT INTO scoring_rules(championship_id,version,name) VALUES($1,1,'Padrão DKR 2026') ON CONFLICT(championship_id,version) DO NOTHING`,[champ.id]);
for (const d of [
 ['Edu Minghini','BR','196','edu-minghini'],['Gabriel Minghini','BR','19','gabriel-minghini'],['Marcos Delesposte','BR','7','marcos-delesposte'],['Rafael Costa','BR','44','rafael-costa'],['Bruno Lima','BR','11','bruno-lima']
]) {
 await pool.query(`INSERT INTO drivers(display_name,country_code,number,public_slug) VALUES($1,$2,$3,$4) ON CONFLICT(public_slug) DO NOTHING`,d);
}
const drivers=(await pool.query(`SELECT id,public_slug FROM drivers WHERE public_slug IN ('edu-minghini','gabriel-minghini','marcos-delesposte','rafael-costa','bruno-lima') ORDER BY display_name`)).rows;
for (const d of drivers) await pool.query(`INSERT INTO organization_drivers(organization_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[org.id,d.id]);
for (let r=1;r<=3;r++) {
 await pool.query(`INSERT INTO events(season_id,name,round_no,event_date,location_name,state,published_at,publication_version) VALUES($1,$2,$3,$4,'Kartódromo Granja Viana','PUBLISHED',now(),1) ON CONFLICT(season_id,round_no) DO NOTHING`,[season.id,`Etapa ${r}`,r,`2026-0${r+4}-18`]);
 const ev=(await pool.query(`SELECT id FROM events WHERE season_id=$1 AND round_no=$2`,[season.id,r])).rows[0];
 let pos=1;
 for (const d of drivers) {
   const grid=((pos+r)%drivers.length)+1; const pts=Math.max(0,26-pos*3)+(pos===1?2:0);
   await pool.query(`INSERT INTO event_entries(event_id,driver_id,category_id,payment_status) VALUES($1,$2,$3,'PAID') ON CONFLICT DO NOTHING`,[ev.id,d.id,cat.id]);
   await pool.query(`INSERT INTO results(event_id,driver_id,category_id,track_position,official_position,grid_position,pole,fastest_lap,base_points,bonus_points,total_points)
     VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(event_id,driver_id) DO NOTHING`,[ev.id,d.id,cat.id,pos,grid,pos===1 && r===1,pos===2 && r===2,pts-(pos===1?2:0),pos===1?2:0,pts]);
   pos++;
 }
}
await pool.query(`INSERT INTO entitlements(organization_id,key,value) VALUES($1,'EVENT_CREDITS','{"remaining":12}') ON CONFLICT(organization_id,key) DO UPDATE SET value=excluded.value`,[org.id]);
console.log('ScoreRace database initialized.');
await pool.end();
