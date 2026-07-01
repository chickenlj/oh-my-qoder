/**
 * OMQ Stub Hook Script
 * Placeholder that reads stdin and exits cleanly.
 * Replace with actual implementation.
 */
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => { process.exit(0); });
setTimeout(() => { process.exit(0); }, 3000);
