export const PRODUCTS = {
  RT10:{id:'RT10',slug:'reta-10mg',name:'RETA 10MG',shortName:'RETA',description:'Lyophilised peptide compound.',purity:'99%+',batch:'RT10-2026-06-A',price:54.99,reviewCount:0,image:'./images/ukmaxx-reta.png',category:'peptides',featured:true,stock:'in_stock',stockCount:19,coa:{lab:'Janoshik Analytical',method:'UPLC/MS',status:'VERIFIED'},coaImage:'./images/reta-coa-2026-06.png',coaUrl:'https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'},
  RT10X3:{id:'RT10X3',slug:'reta-3-pack',name:'RETA 3-PACK',shortName:'RETA KIT',description:'3x RT10 + 1x BAC.',purity:'99%+',batch:'RT10-2026-06-A',price:149.99,originalPrice:173.96,reviewCount:0,image:'./images/ukmaxx-reta-bundle.png',category:'bundles',featured:true,stock:'in_stock',stockCount:6,coa:{lab:'Janoshik Analytical',method:'UPLC/MS',status:'VERIFIED'},coaImage:'./images/reta-coa-2026-06.png',coaUrl:'https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'},
  BC5:{id:'BC5',slug:'bpc-157',name:'BPC 157',shortName:'BPC',description:'5mg lyophilised peptide.',purity:'99.746%',batch:'BPC-2026-05-A',price:29.99,reviewCount:0,image:'./images/ukmaxx-bpc-157.png',category:'peptides',featured:false,stock:'in_stock',stockCount:19,coa:{lab:'Janoshik Analytical',method:'HPLC',status:'VERIFIED'},coaImage:'./images/bpc-coa-2026-07.png',coaSampleImage:'./images/bpc-coa-vial-2026-07.jpg',coaUrl:'https://verify.janoshik.com/tests/208699-BPC157_5mg_AK9GVE8V85T7'},
  IP5:{id:'IP5',slug:'ipam-5mg',name:'IPAM 5MG',shortName:'IPAM',description:'5mg peptide.',purity:'99%+',batch:'IP5-2026-05-C',price:24.99,reviewCount:0,image:'./images/ukmaxx-ipamorelin.png',category:'peptides',featured:false,stock:'coming_soon',stockCount:0,releaseLabel:'Coming soon',coaLabel:'Awaiting COA',coa:{lab:'Janoshik Analytical',method:'MS',status:'PENDING'}},
  NJ500:{id:'NJ500',slug:'nad-500mg',name:'NAD+ 500MG',shortName:'NAD+',description:'High-purity coenzyme.',purity:'99%+',batch:'NJ500-2026-05-D',price:44.99,reviewCount:0,image:'./images/ukmaxx-nad-500.png',category:'coenzymes',featured:false,stock:'coming_soon',stockCount:0,releaseLabel:'Coming soon',coaLabel:'Awaiting COA',coa:{lab:'Janoshik Analytical',method:'HPLC',status:'PENDING'}},
  WA10:{id:'WA10',slug:'bac-water',name:'BAC WATER',shortName:'BAC',description:'Bacteriostatic water for laboratory reconstitution.',purity:'UKMAXX Internal QC',batch:'WA10-2026-05-E',price:8.99,reviewCount:0,image:'./images/ukmaxx-bac-water.png',category:'support',featured:false,stock:'in_stock',stockCount:20,coa:{lab:'UKMAXX Internal QC',method:'Internal QC',status:'VERIFIED'},coaLabel:'UKMAXX Internal QC'},
  GHKCU:{id:'GHKCU',slug:'ghk-cu-50mg',name:'GHK-Cu 50MG',shortName:'GHK-Cu',description:'50mg lyophilised copper peptide.',purity:'99%+',batch:'GHK-2026-05-A',price:29.99,reviewCount:0,image:'./images/ukmaxx-ghk-cu.png',category:'peptides',featured:false,stock:'coming_soon',stockCount:0,releaseLabel:'Coming soon',coaLabel:'Awaiting COA',coa:{lab:'Janoshik Analytical',method:'HPLC',status:'PENDING'}}
};

export const BUNDLE_COMPONENTS = {
  RT10X3: { RT10: 3, WA10: 1 },
};

export function getBundleStock(sku, source = PRODUCTS) {
  const components = BUNDLE_COMPONENTS[sku];
  if (!components) return Number(source[sku]?.stockCount || 0);
  return Math.max(0, Math.min(...Object.entries(components).map(([componentSku, qty]) => {
    return Math.floor(Number(source[componentSku]?.stockCount || 0) / qty);
  })));
}

