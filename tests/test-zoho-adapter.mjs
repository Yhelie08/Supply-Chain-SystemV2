import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { zohoAdapter } from '../server/zoho/adapter.mjs';
import { metrics } from '../server/zoho/limits.mjs';

async function test() {
  console.log('--- TEST 1: getRecords for All_Suppliers ---');
  const res1 = await zohoAdapter.getRecords({ report_name: 'All_Suppliers' });
  console.log('Result code:', res1.code);
  console.log('Suppliers count:', res1.data?.length);

  const first = res1.data[0];
  console.log('First supplier ID:', first?.ID);

  console.log('\n--- TEST 2: getRecordById ---');
  if (first?.ID) {
    const res2 = await zohoAdapter.getRecordById({ report_name: 'All_Suppliers', id: first.ID });
    console.log('Fetched record ID:', res2.data?.ID, 'Name:', res2.data?.Supplier_Name?.zc_display_value);
  }

  console.log('\n--- TEST 3: Cache Hit Verification ---');
  const start = Date.now();
  await zohoAdapter.getRecords({ report_name: 'All_Suppliers' });
  console.log('2nd call completed in:', Date.now() - start, 'ms');
  console.log('Metrics:', metrics);
}

test().catch(console.error);
