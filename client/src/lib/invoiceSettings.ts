import { loadSettingsSection } from "@/lib/settingsStorage";

export interface InvoiceSettingsState {
  showCompanyName: boolean;
  showCompanyAddress: boolean;
  showCompanyLogo: boolean;
  invoiceSignature: boolean;
  estimateSignature: boolean;
  acceptCardPayments: boolean;
  autoInvoicing: boolean;
  paymentInstructions: string;
  invoiceTerms: string;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettingsState = {
  showCompanyName: true,
  showCompanyAddress: true,
  showCompanyLogo: true,
  invoiceSignature: false,
  estimateSignature: false,
  acceptCardPayments: false,
  autoInvoicing: false,
  paymentInstructions: "",
  invoiceTerms: "",
};

export const getInvoiceSettings = () =>
  loadSettingsSection("invoices", DEFAULT_INVOICE_SETTINGS);

export interface InvoiceCompanyInfo {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoDataUrl: string;
}

export const getInvoiceCompanyInfo = () =>
  loadSettingsSection<InvoiceCompanyInfo>("company", {
    companyName: "Rejunk",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    logoDataUrl: "",
  });
