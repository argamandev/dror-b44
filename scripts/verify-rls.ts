// Privacy verification (scripted half) — run with:
//   cat scripts/verify-rls.ts | npx base44 exec
//
// Proves, from the currently-authenticated account (the founder's demo account):
//   (a) Patients visible to this account are exactly the seeded/known set.
//   (b) Entry.filter with a nonexistent patient_id returns empty.
//   (c) Reading a Patient by a fabricated id returns nothing (throws/empty).
//   (d) Ownership stamping: a sample patient's created_by* matches this user.
//
// HONEST LIMITATION: this script only proves scoped-reads + ownership
// stamping from a SINGLE account. It cannot prove cross-account isolation
// (that a *different* therapist's account sees none of this data) because
// that requires a second live Base44 account — a separate two-account check
// from the founder's phone covers that, per the controller's resolution.

async function main() {
  const me = await base44.auth.me();
  console.log(`Current user: ${me?.email ?? '(unknown)'} (id=${me?.id ?? '(unknown)'})`);

  // (a) Patients visible to the current user
  const patients = await base44.entities.Patient.list();
  console.log(`\n(a) Patients visible to current user: ${patients.length}`);
  for (const p of patients) {
    console.log(`    - ${p.first_name} ${p.last_name ?? ''} (id=${p.id})`);
  }

  // (b) Entry.filter with a nonexistent patient_id
  const FAKE_PATIENT_ID = 'nonexistent-patient-id-000000000000';
  const entriesForFake = await base44.entities.Entry.filter({ patient_id: FAKE_PATIENT_ID });
  console.log(`\n(b) Entry.filter({ patient_id: '${FAKE_PATIENT_ID}' }) -> ${entriesForFake.length} result(s) (expected 0)`);

  // (c) Read a Patient by a fabricated id
  const FAKE_ID = '000000000000000000000000';
  console.log(`\n(c) Patient.get('${FAKE_ID}') (fabricated id):`);
  try {
    const r = await base44.entities.Patient.get(FAKE_ID);
    console.log(`    UNEXPECTED: returned a record -> ${JSON.stringify(r)}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`    threw as expected (no record / not readable): ${msg}`);
  }

  // (d) Ownership stamping on a sample patient
  console.log('\n(d) Ownership stamping on a sample patient:');
  if (patients.length > 0) {
    const sample = patients[0] as unknown as Record<string, unknown>;
    const createdBy = sample.created_by as string | undefined;
    const createdById = sample.created_by_id as string | undefined;
    console.log(`    sample patient       : ${sample.first_name} ${sample.last_name ?? ''}`);
    console.log(`    sample.created_by    : ${JSON.stringify(createdBy)}`);
    console.log(`    sample.created_by_id : ${JSON.stringify(createdById)}`);
    console.log(`    current user.email   : ${me?.email}`);
    console.log(`    current user.id      : ${me?.id}`);
    if (createdBy) {
      console.log(`    MATCH (created_by === user.email): ${createdBy === me?.email}`);
    } else {
      console.log(
        "    NOTE: this app's Patient API responses do not populate/return the 'created_by' " +
          "(email) field — only 'created_by_id' is present, despite the SDK docs listing " +
          "'created_by' as a server field. Falling back to id comparison as the ownership proof."
      );
      console.log(`    MATCH (created_by_id === user.id): ${createdById === me?.id}`);
    }
  } else {
    console.log('    No patients found — cannot verify ownership stamping.');
  }

  console.log(
    '\nSCOPE OF THIS SCRIPT: proves ownership stamping + RLS-scoped reads for the CURRENT ' +
      'account only. Full cross-account isolation (a SECOND account seeing none of this data) ' +
      'is NOT exercised here and requires a live two-account check.'
  );
}

await main();
