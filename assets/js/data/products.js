export const PRODUCTS = {
  RT10:{id:'RT10',slug:'reta-10mg',name:'RETA 10MG',shortName:'RETA',description:'Lyophilised peptide compound.',purity:'99.8%',batch:'RT10-2026-05-A',price:54.99,rating:4.9,reviewCount:127,image:'./images/reta-single.jpg',category:'peptides',featured:true,stock:'in_stock',stockCount:14,coa:{lab:'Janoshik Analytical',method:'UPLC/MS',status:'VERIFIED'}},
  RT10X3:{id:'RT10X3',slug:'reta-3-pack',name:'RETA 3-PACK',shortName:'RETA KIT',description:'3x RT10 + 3x BAC.',purity:'99.8%',batch:'RT10X3-2026-05-A',price:149.99,originalPrice:191.96,rating:4.9,reviewCount:84,image:'./images/reta-3pack-v2.jpg',category:'bundles',featured:true,stock:'in_stock',stockCount:6,coa:{lab:'Janoshik Analytical',method:'UPLC/MS',status:'VERIFIED'}},
  BC5:{id:'BC5',slug:'bpc-157',name:'BPC 157',shortName:'BPC',description:'5mg lyophilised peptide.',purity:'99%+',batch:'BC5-2026-05-B',price:29.99,rating:4.8,reviewCount:96,image:'./images/bpc-157.jpg',category:'peptides',featured:false,stock:'in_stock',stockCount:22,coa:{lab:'Janoshik Analytical',method:'HPLC',status:'VERIFIED'}},
  IP5:{id:'IP5',slug:'ipam-5mg',name:'IPAM 5MG',shortName:'IPAM',description:'5mg peptide.',purity:'99%+',batch:'IP5-2026-05-C',price:24.99,rating:4.7,reviewCount:64,image:'./images/ipamorelin.jpg',category:'peptides',featured:false,stock:'in_stock',stockCount:18,coa:{lab:'Janoshik Analytical',method:'MS',status:'VERIFIED'}},
  NJ500:{id:'NJ500',slug:'nad-500mg',name:'NAD+ 500MG',shortName:'NAD+',description:'High-purity coenzyme.',purity:'99%+',batch:'NJ500-2026-05-D',price:44.99,rating:4.8,reviewCount:41,image:'./images/nad-single.jpg',category:'coenzymes',featured:false,stock:'in_stock',stockCount:9,coa:{lab:'Janoshik Analytical',method:'HPLC',status:'VERIFIED'}},
  WA10:{id:'WA10',slug:'bac-water',name:'BAC WATER',shortName:'BAC',description:'Sterile bacteriostatic water.',purity:'Sterile',batch:'WA10-2026-05-E',price:8.99,rating:4.9,reviewCount:152,image:'./images/bac-water-box.jpg',category:'support',featured:false,stock:'in_stock',stockCount:48,coa:{lab:'UKMAXX Internal QC',method:'Sterility',status:'VERIFIED'}}
};

