import { zohoAdapter } from '../server/zoho/adapter.mjs';

async function test() {
  console.log('Testing zohoAdapter.getRecords for All_Suppliers...');
  const res = await zohoAdapter.getRecords({ report_name: 'All_Suppliers' });
  console.log('Result code:', res.code);
  console.log('Suppliers count:', res.data?.length);
  if (res.data?.length > 0) {
    console.log('First supplier:', res.data[0].Supplier_Name);
    console.log('Second supplier:', res.data[1]?.Supplier_Name);
  }
}

test().catch(console.error);
