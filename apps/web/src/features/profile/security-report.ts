'use client';

import { createContext, useContext } from 'react';

export type SecurityFailure = { code?: string; status?: number } | null | undefined;

const SecurityReportContext = createContext<(error: SecurityFailure) => void>(() => {});

export const SecurityReportProvider = SecurityReportContext.Provider;

/**
 * Reports a failed action on «Безопасность»: an error toast, or — when the session is too old —
 * the page's single "sign in again" block instead.
 */
export function useSecurityReport() {
  return useContext(SecurityReportContext);
}
