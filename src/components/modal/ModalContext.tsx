import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface ModalContextValue {
  titleId: string;
  descriptionId: string;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/**
 * Hook to access modal context (IDs for ARIA attributes).
 * Must be used within Modal component.
 */
export const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModalContext must be used within Modal');
  }
  return context;
};

interface ModalContextProviderProps {
  titleId: string;
  descriptionId: string;
  children: ReactNode;
}

/**
 * Provider for modal context.
 * Memoizes value to prevent unnecessary re-renders.
 */
export const ModalContextProvider = ({
  titleId,
  descriptionId,
  children,
}: ModalContextProviderProps) => {
  // Memoize to prevent re-renders - IDs never change after mount
  const value = useMemo(
    () => ({ titleId, descriptionId }),
    [titleId, descriptionId]
  );

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
};
