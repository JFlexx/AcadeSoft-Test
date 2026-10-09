import { PRODUCT_NAME } from './brand';

/**
 * Who provides the platform (the processor of the academies' data and the
 * controller of the academies' own account data). PENDING: fill in with the
 * company's real details before going live, and have the legal texts
 * reviewed by a lawyer.
 */
export const PROVIDER = {
  product: PRODUCT_NAME,
  legalName: '[Razón social del titular]',
  taxId: '[NIF]',
  address: '[Domicilio social]',
  privacyEmail: '[email de privacidad]',
  /** EU hosting (to be confirmed when the hosting provider is chosen). */
  hosting: '[Proveedor de alojamiento en la UE]',
};

export const LEGAL_VERSION = '2026-10';
