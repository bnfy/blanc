import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('combined',HERE/'prepare-combined.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_asset_union_and_no_non_group_change(self):
  result=json.loads((HERE/'combined-manifest-v2.json').read_text());p,g=m.loadprovenance();combined=g.inventory(m.OUTPUT)
  self.assertEqual(result['status'],'prepared_unbuilt_unverified');self.assertEqual(result['asset_count'],78);self.assertEqual(combined,result['asset_inventory'])
  before=p['assets']['preimage_inventory'];group=p['assets']['candidate_inventory']
  self.assertEqual([x for x in sorted(combined) if combined[x]!=before[x]],['pages/newtab-adapter.js','pages/newtab-prototype.css','pages/newtab.js'])
  self.assertEqual([x for x in sorted(combined) if combined[x]!=group[x]],['host.js','overlay.js'])
  for name in ('host.js','overlay.js'):self.assertEqual(combined[name],before[name])
 def test_native_three_way_and_repaired_modules_are_bound(self):
  result=json.loads((HERE/'combined-manifest-v2.json').read_text());data=(m.NATIVE/'chrome/browser/ui/blanc_prototype_ui.cc').read_bytes()
  self.assertEqual(data,m.merge_source());self.assertEqual(m.sha(data),result['combined_native_sha256'])
  receipt,_,modules=m.module_inputs();self.assertEqual(m.sha(receipt.read_bytes()),result['original_search_receipt_sha256'])
  for name,expected in modules.items():self.assertEqual((m.NATIVE/'chrome/browser/ui/modules'/name).read_bytes(),expected)
  self.assertEqual(result['module_sha256']['custom_template.cc'],'cfecac0516a96d6eb62f9ed0f0171dccb3f9ac12747a652fc600a7c516277c0c')
  self.assertEqual(result['generator_sha256'],m.sha((HERE/'prepare-combined.py').read_bytes()))
 def test_receipt_tamper_and_renamed_or_changed_modules_are_rejected(self):
  receipt,r,_=m.module_inputs()
  with tempfile.TemporaryDirectory(prefix='blanc-receipt-check-') as tmp:
   p=Path(tmp)/'receipt.json';p.write_bytes(receipt.read_bytes()+b' ')
   with self.assertRaises(ValueError):m.readsha(p,m.SEARCH_RECEIPT_SHA)
  changed=dict(m.EXPECTED_MODULES);changed['renamed.cc']=changed.pop('custom_template.cc')
  with self.assertRaises(ValueError):m.validate_module_map(changed)
  changed=dict(m.EXPECTED_MODULES);changed['custom_template.cc']='0'*64
  with self.assertRaises(ValueError):m.validate_module_map(changed)
 def test_refuses_to_overwrite_existing_candidate(self):
  with self.assertRaisesRegex(ValueError,'refusing to overwrite'):m.prepare()
if __name__=='__main__':unittest.main()
