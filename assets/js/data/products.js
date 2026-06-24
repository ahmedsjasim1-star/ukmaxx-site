export const BATCH_COAS = {
  'RT10-2026-06-A': {
    batchCode: 'RT10-2026-06-A',
    sku: 'RT10',
    productName: 'RETA 10MG',
    sample: 'Retatrutide 10mg',
    purity: '99.223%',
    method: 'UPLC/MS (GLP-1 blind test)',
    lab: 'Janoshik Analytical',
    status: 'VERIFIED',
    testedAt: '2026-06-22',
    publishedAt: '2026-06-22',
    image: './images/reta-coa-2026-06.png',
    url: 'https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'
  }
};

export const PRODUCTS = {
  RT10:{id:'RT10',slug:'reta-10mg',name:'RETA 10MG',shortName:'RETA',description:'Lyophilised peptide compound.',batch:'RT10-2026-06-A',price:54.99,reviewCount:0,image:'./images/reta-single.jpg',category:'peptides',featured:true,stock:'in_stock',stockCount:14,coaBatch:'RT10-2026-06-A'},
  RT10X3:{id:'RT10X3',slug:'reta-3-pack',name:'RETA 3-PACK',shortName:'RETA KIT',description:'3x RT10 + 3x BAC.',batch:'RT10-2026-06-A',price:149.99,originalPrice:191.96,reviewCount:0,image:'./images/reta-3pack-v2.jpg',category:'bundles',featured:true,stock:'in_stock',stockCount:6,coaBatch:'RT10-2026-06-A'},
  BC5:{id:'BC5',slug:'bpc-157',name:'BPC 157',shortName:'BPC',description:'5mg lyophilised peptide.',batch:'BC5-COA-PENDING',price:29.99,reviewCount:0,image:'./images/bpc-157.jpg',category:'peptides',featured:false,stock:'in_stock',stockCount:22},
  IP5:{id:'IP5',slug:'ipam-5mg',name:'IPAM 5MG',shortName:'IPAM',description:'5mg peptide.',batch:'IP5-COA-PENDING',price:24.99,reviewCount:0,image:'./images/ipamorelin.jpg',category:'peptides',featured:false,stock:'in_stock',stockCount:18},
  NJ500:{id:'NJ500',slug:'nad-500mg',name:'NAD+ 500MG',shortName:'NAD+',description:'Coenzyme research compound.',batch:'NJ500-COA-PENDING',price:44.99,reviewCount:0,image:'./images/nad-single.jpg',category:'coenzymes',featured:false,stock:'in_stock',stockCount:9},
  WA10:{id:'WA10',slug:'bac-water',name:'BAC WATER',shortName:'BAC',description:'Bacteriostatic water for laboratory reconstitution.',batch:'WA10-COA-PENDING',price:8.99,reviewCount:0,image:'./images/bac-water-box.jpg',category:'support',featured:false,stock:'in_stock',stockCount:48}
};

export const COA = BATCH_COAS;

export function normaliseCoaBatch(row) {
  if (!row) return null;
  const batchCode = String(row.batch_code || row.batchCode || '').trim().toUpperCase();
  if (!batchCode) return null;
  const url = row.coa_url || row.url || '';
  const image = row.image_url || row.image || '';
  return {
    batchCode,
    sku: row.sku || '',
    productName: row.product_name || row.productName || '',
    sample: row.sample || row.product_name || row.productName || '',
    purity: row.purity || '',
    method: row.method || '',
    lab: row.lab_name || row.lab || '',
    status: (url || image) ? 'VERIFIED' : 'PENDING',
    testedAt: row.tested_at || row.testedAt || '',
    publishedAt: row.published_at || row.publishedAt || '',
    image,
    url
  };
}

function coaTime(coa) {
  const value = Date.parse(coa?.testedAt || coa?.publishedAt || '');
  return Number.isFinite(value) ? value : 0;
}

export function applyCoaBatches(rows = []) {
  rows.map(normaliseCoaBatch).filter(Boolean).forEach((coa) => {
    const existing = BATCH_COAS[coa.batchCode];
    if (!existing || coaTime(coa) >= coaTime(existing)) BATCH_COAS[coa.batchCode] = coa;
    Object.values(PRODUCTS).forEach((product) => {
      if (product.id !== coa.sku) return;
      const current = resolveProductCoa(product);
      if (!current || coaTime(coa) >= coaTime(current)) {
        product.batch = coa.batchCode;
        product.coaBatch = coa.batchCode;
      }
    });
  });
}

export function resolveProductCoa(product) {
  if (!product) return null;
  return BATCH_COAS[product.coaBatch] || BATCH_COAS[product.batch] || null;
}

export function hasPublishedCoa(product) {
  const coa = resolveProductCoa(product);
  return Boolean(coa && coa.status === 'VERIFIED' && (coa.url || coa.image));
}

export function getProductPurityLabel(product) {
  const coa = resolveProductCoa(product);
  return hasPublishedCoa(product) && coa.purity ? coa.purity : 'COA pending';
}

export function getProductCoaLabel(product) {
  const coa = resolveProductCoa(product);
  if (hasPublishedCoa(product)) return `${coa.lab || 'Third-party lab'} · ${coa.method || 'COA verified'}`;
  return 'Awaiting published COA';
}

