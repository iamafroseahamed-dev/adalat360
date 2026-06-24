export const ECOURTS_CASE_TYPES: Record<string, string> = {
  WP: "WP_C",
  WP_CRL: "WP_CRL",
  WP_PIL: "WP_PIL",
  WPC_O: "WPC_O",

  WA: "WA",
  HCP: "HCP",
  CRP: "CRP",
  CMA: "CMA",
  CMP: "CMP",
  OSA: "OSA",
  OP: "OP",
  SA: "SA",
  LPA: "LPA",
  CONT_P: "CONT_P",
  PIL: "PIL",

  ABA: "ABA",
  BA: "BA",
  CA: "CA",
  CS: "CS",
  FA: "FA",
  IA: "IA",
  IP: "IP",
  MA: "MA",
  PP: "PP",
  RC: "RC",
  RSA: "RSA",
  SCA: "SCA",
  SLP_C: "SLP_C",
  SLP_CRL: "SLP_CRL",
  TP_C: "TP_C",
  TP_CRL: "TP_CRL",
  TS: "TS",
  XOBJ: "XOBJ",
};

export function getEcourtsCaseType(caseType: string): string {
  const normalized = String(caseType ?? '').trim().toUpperCase();

  return ECOURTS_CASE_TYPES[normalized] ?? normalized;
}
