# E2E Test Infra: Supply Chain System V2 (Delivery Management)

## Test Philosophy
- **Opaque-box & Requirement-driven**: Tests interact solely via public HTTP endpoints (`/api/*`), CLI tools (`tools/*.mjs`), and database state under `BACKEND=pg` and SQLite.
- **Methodology**: Systematic 4-tier testing: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- **Environment**: Node.js native test runner (`node --test`), supporting both SQLite (`BACKEND=local`) and PostgreSQL (`BACKEND=pg` with PGlite socket server or live PostgreSQL).

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | R1: Row-Level Team Scoping | ORIGINAL_REQUEST §R1, §Acceptance Criteria | 5 | 5 | ✓ |
| 2 | R2: Media Attachment Migration | ORIGINAL_REQUEST §R2, §Acceptance Criteria | 5 | 5 | ✓ |
| 3 | R3: Zoho Books/Inventory API Audits | ORIGINAL_REQUEST §R3, §Acceptance Criteria | 5 | 5 | ✓ |
| 4 | R4: Database Export & Deployment Setup | ORIGINAL_REQUEST §R4, §Acceptance Criteria | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner Command**:
  ```powershell
  node --test tests/e2e/tier1-feature-coverage.test.js tests/e2e/tier2-boundary-corner.test.js tests/e2e/tier3-cross-feature.test.js tests/e2e/tier4-real-world.test.js
  ```
- **Pass/Fail Semantics**: All test suites must finish with exit code 0 and zero failed assertions.
- **Directory Layout**:
  - `tests/e2e/helpers/e2e-harness.mjs`: Ephemeral port server lifecycle, PGlite socket boot, user seeding, and auth client.
  - `tests/e2e/helpers/books-mock.mjs`: Lightweight mock server for Zoho Books & Inventory API contracts.
  - `tests/e2e/tier1-feature-coverage.test.js`: 20 tests (5 per requirement: R1, R2, R3, R4).
  - `tests/e2e/tier2-boundary-corner.test.js`: 20 tests (5 per requirement: R1, R2, R3, R4).
  - `tests/e2e/tier3-cross-feature.test.js`: 12 tests (cross-feature interactions).
  - `tests/e2e/tier4-real-world.test.js`: 5 scenarios (realistic multi-step workflows).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | S4-01: Field Worker Daily Route Lifecycle | R1 (Scoping), R2 (Media), Auto-Completion Sync | High |
| 2 | S4-02: Defective Item Field Return & Inventory Restocking | R1 (Scoping), R2 (Media), R3 (Books/Inventory) | High |
| 3 | S4-03: Full Media Migration, DR Backup & Integrity Export | R2 (Migration), R4 (DB Export & Verification) | High |
| 4 | S4-04: Concurrent Multi-Team Dispatch & Cross-Tenant Isolation | R1 (Scoping), R2 (Media), R4 (DB Concurrency) | High |
| 5 | S4-05: CMS Inbound Schedule Request to Shipment & Drift Detection | R1 (Scoping), R3 (Inventory), Drift Exceptions | High |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: 20 tests (5 per feature across R1, R2, R3, R4)
- **Tier 2 (Boundary & Corner Cases)**: 20 tests (5 per feature across R1, R2, R3, R4)
- **Tier 3 (Cross-Feature Combinations)**: 12 tests (pairwise interaction coverage)
- **Tier 4 (Real-World Scenarios)**: 5 end-to-end multi-step application scenarios
- **Total E2E Suite**: 57 comprehensive automated test cases
