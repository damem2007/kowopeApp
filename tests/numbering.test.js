import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInvoiceNumber, validateInvoiceFormat, resolveInvoiceBusiness, nextInvoiceNumber } from '../server/services/invoice-numbering.js';
import { addInterval, runDueSchedules } from '../server/services/recurrence.js';
import { placeholders } from '../server/db/sql-params.js';
import { assertDatabaseAdapter } from '../server/db/adapter.js';

const businesses = [
  {id:1, organization_id: 9, user_id:null, invoice_prefix:'ABC/', invoice_number_padding:3, invoice_number_format:'{PREFIX}{YYYY}/{NUMBER}'},
  {id:2, organization_id: 9, user_id:null, invoice_prefix:'X-', invoice_number_padding:5, invoice_number_format:'{YY}-{PREFIX}{NUMBER}'},
];

test('business formats preserve prefix, token order, and padding', () => {
  assert.equal(formatInvoiceNumber(businesses[0], 2, '2026-11-10'), 'ABC/2026/002');
  assert.equal(formatInvoiceNumber(businesses[1], 12, '2026-11-10'), '26-X-00012');
  assert.throws(() => validateInvoiceFormat('ABC-2026'), /NUMBER/);
  assert.throws(() => validateInvoiceFormat('{UNSUPPORTED}-{NUMBER}'), /Unsupported/);
  assert.throws(() => validateInvoiceFormat('{PREFIX}{NUMBER'), /brace/);
});

test('resolveInvoiceBusiness refuses ambiguous multi-business selection', async () => {
  const database = { many: async () => businesses };
  await assert.rejects(() => resolveInvoiceBusiness(database, {organizationId:9,userId:'owner'}), /Multiple business/);
  assert.equal((await resolveInvoiceBusiness(database, {organizationId:9,userId:'owner',businessProfileId:2})).id, 2);
  await assert.rejects(() => resolveInvoiceBusiness(database, {organizationId:9,userId:'owner',businessProfileId:3}), /not found/);
});

test('SQLite placeholders converter leaves question marks in quoted SQL intact', () => {
  assert.equal(placeholders("SELECT '?' AS q, x FROM t WHERE a = ? AND b = ?"), "SELECT '?' AS q, x FROM t WHERE a = $1 AND b = $2");
  assert.equal(placeholders('SELECT ? -- comment ?\n WHERE b = ?'), 'SELECT $1 -- comment ?\n WHERE b = $2');
});

test('recurrence date advances and clamps month end', () => {
  assert.equal(addInterval('2026-01-31','monthly'),'2026-02-28');
  assert.equal(addInterval('2026-01-31','Monthly'),'2026-02-28');
  assert.equal(addInterval('2026-12-31','yearly'),'2027-12-31');
  assert.throws(() => addInterval('2026-11-10','not-a-frequency'), /Unsupported/);
});

