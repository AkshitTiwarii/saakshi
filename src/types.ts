import { Timestamp } from 'firebase/firestore';

export type FragmentType = 'text' | 'voice' | 'drawing' | 'upload';
export type EvidenceSource = 'IMD' | 'Ola' | 'GoogleMaps' | 'CCTV';
export type EvidenceStatus = 'found' | 'verified' | 'searching';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'user' | 'admin';
  createdAt: Timestamp;
}

export interface Fragment {
  id?: string;
  uid: string;
  type: FragmentType;
  content: string;
  emotion?: string;
  timestamp: Timestamp;
  classification?: {
    time?: string;
    location?: string;
    sensory?: string[];
  };
  geoTag?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

export interface Evidence {
  id?: string;
  uid: string;
  source: EvidenceSource;
  status: EvidenceStatus;
  details?: string;
  timestamp: Timestamp;
}

export interface Case {
  id?: string;
  uid: string;
  title?: string;
  strengthScore: number;
  adversarialAnalysis?: {
    virodhi: Array<{
      threatLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      description: string;
      predictableDefense: string;
    }>;
    raksha: Array<{
      type: string;
      title: string;
      description: string;
    }>;
  };
  createdAt: Timestamp;
}
