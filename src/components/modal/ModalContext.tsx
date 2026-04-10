import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface ModalContextValue {
  titleId: string;
  descriptionId: string;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/**
 * Hook to access modal ARIA IDs. Must be used within Modal.
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

export const ModalContextProvider = ({
  titleId,
  descriptionId,
  children,
}: ModalContextProviderProps) => {
  const value = useMemo(() => ({ titleId, descriptionId }), [titleId, descriptionId]);

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};
