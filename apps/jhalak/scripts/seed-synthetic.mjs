/** Four fictional local sites; creates no accounts, credentials or provider requests. */
import { q, getPool } from '../src/lib/db.ts';
const host=new URL(process.env.DATABASE_URL || '').hostname;
if (!['localhost','127.0.0.1','[::1]'].includes(host)) throw new Error('Synthetic seeding is restricted to a local PostgreSQL database.');
const sites=[
 ['meera-boutique','Meera Boutique','boutique','elegant','emerald'],
 ['dr-mehta-clinic','Dr. Mehta Family Clinic','clinic','professional','blue'],
 ['kora-cafe','Kora Café','restaurant','minimal','stone'],
 ['glow-grace-salon','Glow & Grace Salon','salon','bold','violet'],
];
try {
 for(const [slug,name,category,template,accent] of sites){
  const existing=await q('select id from jhalak.businesses where slug=$1',[slug]);
  if(existing.length){console.log(`${slug}: already exists; unchanged`);continue;}
  const [business]=await q("insert into jhalak.businesses (slug,name,category,city,phone,whatsapp,template,status) values ($1,$2,$3,'Fictional City','','',$4,'published') returning id",[slug,name,category,template]);
  const content={headline:name,tagline:'A fictional business for exploring this template.',about:'Synthetic sample created for local development. This is not a real business and does not accept enquiries.',accent,font:'sans',cta_label:'Explore the catalogue',services:[{title:'Example offering',desc:'Replace this sample with your own business details.'}],pages:{},tabs_config:[{key:'products',label:'Our Products',enabled:true},{key:'about',label:'About Us',enabled:true},{key:'gallery',label:'Gallery',enabled:true},{key:'contact',label:'Contact',enabled:true}]};
  await q('insert into jhalak.site_content (business_id,content) values ($1,$2)',[business.id,JSON.stringify(content)]);
  console.log(`${slug}: synthetic template created`);
 }
} finally { await getPool().end(); }
