import { runAllAcceptanceTests } from './specVerification';

async function main() {
  console.log('================================================================================');
  console.log(' NARAYANA PRODIGY CRM - MASTER ACCEPTANCE TEST SUITE (T1 to T23)');
  console.log(' Specification Verification & 50,000-Enrollment Benchmark Runner');
  console.log('================================================================================\n');

  const report = await runAllAcceptanceTests();

  report.results.forEach((r, idx) => {
    const symbol = r.status === 'PASS' ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${symbol} ${r.id.padEnd(4)}: ${r.name}`);
    console.log(`   └─ Duration: ${r.durationMs}ms | Details: ${r.details}`);
  });

  console.log('\n================================================================================');
  console.log(` EXECUTION SUMMARY: ${report.passed}/${report.results.length} PASSED (${report.failed} FAILED) in ${report.totalDurationMs}ms`);
  console.log('================================================================================');

  if (report.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