export function syncBundleStock(source = PRODUCTS) {
  Object.keys(BUNDLE_COMPONENTS).forEach((sku) => {
    if (!source[sku]) return;
    source[sku].stockCount = getBundleStock(sku, source);
    source[sku].stock = source[sku].stockCount > 0 ? 'in_stock' : 'out_of_stock';
  });
}

function canUseLiveStock(product) {
  return Boolean(product && !product.releaseLabel && product.coa?.status === 'VERIFIED');
}

export async function refreshLiveStock() {
  try {
    const res = await fetch('/api/products-stock', { headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const data = await res.json();
    for (const item of data.products || []) {
      const sku = String(item.sku || '').toUpperCase();
      if (!PRODUCTS[sku]) continue;
      if (!canUseLiveStock(PRODUCTS[sku])) {
        PRODUCTS[sku].stockCount = 0;
        PRODUCTS[sku].stock = 'coming_soon';
        continue;
      }
      PRODUCTS[sku].stockCount = Math.max(0, Number(item.stockCount || 0));
      PRODUCTS[sku].stock = item.isActive && PRODUCTS[sku].stockCount > 0 ? 'in_stock' : 'out_of_stock';
    }
    syncBundleStock();
    return true;
  } catch {
    syncBundleStock();
    return false;
  }
}

syncBundleStock();

export const COA = {
  'RT10-2026-06-A': {
    batch: 'RT10-2026-06-A',
    sku: 'RT10',
    product: 'RETA 10MG',
    sample: 'Retatrutide 10mg',
    status: 'VERIFIED',
    statusLabel: 'Third-party verified',
    purity: '99.223%',
    method: 'UPLC/MS',
    lab: 'Janoshik Analytical',
    report: '#193587',
    testDate: '22 Jun 2026',
    image: './images/reta-coa-2026-06.png',
    url: 'https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42',
  },
  'BPC-2026-05-A': {
    batch: 'BPC-2026-05-A',
    sku: 'BC5',
    product: 'BPC 157',
    sample: 'BPC-157 5mg',
    status: 'VERIFIED',
    statusLabel: 'Third-party verified',
    purity: '99.746% / 4.84mg',
    method: 'HPLC',
    lab: 'Janoshik Analytical',
    report: '#208699',
    testDate: '27 Jul 2026',
    image: './images/bpc-coa-2026-07.png',
    url: 'https://verify.janoshik.com/tests/208699-BPC157_5mg_AK9GVE8V85T7',
  },
  'WA10-2026-05-E': {
    batch: 'WA10-2026-05-E',
    sku: 'WA10',
    product: 'BAC WATER',
    sample: 'Bacteriostatic Water 10ml',
    status: 'INTERNAL_QC',
    statusLabel: 'UKMAXX Internal QC',
    purity: 'UKMAXX Internal QC',
    method: 'Internal QC',
    lab: 'UKMAXX',
    report: 'Internal QC record',
    testDate: 'May 2026',
    image: './images/ukmaxx-bac-water.png',
    url: '',
  },
};

export const FREE_SHIPPING_THRESHOLD = 100;
export const FLAT_SHIPPING = 4.99;
export const PROMO_CODES = {'MAXX10':{type:'percent',value:0.10,label:'10% off'}};
export function isPurchasable(product) {
  return Boolean(product && product.stock === 'in_stock' && Number(product.stockCount || 0) > 0);
}
export function getReleaseLabel(product) {
  if (!product) return 'Unavailable';
  if (product.releaseLabel) return product.releaseLabel;
  if (isPurchasable(product)) return 'In stock';
  return 'Unavailable';
}
export function getCoaStatusLabel(product) {
  if (!product) return 'COA pending';
  if (product.coaLabel) return product.coaLabel;
  return product.coa?.status === 'VERIFIED' ? 'COA verified' : 'Awaiting COA';
}
export function getQualityLabel(product) {
  if (!product) return 'Quality pending';
  if (product.id === 'WA10') return 'UKMAXX Internal QC';
  return isPurchasable(product) ? `${product.purity} purity` : getCoaStatusLabel(product);
}
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
  RT10:{science:'Retatrutide is a triple agonist peptide targeting GLP-1, GIP, and glucagon receptors simultaneously. Research focus areas include metabolic regulation, adipose tissue reduction, and energy homeostasis. Currently in Phase 2/3 clinical trials.',specs:'Form: Lyophilised peptide\nDose: 10mg per vial\nPurity: 99%+ (UPLC/MS verified)\nStorage: Refrigerated at 2–8°C, dry and protected from light\nReconstitution: Add 2ml bacteriostatic water slowly down vial wall. Swirl gently — do not shake. Allow 5 minutes to dissolve fully.\nHandling: After reconstitution, keep refrigerated and follow the batch insert guidance',coa:'Lab: Janoshik Analytical\nBatch: RT10-2026-06-A\nMethod: UPLC/MS (GLP-1 blind test)\nDate: 22 Jun 2026\nPurity: 99.223%\nVerify: https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'},
  BC5:{science:'BPC-157 (Body Protection Compound 157) is a synthetic pentadecapeptide derived from a human gastric protein. Research applications include wound healing mechanisms, angiogenesis, and musculoskeletal tissue repair models. Studied extensively in rodent models.',specs:'Form: Lyophilised peptide\nDose: 5mg per vial\nPurity: 99.746% (HPLC verified)\nAssay result: 4.84mg per vial\nStorage: Refrigerated at 2–8°C, dry and protected from light\nReconstitution: Add bacteriostatic water slowly. Swirl gently.\nHandling: After reconstitution, keep refrigerated and follow the batch insert guidance',coa:'Lab: Janoshik Analytical\nReport: #208699\nBatch: BPC-2026-05-A\nMethod: HPLC\nDate: 27 Jul 2026\nResult: 4.84mg\nPurity: 99.746%\nVerify: https://verify.janoshik.com/tests/208699-BPC157_5mg_AK9GVE8V85T7'},
  IP5:{science:'Ipamorelin is a selective growth hormone secretagogue and ghrelin receptor agonist. Research focus includes GH pulse stimulation, IGF-1 pathway modulation, and metabolic signalling. Notable for high selectivity with minimal cortisol or prolactin interference in research models.',specs:'Form: Lyophilised peptide\nDose: 5mg per vial\nPurity: 99%+ (mass spectrometry verified)\nStorage: Refrigerated at 2–8°C, dry and protected from light\nReconstitution: Add bacteriostatic water slowly. Swirl gently.\nHandling: After reconstitution, keep refrigerated and follow the batch insert guidance',coa:'Lab: Janoshik Analytical\nBatch: IPA-2026-05-A\nMethod: MS\nDate: May 2026\nPurity: 99%+'},
  GHKCU:{science:'GHK-Cu is a copper-binding tripeptide used in laboratory research models. Research focus areas include copper-peptide complex behaviour, extracellular matrix signalling, collagen-pathway studies and cellular-response assays.',specs:'Form: Lyophilised peptide\nDose: 50mg per vial\nPurity: 99%+ target, pending batch COA\nStorage: Refrigerated at 2–8°C, dry and protected from light\nReconstitution: Laboratory protocol dependent\nHandling: Follow the batch insert guidance',coa:'Lab: Janoshik Analytical\nBatch: GHK-2026-05-A\nMethod: HPLC\nStatus: Awaiting COA'},
  NJ500:{science:'Nicotinamide adenine dinucleotide (NAD+) is a coenzyme central to cellular energy metabolism and redox reactions. Research applications include mitochondrial function studies, sirtuin pathway activation, and DNA repair mechanism research.',specs:'Form: Lyophilised powder\nDose: 500mg per vial\nPurity: 99%+ (identity verified)\nStorage: Refrigerated at 2–8°C, dry and protected from light\nReconstitution: Add compatible laboratory diluent. Dissolve fully before use. Do not shake.\nHandling: After reconstitution, keep refrigerated and follow the batch insert guidance',coa:'Lab: Janoshik Analytical\nBatch: NJ500-2026-05-A\nMethod: Identity verification\nDate: May 2026\nPurity: 99%+'},
  RT10X3:{science:'Retatrutide 10mg · 3-pack research bundle. Contains three 10mg vials of third-party COA-verified Retatrutide peptide at 99%+ purity (UPLC/MS), supplied alongside one 10ml vial of bacteriostatic water for laboratory reconstitution.',specs:'Bundle contents: 3x Retatrutide 10mg vials + 1x Bacteriostatic Water 10ml vial\nDose per vial: 10mg lyophilised peptide\nPurity: 99%+ (UPLC/MS verified)\nLab: Janoshik Analytical\nStorage: Refrigerated at 2–8°C, dry and protected from light\nReconstitution: Add 2ml bacteriostatic water slowly down vial wall. Swirl gently.\nHandling: After reconstitution, keep refrigerated and follow the batch insert guidance',coa:'Lab: Janoshik Analytical\nMethod: UPLC/MS (GLP-1 blind test)\nDate: 22 Jun 2026\nPurity: 99.223%\nBundle SKU: RT10-2026-06-A\nVerify: https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42'},
  WA10:{science:'Bacteriostatic water containing 0.9% benzyl alcohol for laboratory reconstitution workflows. Multi-draw safe due to bacteriostatic properties.',specs:'Form: Aqueous solution\nVolume: 10ml per vial\nComposition: 0.9% benzyl alcohol in water for injection\nStorage: Store as directed on the product label, protected from heat and light\nHandling: Once opened, follow the product insert guidance',coa:'QC: UKMAXX Internal QC\nBatch: WA10-2026-05-E'}
};

export const RESEARCH_FOCUS = {
  RT10: 'Retatrutide is a multi-receptor research peptide studied for activity across GLP-1, GIP and glucagon receptor pathways. Research groups commonly investigate how these pathways interact with metabolic signalling, energy balance, glucose-response models and body-composition endpoints. UKMAXX supplies this material strictly for laboratory and in-vitro research use only — not for human consumption.',
  RT10X3: 'This bundle is designed for repeat Retatrutide research workflows: three 10mg Retatrutide vials from the same verified batch plus one 10ml bacteriostatic water vial for laboratory reconstitution. It is useful when a project needs consistent batch traceability across multiple test runs.',
  BC5: 'BPC-157 is a synthetic peptide used in pre-clinical research models. Published research commonly examines tissue-response pathways, angiogenesis signalling, inflammatory markers and musculoskeletal repair models. This UKMAXX batch is third-party verified by Janoshik Analytical and supplied strictly for laboratory and in-vitro research use only.',
  IP5: 'Ipamorelin is a growth hormone secretagogue research peptide studied for ghrelin receptor activity and GH-pulse signalling models. Research focus areas include endocrine pathway selectivity, IGF-1 signalling, metabolic-response models and comparison against less selective secretagogues.',
  GHKCU: 'GHK-Cu is a copper-binding tripeptide studied in laboratory models involving copper-peptide complexes, extracellular matrix signalling and cellular-response pathways. UKMAXX will only release this SKU once the matching batch COA is available.',
  NJ500: 'NAD+ is a coenzyme researched for its role in redox reactions, mitochondrial metabolism and cellular energy pathways. Research areas include sirtuin signalling, DNA-repair mechanisms, oxidative-stress models and age-related cellular function studies.',
  WA10: 'Bacteriostatic water is used in laboratory reconstitution workflows where a multi-draw diluent is required for research handling. It contains 0.9% benzyl alcohol and is supplied as a support item for compatible laboratory compounds.',
};

export const FURTHER_READING = {
  RT10: [
    { label: 'Retatrutide research on PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=retatrutide' },
    { label: 'Retatrutide clinical trial records', url: 'https://clinicaltrials.gov/search?term=retatrutide' },
    { label: 'GLP-1, GIP and glucagon receptor research', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=GLP-1+GIP+glucagon+receptor+agonist' },
  ],
  RT10X3: [
    { label: 'Retatrutide research on PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=retatrutide' },
    { label: 'Retatrutide clinical trial records', url: 'https://clinicaltrials.gov/search?term=retatrutide' },
    { label: 'Peptide UPLC/MS analysis research', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=peptide+UPLC+MS+analysis' },
  ],
  BC5: [
    { label: 'BPC-157 research on PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=BPC-157' },
    { label: 'Peptide tissue-repair model research', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=peptide+tissue+repair+model' },
  ],
  IP5: [
    { label: 'Ipamorelin research on PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=ipamorelin' },
    { label: 'Ghrelin receptor and GH secretagogue studies', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=ghrelin+receptor+growth+hormone+secretagogue' },
  ],
  GHKCU: [
    { label: 'GHK-Cu research on PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=GHK-Cu' },
    { label: 'Copper peptide research', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=copper+peptide+GHK' },
  ],
  NJ500: [
    { label: 'NAD+ research on PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=NAD%2B' },
    { label: 'NAD+ and mitochondrial research', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=NAD%2B+mitochondrial+function' },
  ],
  WA10: [
    { label: 'Bacteriostatic water and benzyl alcohol references', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=bacteriostatic+water+benzyl+alcohol' },
    { label: 'Benzyl alcohol preservative research', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=benzyl+alcohol+preservative' },
  ],
};

export const SAMPLE_REVIEWS = [];
