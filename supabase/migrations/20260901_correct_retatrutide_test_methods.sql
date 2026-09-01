-- Correct the public analytical method shown for the two Retatrutide batches.
-- Janoshik names the service "Common GLP-1 peptide blind test" and lists HPLC
-- as its testing method. This changes descriptive metadata only.

update public.coa_batches
set method = 'HPLC blind test'
where batch_code in ('RT10-2026-06-A', 'RT20-2026-08-A');
