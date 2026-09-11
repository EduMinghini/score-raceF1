import fs from 'node:fs';
import bcrypt from 'bcryptjs';

const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
let bootstrapPromise;

export function ensureDatabase(pool) {
  if (!bootstrapPromise) bootstrapPromise = bootstrap(pool);
  return bootstrapPromise;
}

async function bootstrap(pool) {
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
  for (const driver of [
    ['Edu Minghini','BR','196','edu-minghini'],['Gabriel Minghini','BR','19','gabriel-minghini'],
    ['Marcos Delesposte','BR','7','marcos-delesposte'],['Rafael Costa','BR','44','rafael-costa'],
    ['Bruno Lima','BR','11','bruno-lima']
  ]) await pool.query(`INSERT INTO drivers(display_name,country_code,number,public_slug) VALUES($1,$2,$3,$4) ON CONFLICT(public_slug) DO NOTHING`,driver);
  const drivers=(await pool.query(`SELECT id,public_slug FROM drivers WHERE public_slug IN ('edu-minghini','gabriel-minghini','marcos-delesposte','rafael-costa','bruno-lima') ORDER BY display_name`)).rows;
  for (const driver of drivers) await pool.query(`INSERT INTO organization_drivers(organization_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[org.id,driver.id]);
  for (let round=1;round<=3;round++) {
    await pool.query(`INSERT INTO events(season_id,name,round_no,event_date,location_name,state,published_at,publication_version) VALUES($1,$2,$3,$4,'Kartódromo Granja Viana','PUBLISHED',now(),1) ON CONFLICT(season_id,round_no) DO NOTHING`,[season.id,`Etapa ${round}`,round,`2026-0${round+4}-18`]);
    const event=(await pool.query(`SELECT id FROM events WHERE season_id=$1 AND round_no=$2`,[season.id,round])).rows[0];
    let position=1;
    for (const driver of drivers) {
      const grid=((position+round)%drivers.length)+1;
      const points=Math.max(0,26-position*3)+(position===1?2:0);
      await pool.query(`INSERT INTO event_entries(event_id,driver_id,category_id,payment_status) VALUES($1,$2,$3,'PAID') ON CONFLICT DO NOTHING`,[event.id,driver.id,cat.id]);
      await pool.query(`INSERT INTO results(event_id,driver_id,category_id,track_position,official_position,grid_position,pole,fastest_lap,base_points,bonus_points,total_points) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(event_id,driver_id) DO NOTHING`,[event.id,driver.id,cat.id,position,grid,position===1&&round===1,position===2&&round===2,points-(position===1?2:0),position===1?2:0,points]);
      position++;
    }
  }
  await pool.query(`INSERT INTO entitlements(organization_id,key,value) VALUES($1,'EVENT_CREDITS','{"remaining":12}') ON CONFLICT(organization_id,key) DO NOTHING`,[org.id]);
}
