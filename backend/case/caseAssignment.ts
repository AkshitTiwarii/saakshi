import { randomUUID } from 'crypto';

/**
 * Case Generation & Assignment System
 * ====================================
 * - Auto-generates unique case numbers on victim login
 * - Stores victim-case relationship in Firestore
 * - Immutable designation system for officer access
 * - Waterproof validation at every level
 */

export interface CaseAssignment {
  caseId: string; // Firestore doc ID
  caseNumber: string; // SAAK-YYYY-XXXXX human-readable
  victimUniqueId: string; // Victim's permanent UID
  createdAt: string; // ISO timestamp
  createdByAdminId?: string; // If manually created
}

export interface OfficerDesignation {
  designationId: string; // Unique identifier
  caseId: string; // Case this officer is designated for
  officerId: string; // Officer UID
  role: 'police' | 'lawyer' | 'admin'; // Designated role
  designatedAt: string; // When they were added
  designatedByActorId: string; // Who made this designation
  status: 'active' | 'revoked' | 'expired'; // Designation status
  expiresAt?: string; // Optional expiration
  scope: string[]; // Access scope [victim_media, ai_analysis, legal_export, etc.]
}

/**
 * Generate unique case number
 * Format: SAAK-YYYY-XXXXX
 * Where YYYY = year, XXXXX = random hex (5 chars)
 */
export function generateCaseNumber(): string {
  const year = new Date().getFullYear();
  const randomPart = randomUUID().replace(/-/g, '').substring(0, 5).toUpperCase();
  return `SAAK-${year}-${randomPart}`;
}

/**
 * Validate case number format
 */
export function isValidCaseNumber(caseNumber: string): boolean {
  return /^SAAK-\d{4}-[A-F0-9]{5}$/.test(caseNumber);
}

/**
 * Create case assignment (called on victim login/registration)
 */
export function createCaseAssignment(victimUniqueId: string, createdByAdminId?: string): CaseAssignment {
  return {
    caseId: randomUUID(), // Firestore doc ID
    caseNumber: generateCaseNumber(), // Human-readable case number
    victimUniqueId, // Link to victim
    createdAt: new Date().toISOString(),
    createdByAdminId,
  };
}

/**
 * Create officer designation (only done by admin/case manager)
 * This is the FOUNDATION of access control - cannot be overridden by officer
 */
export function createOfficerDesignation(params: {
  caseId: string;
  officerId: string;
  role: 'police' | 'lawyer' | 'admin';
  designatedByActorId: string; // Admin/case manager
  scope?: string[];
  expiresAt?: string;
}): OfficerDesignation {
  return {
    designationId: `designation-${randomUUID()}`,
    caseId: params.caseId,
    officerId: params.officerId,
    role: params.role,
    designatedAt: new Date().toISOString(),
    designatedByActorId: params.designatedByActorId,
    status: 'active',
    expiresAt: params.expiresAt,
    scope: params.scope || ['victim_media', 'ai_analysis'],
  };
}

/**
 * WATERPROOF Access Check
 * ========================
 * Level 1: Designation check (must exist && be active)
 * Level 2: Role scope check (role must match case requirements)
 * Level 3: Policy gate check (consent policy validation)
 * Level 4: Grant check (active consent grant must exist)
 *
 * ALL FOUR MUST PASS - no shortcuts
 */
export interface AccessCheckParams {
  caseId: string;
  officerId: string;
  role: 'police' | 'lawyer' | 'admin';
  purpose: string; // 'police_share' | 'lawyer_share' | 'analysis'
  requestedFields: string[]; // What they're trying to access
}

export interface AccessCheckResult {
  approved: boolean;
  reason: string;
  failedAt?: 'DESIGNATION' | 'ROLE_SCOPE' | 'POLICY' | 'GRANT'; // Which level failed
  designationId?: string; // If passed level 1
  redactions: string[]; // Fields that are redacted
}

/**
 * LEVEL 1: Check if officer is designated for this case
 * This is IMMUTABLE - only an admin can revoke
 */
export function checkDesignation(
  caseId: string,
  officerId: string,
  designations: OfficerDesignation[]
): { passed: boolean; designation?: OfficerDesignation; reason: string } {
  const designation = designations.find(
    (d) => d.caseId === caseId && d.officerId === officerId && d.status === 'active'
  );

  if (!designation) {
    return {
      passed: false,
      reason: `Officer ${officerId} is not designated for case ${caseId}`,
    };
  }

  if (designation.expiresAt && new Date(designation.expiresAt) < new Date()) {
    return {
      passed: false,
      reason: `Officer designation expired on ${designation.expiresAt}`,
    };
  }

  return { passed: true, designation, reason: 'Designation verified' };
}

/**
 * LEVEL 2: Check if role scope allows this access purpose
 */
export function checkRoleScope(
  role: 'police' | 'lawyer' | 'admin',
  purpose: string,
  designation: OfficerDesignation
): { passed: boolean; reason: string } {
  // Admin can do anything
  if (role === 'admin') {
    return { passed: true, reason: 'Admin role unrestricted' };
  }

  // Police can access police_share & analysis
  if (role === 'police' && ['police_share', 'analysis'].includes(purpose)) {
    return { passed: true, reason: `Police role allows ${purpose}` };
  }

  // Lawyer can access lawyer_share & analysis
  if (role === 'lawyer' && ['lawyer_share', 'analysis'].includes(purpose)) {
    return { passed: true, reason: `Lawyer role allows ${purpose}` };
  }

  return {
    passed: false,
    reason: `Role ${role} cannot access purpose ${purpose}`,
  };
}

/**
 * Build complete waterproof access result
 */
export function buildAccessCheckResult(params: {
  caseId: string;
  officerId: string;
  role: 'police' | 'lawyer' | 'admin';
  purpose: string;
  designations: OfficerDesignation[];
  grants?: any[]; // Will be checked in Express middleware
}): AccessCheckResult {
  // LEVEL 1: Designation check
  const designationCheck = checkDesignation(params.caseId, params.officerId, params.designations);
  if (!designationCheck.passed) {
    return {
      approved: false,
      reason: designationCheck.reason,
      failedAt: 'DESIGNATION',
      redactions: [],
    };
  }

  // LEVEL 2: Role scope check
  const roleCheck = checkRoleScope(params.role, params.purpose, designationCheck.designation!);
  if (!roleCheck.passed) {
    return {
      approved: false,
      reason: roleCheck.reason,
      failedAt: 'ROLE_SCOPE',
      redactions: [],
    };
  }

  // Levels 3 & 4 are checked in Express middleware (consentMiddleware)
  // This function returns a passing result that must be verified by backend

  return {
    approved: true,
    designationId: designationCheck.designation!.designationId,
    reason: 'Designation and role scope verified. Pending policy and grant checks.',
    redactions: [],
  };
}

/**
 * Check if request field is in officer's allowed scope
 */
export function isFieldAllowed(
  field: string,
  designation: OfficerDesignation,
  role: 'police' | 'lawyer' | 'admin'
):boolean {
  // Admin can access all fields
  if (role === 'admin') return true;

  // Police can access victim_media, timeline, evidence
  if (role === 'police') {
    return [
      'victimUniqueId',
      'timeline',
      'evidenceSummary',
      'integrity',
      'region',
      'caseNumber',
    ].includes(field);
  }

  // Lawyer can access everything police can + legal notes
  if (role === 'lawyer') {
    return [
      'victimUniqueId',
      'timeline',
      'evidenceSummary',
      'integrity',
      'region',
      'caseNumber',
      'assistants.lawyerNotes',
      'emotionalInsights',
    ].includes(field);
  }

  return false;
}
