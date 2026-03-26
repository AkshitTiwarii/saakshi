# Saakshi Blockchain Integrity Design

## Principle
Do not store raw testimony on-chain. Store cryptographic proofs only.

## Evidence Integrity Flow
1. Generate SHA-256 hash of encrypted evidence blob
2. Generate hash of metadata snapshot:
   - case id
   - uploader id (pseudonymous id)
   - timestamp
   - consent version
   - device attestation id
3. Build Merkle tree for batch submission
4. Anchor Merkle root and batch manifest hash on permissioned blockchain
5. Store chain tx id and proof bundle in Evidence Vault

## Verification Package (for court)
- evidence hash
- metadata hash
- Merkle proof path
- blockchain transaction id
- signer certificate chain
- verification script output

## Recommended Network
- Permissioned EVM (Hyperledger Besu / Quorum)
- Consortium governance with legal stakeholders

## Smart Contract Scope
- append-only anchor registry
- no mutable update path
- signer role controls
- event emission for external audit indexers

## Chain of Custody
- every access event logged off-chain in immutable audit log
- periodic anchor of audit-log digest to chain
- export includes both evidence proof and access proof

## Legal Readiness Notes
- hash anchoring proves integrity, not truthfulness
- preserve timezone and clock-source provenance
- maintain documented verification SOP for courts
