import { create } from 'zustand';
import type {
  ModalType,
  SshVerificationState,
  CredentialModalState,
  CredentialRequest,
} from '../types/git';

interface SshHostInfo {
  host: string;
  keyType: string;
  fingerprint: string;
}

interface ModalStore {
  // State
  activeModal: ModalType;
  isAddRemoteModalOpen: boolean;
  sshVerification: SshVerificationState;
  credentialModal: CredentialModalState;

  // Modal actions
  openFetchModal: () => void;
  openPullModal: () => void;
  openPushModal: () => void;
  closeModal: () => void;

  // Add Remote modal
  openAddRemoteModal: () => void;
  closeAddRemoteModal: () => void;

  // SSH Verification
  showSshVerification: (hostInfo: SshHostInfo, pendingOperation: () => Promise<void>) => void;
  closeSshVerification: () => void;
  clearSshPendingOperation: () => void;

  // Credential modal
  showCredentialModal: (
    request: CredentialRequest,
    pendingOperation: (credential: string) => Promise<void>
  ) => void;
  closeCredentialModal: () => void;
}

const initialSshVerification: SshVerificationState = {
  isOpen: false,
  hostInfo: null,
  pendingOperation: null,
};

const initialCredentialModal: CredentialModalState = {
  isOpen: false,
  request: null,
  pendingOperation: null,
};

export const useModalStore = create<ModalStore>()((set) => ({
  // Initial state
  activeModal: null,
  isAddRemoteModalOpen: false,
  sshVerification: initialSshVerification,
  credentialModal: initialCredentialModal,

  // Main modals
  openFetchModal: () => set({ activeModal: 'fetch' }),
  openPullModal: () => set({ activeModal: 'pull' }),
  openPushModal: () => set({ activeModal: 'push' }),
  closeModal: () => set({ activeModal: null }),

  // Add Remote modal
  openAddRemoteModal: () => set({ isAddRemoteModalOpen: true }),
  closeAddRemoteModal: () => set({ isAddRemoteModalOpen: false }),

  // SSH Verification
  showSshVerification: (hostInfo, pendingOperation) =>
    set({
      sshVerification: {
        isOpen: true,
        hostInfo,
        pendingOperation,
      },
    }),

  closeSshVerification: () => set({ sshVerification: initialSshVerification }),

  clearSshPendingOperation: () =>
    set((state) => ({
      sshVerification: {
        ...state.sshVerification,
        pendingOperation: null,
      },
    })),

  // Credential modal
  showCredentialModal: (request, pendingOperation) =>
    set({
      credentialModal: {
        isOpen: true,
        request,
        pendingOperation,
      },
    }),

  closeCredentialModal: () => set({ credentialModal: initialCredentialModal }),
}));

// Selector hooks for optimized re-renders
export const useActiveModal = () => useModalStore((state) => state.activeModal);
export const useIsAddRemoteModalOpen = () => useModalStore((state) => state.isAddRemoteModalOpen);
export const useSshVerification = () => useModalStore((state) => state.sshVerification);
export const useCredentialModal = () => useModalStore((state) => state.credentialModal);