export function getProductCoaRows(product) {
  const coa = resolveProductCoa(product);
  if (!hasPublishedCoa(product)) return [];
  return [
    ['Lab', coa.lab],
    ['Batch', coa.batchCode],
    ['Method', coa.method],
    ['Date', coa.testedAt ? new Date(coa.testedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Published'],
    ['Purity', coa.purity],
    ['Verify', coa.url]
  ].filter((row) => row[1]);
}

export const FREE_SHIPPING_THRESHOLD = 100;
export const FLAT_SHIPPING = 4.99;
export const PROMO_CODES = {'MAXX15':{type:'percent',value:0.15,label:'15% off'}};
export const CATEGORIES = [
  {id:'all',label:'All Products'},
  {id:'peptides',label:'Peptides'},
  {id:'coenzymes',label:'Coenzymes'},
  {id:'support',label:'Support'},
  {id:'bundles',label:'Bundles'}
];

export const CART_KEY = 'ukmaxx_cart_v1';
export const PROMO_KEY = 'ukmaxx_promo_v1';
export const COOKIE_KEY = 'ukmaxx_cookies_v1';
export const EXIT_KEY = 'ukmaxx_exit_v1';
export const AGE_KEY = 'ukmaxx_age_verified';

export const DETAIL_DATA = {
  RT10:{science:'Retatrutide is a triple agonist peptide targeting GLP-1, GIP, and glucagon receptors simultaneously. Research focus areas include metabolic regulation, adipose tissue reduction, and energy homeostasis. Currently in Phase 2/3 clinical trials.',specs:'Form: Lyophilised peptide\nDose: 10mg per vial\nPurity: 99.223% (UPLC/MS, batch RT10-2026-06-A)\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly down vial wall. Swirl gently — do not shake. Allow 5 minutes to dissolve fully.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nBatch: RT10-2026-06-A\nMethod: UPLC/MS (GLP-1 blind test)\nDate: 22 Jun 2026\nPurity: 99.223%\nVerify: https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'},
  BC5:{science:'BPC-157 (Body Protection Compound 157) is a synthetic pentadecapeptide derived from a human gastric protein. Research applications include wound healing mechanisms, angiogenesis, and musculoskeletal tissue repair models. Studied extensively in rodent models.',specs:'Form: Lyophilised peptide\nDose: 5mg per vial\nPurity: Awaiting published COA\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly. Swirl gently.\nShelf life: 24 months unopened',coa:'Awaiting COA — third-party certificate of analysis pending for this product.'},
  IP5:{science:'Ipamorelin is a selective growth hormone secretagogue and ghrelin receptor agonist. Research focus includes GH pulse stimulation, IGF-1 pathway modulation, and metabolic signalling. Notable for high selectivity with minimal cortisol or prolactin interference in research models.',specs:'Form: Lyophilised peptide\nDose: 5mg per vial\nPurity: Awaiting published COA\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly. Swirl gently.\nShelf life: 24 months unopened',coa:'Awaiting COA — third-party certificate of analysis pending for this product.'},
  NJ500:{science:'Nicotinamide adenine dinucleotide (NAD+) is a coenzyme central to cellular energy metabolism and redox reactions. Research applications include mitochondrial function studies, sirtuin pathway activation, and DNA repair mechanism research.',specs:'Form: Lyophilised powder\nDose: 500mg per vial\nPurity: Awaiting published COA\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 7 days)\nReconstitution: Add sterile water or BAC water. Dissolve fully before use. Do not shake.\nShelf life: 24 months unopened',coa:'Awaiting COA — third-party certificate of analysis pending for this product.'},
  RT10X3:{science:'Retatrutide 10mg · 3-pack research bundle. Contains three 10mg vials from the published RT10-2026-06-A Retatrutide batch at 99.223% purity (UPLC/MS), supplied alongside three 10ml vials of bacteriostatic water for laboratory reconstitution.',specs:'Bundle contents: 3x Retatrutide 10mg vials + 3x Bacteriostatic Water 10ml vials\nDose per vial: 10mg lyophilised peptide\nPurity: 99.223% (UPLC/MS, batch RT10-2026-06-A)\nLab: Janoshik Analytical\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly down vial wall. Swirl gently.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nMethod: UPLC/MS (GLP-1 blind test)\nDate: 22 Jun 2026\nPurity: 99.223%\nBundle SKU: RT10-2026-06-A\nVerify: https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'},
  WA10:{science:'Bacteriostatic water is sterile water containing 0.9% benzyl alcohol, which inhibits bacterial growth. Used as a reconstitution solvent for lyophilised peptide compounds in laboratory settings. Multi-draw safe due to bacteriostatic properties.',specs:'Form: Sterile aqueous solution\nVolume: 10ml per vial\nComposition: 0.9% benzyl alcohol in water for injection\nStorage: Room temperature (unopened) / 4°C (opened)\nShelf life: 24 months unopened / 28 days opened',coa:'Awaiting COA — supplier or laboratory documentation pending for this product.'}
};

export const SAMPLE_REVIEWS = [];
