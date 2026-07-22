import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Public Firebase config provided by the provisioner
const firebaseConfig = {
  projectId: "fluted-operand-v3bk6",
  appId: "1:707813770999:web:b34ed39c62ae33fc2235f2",
  apiKey: "AIzaSyCqBr0BlP2UlTY3zKGmagBVzJs620Fox8Y",
  authDomain: "fluted-operand-v3bk6.firebaseapp.com",
  storageBucket: "fluted-operand-v3bk6.firebasestorage.app",
  messagingSenderId: "707813770999",
};

const customDatabaseId = "ai-studio-493f6b45-52d8-4616-ba5c-799c4c0f23dd";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore targeting the specific provisioned database
export const db = getFirestore(app, customDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