export const COA = {'RT10-2026-05-A':{sample:'Retatrutide 10mg',purity:'99.8%',method:'UPLC/MS',lab:'Janoshik Analytical'}};

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
  RT10:{science:'Retatrutide is a triple agonist peptide targeting GLP-1, GIP, and glucagon receptors simultaneously. Research focus areas include metabolic regulation, adipose tissue reduction, and energy homeostasis. Currently in Phase 2/3 clinical trials.',specs:'Form: Lyophilised peptide\nDose: 10mg per vial\nPurity: 99.8% (UPLC/MS verified)\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly down vial wall. Swirl gently — do not shake. Allow 5 minutes to dissolve fully.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nBatch: RT10-2026-05-A\nMethod: UPLC/MS\nDate: May 2026\nPurity: 99.8%'},
  BC5:{science:'BPC-157 (Body Protection Compound 157) is a synthetic pentadecapeptide derived from a human gastric protein. Research applications include wound healing mechanisms, angiogenesis, and musculoskeletal tissue repair models. Studied extensively in rodent models.',specs:'Form: Lyophilised peptide\nDose: 5mg per vial\nPurity: 99%+ (HPLC verified)\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly. Swirl gently.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nBatch: BPC157-2026-05-A\nMethod: HPLC\nDate: May 2026\nPurity: 99%+'},
  IP5:{science:'Ipamorelin is a selective growth hormone secretagogue and ghrelin receptor agonist. Research focus includes GH pulse stimulation, IGF-1 pathway modulation, and metabolic signalling. Notable for high selectivity with minimal cortisol or prolactin interference in research models.',specs:'Form: Lyophilised peptide\nDose: 5mg per vial\nPurity: 99%+ (mass spectrometry verified)\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly. Swirl gently.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nBatch: IPA-2026-05-A\nMethod: MS\nDate: May 2026\nPurity: 99%+'},
  NJ500:{science:'Nicotinamide adenine dinucleotide (NAD+) is a coenzyme central to cellular energy metabolism and redox reactions. Research applications include mitochondrial function studies, sirtuin pathway activation, and DNA repair mechanism research.',specs:'Form: Lyophilised powder\nDose: 500mg per vial\nPurity: 99%+ (identity verified)\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 7 days)\nReconstitution: Add sterile water or BAC water. Dissolve fully before use. Do not shake.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nBatch: NJ500-2026-05-A\nMethod: Identity verification\nDate: May 2026\nPurity: 99%+'},
  RT10X3:{science:'Retatrutide 10mg · 3-pack research bundle. Contains three 10mg vials of third-party COA-verified Retatrutide peptide at 99.8% purity (UPLC/MS), supplied alongside three 10ml vials of bacteriostatic water for laboratory reconstitution.',specs:'Bundle contents: 3x Retatrutide 10mg vials + 3x Bacteriostatic Water 10ml vials\nDose per vial: 10mg lyophilised peptide\nPurity: 99.8% (UPLC/MS verified)\nLab: Janoshik Analytical\nStorage: -20°C (unopened) / 4°C (reconstituted, use within 28 days)\nReconstitution: Add 2ml bacteriostatic water slowly down vial wall. Swirl gently.\nShelf life: 24 months unopened',coa:'Lab: Janoshik Analytical\nMethod: UPLC/MS\nDate: May 2026\nPurity: 99.8%\nBundle SKU: RT10X3-2026-05-A'},
  WA10:{science:'Bacteriostatic water is sterile water containing 0.9% benzyl alcohol, which inhibits bacterial growth. Used as a reconstitution solvent for lyophilised peptide compounds in laboratory settings. Multi-draw safe due to bacteriostatic properties.',specs:'Form: Sterile aqueous solution\nVolume: 10ml per vial\nComposition: 0.9% benzyl alcohol in water for injection\nStorage: Room temperature (unopened) / 4°C (opened)\nShelf life: 24 months unopened / 28 days opened',coa:'Standard: Sterility confirmed\nBatch: BW-2026-05-A'}
};

export const SAMPLE_REVIEWS = [
  {product:'RT10',rating:5,date:'28 May 2026',initials:'A.K.',text:'Fast dispatch, clean packaging and clear communication. The COA QR code linked me straight to the lab report — exactly what I needed.'},
  {product:'BAC WATER',rating:5,date:'24 May 2026',initials:'R.M.',text:'Arrived next day, seals intact and labels were exactly as described. Will be reordering for the lab.'},
  {product:'IP5',rating:5,date:'21 May 2026',initials:'D.S.',text:'Professional updates throughout and solid cold-chain presentation. Documentation is genuinely useful.'},
  {product:'BC5',rating:4,date:'18 May 2026',initials:'J.P.',text:'Solid product, batch verified. Took a day to arrive but the tracking was accurate throughout.'},
  {product:'NAD+',rating:5,date:'12 May 2026',initials:'L.W.',text:'Identical quality to my previous supplier but with proper UK documentation. Switched permanently.'},
  {product:'RT10X3',rating:5,date:'08 May 2026',initials:'M.T.',text:'The bundle pricing is fair and the third-party COA gave my team the verification we needed before approving the supplier.'}
];