function makeDatabase({ invalidClient=false, identicalFormats=false, finiteSchedule=false }={}) {
  const profiles = structuredClone(businesses);
  if (identicalFormats) {
    profiles[1].invoice_prefix=profiles[0].invoice_prefix;
    profiles[1].invoice_number_padding=profiles[0].invoice_number_padding;
    profiles[1].invoice_number_format=profiles[0].invoice_number_format;
  }
  const data = {
    businesses: profiles,
    schedules: [
      {id:11,client_id:'c11',description:'kowope:v1:encrypted-service-11',organization_id:9,user_id:null,business_profile_id:1,frequency:'Monthly',currency_code:'CAD',status:'active',next_run_at:'2026-11-10',end_at:finiteSchedule?'2026-11-10':null},
      {id:12,client_id:'c12',description:'kowope:v1:encrypted-service-12',organization_id:9,user_id:null,business_profile_id:2,frequency:'weekly',currency_code:'USD',status:'active',next_run_at:'2026-11-10'},
    ],
    clients: [{id:'c11',name:'kowope:v1:client11',email:'kowope:v1:email11'}, ...(invalidClient?[]:[{id:'c12',name:'kowope:v1:client12',email:'kowope:v1:email12'}])],
    price: [{schedule_id:11,effective_from:'2026-01-01',amount:100}, {schedule_id:12,effective_from:'2026-01-01',amount:200}],
    invoices:[],lines:[],sequences:new Map(),locked:false,inTx:false,
  };
  const database = {
    async many(sql,params){
      if(sql.includes('FROM business_profile'))return data.businesses.filter(p=>p.organization_id===params[0]);
      throw new Error('Unhandled many '+sql);
    },
    async maybeOne(sql,params=[]){
      if(/FROM\s+invoices\s+WHERE\s+schedule_id/.test(sql))return data.invoices.find(i=>i.schedule_id===params[0]&&i.issue_date===params[1]);
      if(sql.includes('FROM schedule_price_history'))return data.price.find(x=>x.schedule_id===params[0]&&x.effective_from<=params[1]);
      if(/FROM\s+clients\s+WHERE\s+id/.test(sql))return data.clients.find(x=>x.id===params[0]);
      if(sql.includes('INSERT INTO invoice_sequences')){const n=data.sequences.get(params[0])||1;data.sequences.set(params[0],n+1);return {allocated:n};}
      if(/FROM\s+invoices\s+WHERE\s+number/.test(sql))return data.invoices.find(x=>x.number===params[0]);
      throw new Error('Unhandled maybeOne '+sql);
    },
    async execute(sql,params){
      if(sql.includes('INSERT INTO invoices')){
        const [id,number,client_id,client_name,client_email,description,amount,currency,due_date,status,schedule_id,issue_date,organization_id,user_id,business_profile_id]=params;
        data.invoices.push({id,number,client_id,client_name,client_email,description,amount,currency,due_date,status,schedule_id,issue_date,organization_id,user_id,business_profile_id});return {changes:1};
      }
      if(sql.includes('INSERT INTO line_items')){data.lines.push(params);return {changes:1};}
      if(sql.includes('UPDATE recurring_schedules')){const schedule=data.schedules.find(s=>s.id===params[3]);schedule.frequency=params[0];schedule.next_run_at=params[1];schedule.status=params[2];return {changes:1};}
      throw new Error('Unhandled execute '+sql);
    },
    async lockRecurring(){assert(data.inTx);data.locked=true;},
    async lockInvoiceNumbering(){assert(data.inTx);},
    async getDueRecurringSchedules(cutoff){assert(data.inTx);return data.schedules.filter(x=>x.status==='active'&&x.next_run_at<=cutoff);},
    transaction(callback){return async (...args)=>{
      const snapshot={schedules:structuredClone(data.schedules),invoices:structuredClone(data.invoices),lines:structuredClone(data.lines),sequences:new Map(data.sequences)};
      data.inTx=true;
      try{return await callback(...args)}
      catch(error){Object.assign(data,snapshot);throw error}
      finally{data.inTx=false}
    }},
    async query(){return {rows:[]}},async one(){return {}},async close(){},
  };
  return {database,data};
}

test('recurring invoices use individual business numbering and preserve ciphertext snapshots', async () => {
  const {database,data}=makeDatabase();
  assertDatabaseAdapter(database);
  const created=await runDueSchedules(database,'2026-11-10');
  assert.deepEqual(created,['ABC/2026/001','26-X-00001']);
  assert.equal(data.invoices[0].client_name,'kowope:v1:client11');
  assert.equal(data.invoices[0].description,'kowope:v1:encrypted-service-11');
  assert.equal(data.invoices[0].business_profile_id,1);
  assert.equal(data.invoices[1].business_profile_id,2);
  assert.equal(data.schedules[0].frequency,'monthly');
  assert.equal((await runDueSchedules(database,'2026-11-10')).length,0);
  assert.equal(data.invoices.length,2);
});

test('finite recurring schedules complete after their final selected occurrence', async () => {
  const {database,data}=makeDatabase({finiteSchedule:true});
  const created=await runDueSchedules(database,'2026-12-10');
  assert.deepEqual(created,['ABC/2026/001','26-X-00001','26-X-00002','26-X-00003','26-X-00004','26-X-00005']);
  assert.equal(data.schedules[0].status,'completed');
  assert.equal(data.schedules[0].next_run_at,'2026-12-10');
  assert.equal(data.invoices.filter(invoice=>invoice.schedule_id===11).length,1);
});

test('same global prefix across businesses avoids duplicate invoice identifiers', async () => {
  const {database,data}=makeDatabase({identicalFormats:true});
  const created=await runDueSchedules(database,'2026-11-10');
  assert.deepEqual(created,['ABC/2026/001','ABC/2026/002']);
  assert.equal(data.invoices.length,2);
});

test('a failure rolls back invoices, counters, and schedule advancement', async () => {
  const {database,data}=makeDatabase({invalidClient:true});
  await assert.rejects(() => runDueSchedules(database,'2026-11-10'), /does not exist/);
  assert.equal(data.invoices.length,0);
  assert.equal(data.lines.length,0);
  assert.equal(data.schedules[0].next_run_at,'2026-11-10');
});
